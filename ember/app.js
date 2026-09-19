'use strict';

/* =====================================================================
   Ember – capture an idea by voice or text, get a researched brief.
   Everything runs in the browser. Ideas are stored in IndexedDB on the
   device; the only network calls go to Google's Gemini API using the
   user's own API key.
   ===================================================================== */

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const isCoarse = matchMedia('(pointer: coarse)').matches;

const ICONS = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l5 5L19 7"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  print: '<path d="M7 9V3h10v6M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="7"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>'
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); el.removeAttribute('data-icon'); });
}

let toastTimer;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- settings (localStorage, best effort) ---------- */
// Google Search grounding (how Ember finds and cites sources) is only free on Gemini 2.5 Flash / Flash-Lite;
// the 3.x models need a billing-enabled key for it.
const DEFAULT_MODEL = 'gemini-2.5-flash';
let settings = { apiKey: '', model: DEFAULT_MODEL };
try { Object.assign(settings, JSON.parse(localStorage.getItem('ember.settings') || '{}')); } catch { /* private mode etc. */ }
function saveSettings() { try { localStorage.setItem('ember.settings', JSON.stringify(settings)); } catch { /* ignore */ } }
if (!settings.model) settings.model = DEFAULT_MODEL;
if (settings.v !== 2) {                       // one-time migration: 3.6 was the old (free-tier-incompatible) default
  if (settings.model === 'gemini-3.6-flash') settings.model = DEFAULT_MODEL;
  settings.v = 2; saveSettings();
}

/* ---------- storage (IndexedDB) ---------- */
const DB_NAME = 'ember', STORE = 'ideas';
let dbp;
function db() {
  return dbp || (dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}
const dbAll = () => tx('readonly', s => s.getAll());
const dbPut = idea => tx('readwrite', s => s.put(idea));
const dbDel = id => tx('readwrite', s => s.delete(id));
const dbClear = () => tx('readwrite', s => s.clear());

/* ---------- state ---------- */
let ideas = [];               // newest first
let currentId = null;         // null = "new idea" screen
let filter = '';
const byId = id => ideas.find(i => i.id === id);
const PENDING = ['pending-transcript', 'pending-research'];
const BUSY = ['transcribing', 'researching'];

async function persist(idea) { idea.updatedAt = Date.now(); await dbPut(idea); }
async function setStatus(idea, status, extra = {}) {
  Object.assign(idea, { status }, extra);
  await persist(idea);
  refresh(idea.id);
}

/* ---------- markdown (small, safe renderer) ---------- */
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\{\{cite:([\d,]+)\}\}/g, (_, n) =>
    '<sup class="cite">' + n.split(',').map(x => `<a href="#src-${x}" data-src="${x}">${x}</a>`).join('') + '</sup>');
  return s;
}

function renderList(items) {
  let html = '';
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
    const top = stack[stack.length - 1];
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? 'ol' : 'ul';
      html += `<${tag}><li>`; stack.push({ indent: it.indent, tag });
    } else html += '</li><li>';
    html += inline(it.text);
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

function md(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  const isBlockStart = l => /^(#{1,4})\s/.test(l) || /^\s*([-*•]|\d+[.)])\s+/.test(l) || /^>/.test(l) || /^-{3,}\s*$/.test(l) || /^\s*\|/.test(l);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (!l.trim()) { i++; continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const lv = Math.max(2, m[1].length); out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); i++; continue; }
    if (/^-{3,}\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>/.test(l)) {
      const q = [];
      while (i < lines.length && /^>/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`); continue;
    }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(l); i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push('<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if ((m = l.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/))) {
      const items = [];
      while (i < lines.length && (m = lines[i].match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/))) {
        items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: m[3] }); i++;
      }
      out.push(renderList(items)); continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) p.push(lines[i++].trim());
    if (!p.length) { p.push(lines[i++].trim()); }
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}
const plainCites = s => s.replace(/\{\{cite:([\d,]+)\}\}/g, (_, n) => n.split(',').map(x => `[${x}]`).join(''));

/* ---------- voice recorder → 16 kHz mono WAV ----------
   Recording raw PCM (instead of MediaRecorder) gives one format that
   works identically on iOS Safari, the home-screen app, Android and desktop,
   and is a format Gemini accepts. */
class Recorder {
  async start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !navigator.mediaDevices?.getUserMedia) throw new Error('Recording is not supported in this browser.');
    this.ctx = new AC();                       // create inside the tap so iOS allows audio
    try { await this.ctx.resume(); } catch { /* ignore */ }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (e) { this.ctx.close(); throw e; }
    this.chunks = [];
    this.rate = this.ctx.sampleRate;
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.proc.onaudioprocess = e => this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    const mute = this.ctx.createGain(); mute.gain.value = 0;
    src.connect(this.proc); this.proc.connect(mute); mute.connect(this.ctx.destination);
    this.startedAt = Date.now();
  }
  _teardown() {
    try { this.proc.disconnect(); this.proc.onaudioprocess = null; } catch { /* ignore */ }
    this.stream?.getTracks().forEach(t => t.stop());
    try { this.ctx.close(); } catch { /* ignore */ }
  }
  cancel() { this._teardown(); this.chunks = []; }
  stop() {
    this._teardown();
    const n = this.chunks.reduce((a, c) => a + c.length, 0);
    const all = new Float32Array(n);
    let o = 0; for (const c of this.chunks) { all.set(c, o); o += c.length; }
    this.chunks = [];
    const seconds = n / this.rate;
    return { blob: encodeWav(downsample(all, this.rate, 16000), 16000), seconds };
  }
}
function downsample(buf, from, to) {
  if (from <= to) return buf;
  const ratio = from / to, len = Math.floor(buf.length / ratio), out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const a = Math.floor(i * ratio), b = Math.min(buf.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = a; j < b; j++) sum += buf[j];
    out[i] = sum / Math.max(1, b - a);
  }
  return out;
}
function encodeWav(samples, rate) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}
const blobToBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

/* ---------- Gemini ---------- */
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function gemini(body) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* not json */ }
    throw new ApiError(res.status, friendlyApiError(res.status, msg));
  }
  return res.json();
}
function friendlyApiError(status, msg) {
  if (status === 400 && /api key/i.test(msg)) return 'Google rejected the API key. Check it in Settings.';
  if (status === 401 || status === 403) return 'The API key was not accepted (' + (msg || status) + '). Check it in Settings.';
  if (status === 404) return 'Model “' + settings.model + '” was not found. Pick another model in Settings.';
  if (status === 429) {
    const free = /^gemini-2\.5-flash(-lite)?$/.test(settings.model);
    return free
      ? 'Google says the quota for “' + settings.model + '” is used up' + (msg ? ' (' + msg.slice(0, 200) + ')' : '') + '. Wait a minute, or until tomorrow if it’s the daily limit, then retry.'
      : 'Google refused “' + settings.model + '” with a quota error' + (msg ? ' (' + msg.slice(0, 200) + ')' : '') +
        '. On the free tier, research with web sources only works with Gemini 2.5 Flash or 2.5 Flash-Lite. Switch the model in Settings, then retry.';
  }
  if (status >= 500) return 'Google’s servers are busy right now. Retry in a moment.';
  return msg || 'Request failed (' + status + ').';
}
function textOf(data) {
  const cand = data.candidates?.[0];
  const txt = (cand?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
  if (!txt.trim()) {
    const why = data.promptFeedback?.blockReason || cand?.finishReason || 'empty response';
    throw new ApiError(0, 'The model returned no text (' + why + '). Try again.');
  }
  return txt;
}

async function transcribe(blob) {
  const data = await gemini({
    contents: [{ role: 'user', parts: [
      { text: 'Transcribe this voice note exactly, in the language spoken. Remove filler words and false starts only. Output the transcript alone with no commentary. If there is no intelligible speech, output exactly: [no speech]' },
      { inline_data: { mime_type: 'audio/wav', data: await blobToBase64(blob) } }
    ] }]
  });
  const t = textOf(data).trim();
  return /^\[?no speech\]?$/i.test(t) ? '' : t;
}

const SYSTEM_PROMPT = `You are a sharp, candid research analyst helping someone decide whether a raw idea is worth pursuing. The idea was captured quickly, possibly by voice, so it may be rough or ambiguous: adopt the most reasonable interpretation (state it in one short line if it matters) and never ask questions. Reply in the same language as the idea.

Use Google Search to ground everything factual: existing products and prior art, market size and demand, technical feasibility, costs, regulation, and realistic timelines. Prefer primary and reputable sources. Never invent facts, statistics or sources; if evidence is thin, say so plainly. Be honest: concluding that an idea is a long shot is a valid, useful answer.

The brief must fit on 1–2 pages (roughly 700–900 words). Be specific and concrete. No filler, no generic advice, no hedging boilerplate.

Output exactly this structure in Markdown, with no preamble and no closing remarks:

TITLE: <specific name for the idea, max 6 words>
VERDICT: <Promising | Plausible | Risky | Long shot> | <integer feasibility score 1-10>

## Summary
2–3 sentences: what the idea is, your verdict, and the single biggest reason for it.

## Plausibility
Is it feasible and is there demand? Cover who already does something similar and what gap remains.

## Early challenges
Bullets. Each: **challenge** — why it matters.

## Approaches
2–3 concrete ways to build it. Put the recommended one first and say why.

## Solutions to the challenges
Map each early challenge to a concrete mitigation.

## Timeline
Realistic phases (e.g. **Weeks 1–2 — …**). State the team-size/effort assumption first.

## Future challenges
Obstacles likely to appear after launch or at scale.

## First step
One concrete thing to do in the first hour.

Do not write a sources section and do not add your own citation numbers; citations are attached automatically.`;

async function research(text) {
  const data = await gemini({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: 'The idea:\n"""\n' + text + '\n"""\n\nWrite the research brief.' }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.4 }
  });
  return buildDoc(textOf(data), data.candidates?.[0]?.groundingMetadata);
}

/* Turn Gemini's grounding metadata into numbered inline citations + a source list. */
function buildDoc(raw, gm) {
  const sources = [], chunkToSrc = {};
  (gm?.groundingChunks || []).forEach((c, idx) => {
    const w = c.web; if (!w?.uri) return;
    let n = sources.findIndex(s => s.uri === w.uri);
    if (n < 0) { sources.push({ uri: w.uri, title: w.title || new URL(w.uri).hostname }); n = sources.length - 1; }
    chunkToSrc[idx] = n + 1;
  });

  let body = raw;
  const supports = (gm?.groundingSupports || []).filter(s => s.segment && typeof s.segment.endIndex === 'number');
  if (supports.length && sources.length) {
    const enc = new TextEncoder(), dec = new TextDecoder(), bytes = enc.encode(raw);
    // Offsets are documented as UTF-8 byte offsets. Verify against segment.text and fall back to
    // character offsets if that fits better, so we never garble text.
    const score = mode => supports.filter(s => {
      const { startIndex = 0, endIndex, text } = s.segment;
      if (!text) return false;
      const got = mode === 'bytes' ? dec.decode(bytes.slice(startIndex, endIndex)) : raw.slice(startIndex, endIndex);
      return got === text;
    }).length;
    const b = score('bytes'), c = score('chars');
    const mode = b >= c ? 'bytes' : 'chars';
    if (Math.max(b, c) >= supports.length / 2) {
      const marks = {};
      for (const s of supports) {
        const nums = [...new Set((s.groundingChunkIndices || []).map(i => chunkToSrc[i]).filter(Boolean))].sort((x, y) => x - y);
        if (!nums.length) continue;
        const at = s.segment.endIndex;
        marks[at] = [...new Set([...(marks[at] || []), ...nums])].sort((x, y) => x - y);
      }
      const points = Object.keys(marks).map(Number).sort((x, y) => x - y);
      let out = '', last = 0;
      const slice = (a, z) => mode === 'bytes' ? dec.decode(bytes.slice(a, z)) : raw.slice(a, z);
      const len = mode === 'bytes' ? bytes.length : raw.length;
      for (const p of points) {
        if (p > len || p < last) continue;
        out += slice(last, p) + `{{cite:${marks[p].join(',')}}}`; last = p;
      }
      body = out + slice(last, len);
    }
  }

  const title = (body.match(/^\s*TITLE:\s*(.+)$/mi) || [])[1]?.replace(/\{\{cite:[\d,]+\}\}/g, '').replace(/[*_`#]/g, '').trim();
  const vm = body.match(/^\s*VERDICT:\s*([^|\n]+?)\s*\|\s*(\d+(?:\.\d+)?)/mi);
  const markdown = body.replace(/^\s*(TITLE|VERDICT):.*$/gmi, '').trim();
  return {
    markdown,
    title: title || '',
    verdict: vm ? vm[1].replace(/[*_`]/g, '').trim() : '',
    score: vm ? Math.max(1, Math.min(10, Math.round(parseFloat(vm[2])))) : null,
    sources,
    queries: gm?.webSearchQueries || [],
    searchWidget: gm?.searchEntryPoint?.renderedContent || '',
    model: settings.model,
    generatedAt: Date.now()
  };
}

/* ---------- pipeline: save first, process whenever possible ---------- */
let processing = false;
const canProcess = () => navigator.onLine && !!settings.apiKey;

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (canProcess()) {
      const next = [...ideas].reverse().find(i => PENDING.includes(i.status));   // oldest first
      if (!next) break;
      await processIdea(next);
      if (PENDING.includes(next.status)) break;    // went back to waiting (offline): stop looping
    }
  } finally { processing = false; refresh(); }
}

async function processIdea(idea) {
  let stage = idea.status === 'pending-transcript' ? 'transcript' : 'research';
  try {
    if (stage === 'transcript') {
      await setStatus(idea, 'transcribing', { error: '' });
      const text = await transcribe(idea.audio);
      if (!text) throw new ApiError(0, 'No speech was detected in the recording.');
      idea.text = text;
      stage = 'research';
      await setStatus(idea, 'pending-research');
    }
    await setStatus(idea, 'researching', { startedAt: Date.now(), error: '' });
    const doc = await research(idea.text);
    idea.doc = doc;
    idea.title = doc.title || idea.title || '';
    await setStatus(idea, 'done');
  } catch (e) {
    const offline = e instanceof TypeError || !navigator.onLine;      // fetch network failure
    if (offline) await setStatus(idea, stage === 'transcript' ? 'pending-transcript' : 'pending-research');
    else await setStatus(idea, 'error', { error: e.message || String(e), errorStage: stage, authError: e instanceof ApiError && [400, 401, 403, 404, 429].includes(e.status) });
  }
}

/* ---------- ideas ---------- */
async function createIdea({ text = '', audio = null, seconds = 0 }) {
  const idea = {
    id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    title: '', text, audio, seconds,
    status: audio ? 'pending-transcript' : 'pending-research', error: '', doc: null
  };
  await dbPut(idea);                       // the important part: the idea is safe before anything else happens
  ideas.unshift(idea);
  go(idea.id);
  refresh();
  if (!settings.apiKey) toast('Saved. Add an API key in Settings to get the research brief.', 4500);
  processQueue();
  return idea;
}

async function deleteIdea(id) {
  await dbDel(id);
  ideas = ideas.filter(i => i.id !== id);
  if (audioUrls.has(id)) { URL.revokeObjectURL(audioUrls.get(id)); audioUrls.delete(id); }
  if (currentId === id) go(null);
  refresh();
}
function retryIdea(idea) {
  const toTranscript = idea.audio && !idea.text;
  setStatus(idea, toTranscript ? 'pending-transcript' : 'pending-research', { error: '' }).then(() => {
    if (!settings.apiKey) { openSettings(); return; }
    processQueue();
  });
}

/* ---------- routing ---------- */
function go(id) { currentId = id; location.hash = id ? '#/i/' + id : '#/new'; }
function readHash() {
  const m = location.hash.match(/^#\/i\/(.+)$/);
  currentId = m && byId(m[1]) ? m[1] : null;
  closeNav();
  refresh();
}
window.addEventListener('hashchange', readHash);

/* ---------- rendering ---------- */
const audioUrls = new Map();
const audioUrl = idea => {
  if (!idea.audio) return '';
  if (!audioUrls.has(idea.id)) audioUrls.set(idea.id, URL.createObjectURL(idea.audio));
  return audioUrls.get(idea.id);
};
const label = idea => idea.title || (idea.text ? idea.text.replace(/\s+/g, ' ').slice(0, 60) : (idea.audio ? 'Voice note' : 'Untitled idea'));

function group(ts) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const days = Math.floor((d0 - new Date(ts).setHours(0, 0, 0, 0)) / 864e5);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 8 ? 'Previous 7 days' : days < 31 ? 'Previous 30 days' : 'Older';
}

function renderSidebar() {
  const list = $('#ideaList');
  const q = filter.trim().toLowerCase();
  const shown = ideas.filter(i => !q || (label(i) + ' ' + i.text + ' ' + (i.doc?.markdown || '')).toLowerCase().includes(q));
  if (!shown.length) { list.innerHTML = `<div class="empty-list">${ideas.length ? 'No matches.' : 'Your ideas will appear here.'}</div>`; return; }
  let html = '', last = '';
  for (const i of shown) {
    const g = group(i.createdAt);
    if (g !== last) { html += `<div class="group-label">${g}</div>`; last = g; }
    const ind = BUSY.includes(i.status) ? '<span class="spin" title="Working"></span>'
      : `<span class="dot ${i.status === 'done' ? 'done' : i.status === 'error' ? 'error' : ''}" title="${esc(i.status)}"></span>`;
    html += `<button class="idea-item ${i.id === currentId ? 'active' : ''}" data-id="${i.id}">${ind}<span class="t">${esc(label(i))}</span></button>`;
  }
  list.innerHTML = html;
}

function pendingNote(idea) {
  if (!settings.apiKey) return { head: 'Saved on this device', body: 'Add a Gemini API key to turn this idea into a research brief.', settings: true };
  if (!navigator.onLine) return { head: 'Saved — you’re offline', body: 'The research will start on its own as soon as you’re back online.' };
  return { head: 'Queued', body: 'Starting shortly…' };
}
const fmtWhen = ts => new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function renderMain() {
  const thread = $('#thread');
  const idea = currentId && byId(currentId);
  $('#topTitle').textContent = idea ? label(idea) : 'Ember';
  document.title = idea ? label(idea) + ' – Ember' : 'Ember – never lose an idea';

  if (!idea) {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) && !navigator.standalone;
    thread.innerHTML = `
      <section class="hero">
        <div class="glow"></div>
        <h1>What’s the idea?</h1>
        <p>Say it or type it. It’s saved the instant you hit send, then researched: plausibility, challenges, approach, timeline and sources.</p>
      </section>
      ${settings.apiKey ? '' : `<section class="card"><h3>Finish setup (about a minute)</h3>
        <p>Ember researches your ideas with Google’s Gemini, using your own API key. Your ideas are saved either way.</p>
        <div class="row"><button class="btn primary" data-act="guide">Show me how</button><button class="btn" data-act="settings">I already have a key</button></div></section>`}
      ${ios ? `<section class="card"><h3>Add Ember to your Home Screen</h3>
        <p>In Safari tap the Share button, then <b>Add to Home Screen</b>, so ideas are one tap away.</p></section>` : ''}`;
    return;
  }

  let html = `<div class="you">${idea.audio ? `<audio controls preload="none" src="${audioUrl(idea)}"></audio>` : ''}` +
    (idea.text ? `<div class="txt">${esc(idea.text)}</div>` : `<div class="pendingtxt">Voice note — transcript pending…</div>`) +
    `<div class="when">${fmtWhen(idea.createdAt)}</div></div>`;

  if (idea.status === 'done' && idea.doc) html += renderDoc(idea);
  else if (idea.status === 'transcribing') html += `<div class="card status"><span class="spin"></span><div class="msg"><b>Transcribing your voice note…</b><span>This takes a few seconds.</span></div></div>`;
  else if (idea.status === 'researching') html += `<div class="card status"><span class="spin"></span><div class="msg"><b>Researching <span data-since="${idea.startedAt || Date.now()}"></span></b><span>Searching the web for competitors, feasibility, costs and timelines. Keep this tab open; it usually takes 30–90 seconds.</span></div></div>`;
  else if (idea.status === 'error') html += `<div class="card status err"><div class="msg"><b>${idea.errorStage === 'transcript' ? 'Couldn’t transcribe' : 'Research didn’t finish'}</b><span>${esc(idea.error || 'Something went wrong.')}</span>
      <div class="btns"><button class="btn small primary" data-act="retry">${icon('refresh')}Retry</button>${idea.authError ? '<button class="btn small" data-act="settings">Open Settings</button>' : ''}<button class="btn small danger" data-act="delete">${icon('trash')}Delete</button></div></div></div>`;
  else { const n = pendingNote(idea); html += `<div class="card status"><div class="msg"><b>${n.head}</b><span>${n.body}</span>${n.settings ? '<div class="btns"><button class="btn small primary" data-act="guide">Set up my key</button></div>' : ''}</div></div>`; }

  if (idea.status !== 'done' && idea.status !== 'error') html += `<div class="actions"><button class="btn small danger" data-act="delete">${icon('trash')}Delete</button></div>`;
  thread.innerHTML = html;
  tickTimers();
}

function renderDoc(idea) {
  const d = idea.doc;
  const band = d.score == null ? '' : d.score >= 8 ? 'v-good' : d.score >= 6 ? 'v-ok' : d.score >= 4 ? 'v-risky' : 'v-long';
  const head = `<header class="doc-head ${band}">
      ${d.score != null ? `<div class="verdict ${band}"><b>${d.score}</b><span>/ 10</span></div>` : ''}
      <div><div class="vl">${esc(d.verdict || 'Research brief')}</div><h1>${esc(idea.title || label(idea))}</h1>
      <div class="meta">Research brief · ${esc(fmtWhen(d.generatedAt))} · ${esc(d.model)}</div></div></header>`;
  const src = d.sources.length ? `<section class="sources"><h2>Sources</h2><ol>${d.sources.map((s, n) =>
    `<li id="src-${n + 1}"><a href="${esc(s.uri)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ol>
    ${d.queries.length ? `<div class="queries">Searched: ${d.queries.map(esc).join(' · ')}</div>` : ''}
    ${d.searchWidget ? `<iframe class="sw" title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${esc(d.searchWidget)}"></iframe>` : ''}
    <div class="disclaimer">AI-generated starting point. Verify important claims against the sources before you rely on them.</div></section>`
    : `<section class="sources"><div class="disclaimer">No web sources were returned for this brief, so treat its claims with extra caution. Try Regenerate.</div></section>`;
  return `<article class="doc">${head}<div class="doc-body">${md(d.markdown)}</div>${src}</article>
    <div class="actions">
      <button class="btn small" data-act="copy">${icon('copy')}Copy</button>
      <button class="btn small" data-act="print">${icon('print')}Save as PDF</button>
      <button class="btn small" data-act="retry">${icon('refresh')}Regenerate</button>
      <button class="btn small danger" data-act="delete">${icon('trash')}Delete</button>
    </div>`;
}

function docMarkdown(idea) {
  const d = idea.doc;
  const src = d.sources.map((s, n) => `${n + 1}. [${s.title}](${s.uri})`).join('\n');
  return `# ${idea.title || label(idea)}\n\n` +
    (d.verdict ? `**Verdict:** ${d.verdict}${d.score != null ? ` (${d.score}/10)` : ''}\n\n` : '') +
    `> **Original idea:** ${idea.text.replace(/\n+/g, ' ')}\n\n` +
    plainCites(d.markdown) + (src ? `\n\n## Sources\n${src}\n` : '\n');
}

function refresh() { renderSidebar(); renderMain(); }
function tickTimers() {
  document.querySelectorAll('[data-since]').forEach(el => {
    const s = Math.max(0, Math.round((Date.now() - Number(el.dataset.since)) / 1000));
    el.textContent = `(${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`;
  });
}
setInterval(tickTimers, 1000);

/* ---------- events: list, thread, nav ---------- */
$('#ideaList').addEventListener('click', e => { const b = e.target.closest('.idea-item'); if (b) go(b.dataset.id); });
$('#search').addEventListener('input', e => { filter = e.target.value; renderSidebar(); });
$('#newBtn').addEventListener('click', () => { go(null); if (!isCoarse) $('#ideaInput').focus(); });
$('#topNew').addEventListener('click', () => { go(null); });
const openNav = () => document.body.classList.add('nav-open');
const closeNav = () => document.body.classList.remove('nav-open');
$('#openNav').addEventListener('click', openNav);
$('#closeNav').addEventListener('click', closeNav);
$('#scrim').addEventListener('click', closeNav);

$('#thread').addEventListener('click', async e => {
  const cite = e.target.closest('a[data-src]');
  if (cite) {
    e.preventDefault();
    const li = document.getElementById('src-' + cite.dataset.src);
    if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1600); }
    return;
  }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const idea = byId(currentId);
  switch (b.dataset.act) {
    case 'settings': openSettings(); break;
    case 'guide': showWelcome(); break;
    case 'retry': if (idea) retryIdea(idea); break;
    case 'delete': if (idea && confirm('Delete this idea and its research?')) deleteIdea(idea.id); break;
    case 'print': window.print(); break;
    case 'copy':
      try { await navigator.clipboard.writeText(docMarkdown(idea)); toast('Copied as Markdown'); }
      catch { toast('Couldn’t copy on this browser'); }
      break;
  }
});

/* ---------- composer: text + voice ---------- */
const input = $('#ideaInput'), sendBtn = $('#sendBtn');
function autosize() {
  input.style.height = '';
  if (input.value) input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  sendBtn.disabled = !input.value.trim();
}
input.addEventListener('input', autosize);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !isCoarse && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim(); if (!text) return;
  input.value = ''; autosize();
  createIdea({ text });
});

let recorder = null, recTimer = null;
const MAX_REC = 240;
function setRecording(on) {
  $('#composerBox').hidden = on; $('#recBar').hidden = !on;
  clearInterval(recTimer);
  if (on) {
    $('#recTime').textContent = '0:00';
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recorder.startedAt) / 1000);
      $('#recTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= MAX_REC) finishRecording(true);
    }, 250);
  }
}
$('#micBtn').addEventListener('click', async () => {
  if (recorder) return;
  const r = new Recorder();
  try { await r.start(); }
  catch (err) {
    toast(err && err.name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in your browser/site settings.' : (err.message || 'Couldn’t start recording.'), 5000);
    return;
  }
  recorder = r; setRecording(true);
});
function finishRecording(save) {
  if (!recorder) return;
  const r = recorder; recorder = null; setRecording(false);
  if (!save) { r.cancel(); return; }
  const { blob, seconds } = r.stop();
  if (seconds < 0.6) { toast('That was too short. Try again.'); return; }
  createIdea({ audio: blob, seconds });
}
$('#recSave').addEventListener('click', () => finishRecording(true));
$('#recCancel').addEventListener('click', () => finishRecording(false));

/* ---------- settings dialog ---------- */
const dlg = $('#settings');
function openSettings() {
  $('#apiKey').value = settings.apiKey; $('#apiKey').type = 'password'; $('#showKey').textContent = 'Show';
  $('#model').value = settings.model; $('#testOut').textContent = ''; $('#testOut').className = 'test-out';
  closeNav();
  dlg.showModal();
}
$('#settingsBtn').addEventListener('click', openSettings);
$('#showKey').addEventListener('click', () => {
  const k = $('#apiKey'); const show = k.type === 'password';
  k.type = show ? 'text' : 'password'; $('#showKey').textContent = show ? 'Hide' : 'Show';
});
function readSettingsForm() {
  settings.apiKey = $('#apiKey').value.trim();
  settings.model = $('#model').value.trim() || DEFAULT_MODEL;
  saveSettings();
}
const applySettings = () => { readSettingsForm(); refresh(); processQueue(); };
dlg.addEventListener('close', applySettings);
$('#saveSettings').addEventListener('click', applySettings);
$('#apiKey').addEventListener('input', readSettingsForm);     // never lose a pasted key, however the dialog is dismissed
$('#model').addEventListener('input', readSettingsForm);
/* Ping Gemini with the saved key and report the result in `out`. Returns true on success. */
async function testKey(out) {
  const say = (msg, cls = '') => { out.textContent = msg; out.className = out.className.replace(/\b(ok|bad)\b/g, '').trim() + (cls ? ' ' + cls : ''); };
  if (!settings.apiKey) { say('Paste a key first.', 'bad'); return false; }
  say('Testing…');
  try {
    // Same path research uses (search grounding on), so a model/quota problem shows up here, not later.
    await gemini({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], tools: [{ google_search: {} }] });
    say('Connected ✓', 'ok'); return true;
  } catch (e) {
    say(e instanceof TypeError ? 'Network error. Are you online?' : e.message, 'bad'); return false;
  }
}
$('#testKey').addEventListener('click', () => { readSettingsForm(); testKey($('#testOut')); });
$('#exportBtn').addEventListener('click', () => {
  const data = ideas.map(({ audio, ...rest }) => rest);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'ember', version: 1, ideas: data }, null, 2)], { type: 'application/json' }));
  a.download = 'ember-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const parsed = JSON.parse(await f.text());
    const incoming = (parsed.ideas || []).filter(i => i && i.id && (i.text || i.doc));
    let added = 0;
    for (const i of incoming) {
      if (byId(i.id)) continue;
      i.audio = null;
      if (BUSY.includes(i.status) || (i.status === 'pending-transcript')) i.status = i.text ? 'pending-research' : 'error';
      await dbPut(i); ideas.push(i); added++;
    }
    ideas.sort((a, b) => b.createdAt - a.createdAt);
    refresh(); toast(added ? `Imported ${added} idea${added > 1 ? 's' : ''}` : 'Nothing new to import');
  } catch { toast('That file isn’t a valid Ember backup.'); }
});
$('#wipeBtn').addEventListener('click', async () => {
  if (!ideas.length) { toast('No ideas to delete.'); return; }
  if (!confirm(`Delete all ${ideas.length} ideas from this device? This can’t be undone.`)) return;
  await dbClear(); ideas = []; audioUrls.forEach(u => URL.revokeObjectURL(u)); audioUrls.clear();
  dlg.close(); go(null); refresh();
});

/* ---------- first-run guide: how to get a Gemini API key ---------- */
const wz = $('#welcome');
let wzStep = 1, wzOk = false;
function renderWelcome() {
  wz.querySelectorAll('[data-step]').forEach(s => { s.hidden = Number(s.dataset.step) !== wzStep; });
  wz.querySelectorAll('.wz-dots i').forEach((d, n) => d.classList.toggle('on', n < wzStep));
  $('#wzLabel').textContent = `Step ${wzStep} of 3`;
  $('#wzBack').hidden = wzStep === 1;
  $('#wzSkip').hidden = wzOk;
  $('#wzNext').textContent = wzStep === 3 ? (wzOk ? 'Start capturing' : 'Save & test') : 'Next';
}
function showWelcome() {
  wzStep = 1; wzOk = false;
  $('#wzKey').value = settings.apiKey; $('#wzKey').type = 'password';
  $('#wzOut').textContent = ''; $('#wzOut').className = 'test-out';
  try { localStorage.setItem('ember.welcomed', '1'); } catch { /* ignore */ }
  closeNav();
  if (dlg.open) dlg.close();
  renderWelcome();
  if (!wz.open) wz.showModal();
}
function closeWelcome() { if (wz.open) wz.close(); refresh(); processQueue(); }
$('#wzNext').addEventListener('click', async () => {
  if (wzStep < 3) { wzStep++; renderWelcome(); if (wzStep === 3 && !isCoarse) $('#wzKey').focus(); return; }
  if (wzOk) { closeWelcome(); if (!isCoarse) $('#ideaInput').focus(); return; }
  settings.apiKey = $('#wzKey').value.trim().replace(/^["']|["']$/g, '');
  saveSettings();
  $('#wzNext').disabled = true;
  wzOk = await testKey($('#wzOut'));
  $('#wzNext').disabled = false;
  renderWelcome();
});
$('#wzBack').addEventListener('click', () => { if (wzStep > 1) { wzStep--; wzOk = false; renderWelcome(); } });
$('#wzSkip').addEventListener('click', closeWelcome);
$('#wzClose').addEventListener('click', closeWelcome);
$('#wzKey').addEventListener('input', () => { wzOk = false; renderWelcome(); });
$('#wzPaste').addEventListener('click', async () => {
  try {
    const t = (await navigator.clipboard.readText()).trim();
    if (!t) throw new Error('empty');
    $('#wzKey').value = t; wzOk = false; renderWelcome();
    $('#wzOut').textContent = 'Pasted. Tap “Save & test”.'; $('#wzOut').className = 'test-out';
  } catch {
    $('#wzOut').textContent = 'Couldn’t read the clipboard. Press and hold in the box and choose Paste.'; $('#wzOut').className = 'test-out bad';
  }
});
$('#openGuide').addEventListener('click', e => { e.preventDefault(); showWelcome(); });

/* ---------- boot ---------- */
window.addEventListener('online', processQueue);
window.addEventListener('offline', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) processQueue(); });

(async function init() {
  hydrateIcons();
  try {
    ideas = (await dbAll()).sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    toast('Storage is unavailable in this browser mode, so ideas can’t be saved.', 8000);
  }
  // A previous session may have been closed mid-request: put those back in the queue.
  for (const i of ideas) {
    if (i.status === 'transcribing') { i.status = 'pending-transcript'; dbPut(i); }
    else if (i.status === 'researching') { i.status = 'pending-research'; dbPut(i); }
  }
  if (!location.hash) history.replaceState(null, '', '#/new');
  readHash();
  processQueue();
  let welcomed = false;
  try { welcomed = !!localStorage.getItem('ember.welcomed'); } catch { /* ignore */ }
  if (!settings.apiKey && !welcomed) showWelcome();
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
