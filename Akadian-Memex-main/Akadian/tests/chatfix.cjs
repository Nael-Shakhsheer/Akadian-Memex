const { chromium } = require('playwright');
const assert = require('node:assert/strict');

// Follow-up chat resilience: busy servers, per-minute and daily quota errors, oversized context,
// the light-thinking setting, and cut-off answers. Gemini is mocked; no real keys are used.
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const c = await browser.newContext();
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));

  const BRIEF = 'TITLE: Test Brief\nVERDICT: Plausible | 7\n## Summary\nA useful idea.';
  const ok = text => ({ status: 200, json: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] } });
  const err = (status, message, details) => ({ status, json: { error: { code: status, message, details } } });
  let queue = [], reqs = [];
  await c.route('https://generativelanguage.googleapis.com/**', r => {
    const body = r.request().postDataJSON();
    if (String(r.request().url()).includes('/models?')) return r.fulfill({ json: { models: [] } });
    if (JSON.stringify(body.systemInstruction || '').includes('research analyst')) return r.fulfill(ok(BRIEF));
    reqs.push(body);
    const next = queue.shift();
    return r.fulfill(next ? (typeof next === 'function' ? next(body) : next) : ok('Default answer.'));
  });

  await p.goto(process.env.BASE || 'http://localhost:8765');
  for (let n = 0; n < 3; n++) await p.locator('#introNext').click();
  await p.locator('#settingsBtn').click();
  await p.locator('#apiKey').fill('fake-test-key');
  await p.locator('#searchMode').selectOption('none');
  await p.locator('#saveSettings').click();
  await p.locator('#ideaInput').fill('A private solar garden idea');
  await p.locator('#sendBtn').click();
  await p.locator('.doc').waitFor();
  assert.equal(await p.evaluate(() => settings.model), 'gemini-3.6-flash');

  const settle = () => p.waitForFunction(() => !chatBusy.has(currentId), null, { timeout: 60000 });
  const ask = async text => { await p.locator('#chatInput').fill(text); await p.locator('#chatForm button').click(); await settle(); };
  const chatLen = () => p.evaluate(() => byId(currentId).chat.length);
  const toastText = () => p.locator('#toast').textContent();

  // 1. "High demand": the request is retried on its own instead of showing an error.
  queue = [err(503, 'This model is currently experiencing high demand.'), ok('Answer after a busy spell.')];
  await ask('What would this cost?');
  assert.equal(await chatLen(), 2, 'busy: answer arrives after the automatic retry');
  assert.equal(reqs.length, 2, 'busy: exactly one retry');
  assert(!(await toastText()).includes('failed'), 'busy: no error shown');

  // 2. Per-minute token limit: wait for the suggested delay, show a note, then continue.
  reqs = [];
  queue = [err(429, 'Quota exceeded for metric generate_content_free_tier_input_token_count', [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateContentInputTokensPerModelPerMinute-FreeTier' }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1s' }]), ok('Answer after the minute limit cleared.')];
  await p.locator('#chatInput').fill('How could I make it cheaper?');
  await p.locator('#chatForm button').click();
  await p.waitForFunction(() => document.querySelector('#chatNote')?.textContent.includes('Continuing automatically'), null, { timeout: 15000 });
  await settle();
  assert.equal(await chatLen(), 4, 'per-minute: answer arrives once the limit clears');
  assert.equal(reqs.length, 2);
  assert.equal(await p.locator('#chatNote').textContent(), '', 'per-minute: note cleared afterwards');

  // 3. Daily limit: no pointless waiting; a clear message; the question is kept and history stays clean.
  reqs = [];
  queue = [err(429, 'Quota exceeded for metric generate_content_free_tier_requests', [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '20s' }])];
  await ask('Will this survive the daily limit?');
  assert.equal(reqs.length, 1, 'daily: no retry');
  assert.equal(await chatLen(), 4, 'daily: dangling question removed from history');
  const t = await toastText();
  assert(t.includes('used today') || t.includes('today’s free'), 'daily: says the daily allowance is used: ' + t);
  assert(t.includes('resets'), 'daily: says when it resets');
  assert.equal(await p.locator('#chatInput').inputValue(), 'Will this survive the daily limit?', 'daily: question kept in the box');

  // 4. Oversized context is trimmed and starts with a user turn; the request stays bounded.
  reqs = []; queue = [];
  await p.evaluate(() => { const i = byId(currentId); i.doc.markdown = 'word '.repeat(40000); i.chat = Array.from({ length: 30 }, (_, n) => ({ role: n % 2 ? 'model' : 'user', text: 'x'.repeat(4000) + n })); });
  await ask('Summarise the risks.');
  const sent = reqs.at(-1), sysLen = sent.systemInstruction.parts[0].text.length;
  const histChars = sent.contents.reduce((n, m) => n + m.parts[0].text.length, 0);
  assert(sysLen < 20000, 'context: brief trimmed (' + sysLen + ')');
  assert(sent.systemInstruction.parts[0].text.includes('[…trimmed]'));
  assert(histChars <= 30000 + 4100, 'context: history bounded (' + histChars + ')');
  assert.equal(sent.contents[0].role, 'user', 'context: opens with a user turn');
  assert.equal(sent.contents.at(-1).parts[0].text, 'Summarise the risks.');

  // 5. Light thinking is requested for Gemini 3; a model that rejects it is retried without.
  reqs = [];
  queue = [err(400, 'Unknown field: thinkingConfig is not supported for this model (thinking).'), ok('Answer without the thinking setting.')];
  await ask('Any legal issues?');
  assert.equal(reqs[0].generationConfig?.thinkingConfig?.thinkingLevel, 'low', 'thinking: low requested first');
  assert.equal(reqs[1].generationConfig?.thinkingConfig, undefined, 'thinking: retried without it');
  assert((await p.evaluate(() => byId(currentId).chat.at(-1).text)).includes('without the thinking'));

  // 6. Cut-off and empty-at-limit answers are explained instead of being silent or misleading.
  queue = [{ status: 200, json: { candidates: [{ content: { parts: [{ text: 'A long answer that was cut' }] }, finishReason: 'MAX_TOKENS' }] } }];
  await ask('Explain everything.');
  assert((await p.evaluate(() => byId(currentId).chat.at(-1).text)).includes('cut off'), 'partial answer flagged');
  const before = await chatLen();
  queue = [{ status: 200, json: { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] } }];
  await ask('And now?');
  assert((await toastText()).includes('ran out of its output allowance'), 'empty MAX_TOKENS explained: ' + await toastText());
  assert.equal(await chatLen(), before, 'empty answer leaves no dangling question');

  // 7. The comparison chat uses the same light-thinking, bounded requests.
  await p.locator('#newBtn').click();
  await p.locator('#ideaInput').fill('A second idea');
  await p.locator('#sendBtn').click();
  await p.locator('.doc').waitFor();
  await p.locator('#compareBtn').click();
  reqs = []; queue = [];
  await p.locator('#compareQuestion').fill('Which is cheaper to start?');
  await p.locator('#compareAsk').click();
  await p.waitForFunction(() => document.querySelectorAll('#compareChatLog .chat-turn').length === 2, null, { timeout: 30000 });
  assert.equal(reqs.at(-1).generationConfig?.thinkingConfig?.thinkingLevel, 'low', 'compare: light thinking');

  assert.deepEqual(errors, [], 'no page errors: ' + errors.join('; '));
  console.log('PASS follow-up chat: busy retry, per-minute wait, daily message, kept question, context limits, thinking fallback, cut-off answers, comparison');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
