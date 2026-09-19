const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});let remote=null,revision=0,searchCount=0;
 async function device(){const c=await browser.newContext();const p=await c.newPage();await c.route('https://api.github.com/gists**',async r=>{const q=r.request();if(q.method()==='GET')return r.fulfill({json:remote});const data=q.postDataJSON();assert(!data.files['ember-sync.json'].content.includes('Sync solar'));remote={id:'01234567890123456789012345678901',files:data.files,history:[{version:String(++revision)}]};return r.fulfill({json:remote});});await p.goto('http://localhost:8765');await p.locator('#wzSkip').click();p.on('dialog',d=>d.accept(d.type()==='prompt'?'shared sync passphrase':undefined));return {c,p};}
 const a=await device(),b=await device();
 await a.p.locator('#ideaInput').fill('Sync solar');await a.p.locator('#sendBtn').click();await a.p.waitForFunction(()=>ideas.length===1);
 async function sync(p,id){await p.locator('#settingsBtn').click();await p.locator('#gistToken').fill('fake-token');await p.locator('#gistId').fill(id||'');await p.locator('#syncNow').click();await p.waitForFunction(()=>document.querySelector('#syncOut').textContent.startsWith('Synced'));await p.locator('#saveSettings').click();}
 await sync(a.p);assert(remote);await sync(b.p,remote.id);assert.equal(await b.p.locator('.idea-item').count(),1);
 await b.p.locator('.idea-item').click();await b.p.locator('#ideaStage').selectOption('building');await b.p.locator('#ideaTags').fill('synced');await b.p.locator('#ideaTags').press('Tab');await sync(b.p,remote.id);await sync(a.p,remote.id);assert.equal(await a.p.evaluate(()=>ideas[0].stage),'building');
 await a.p.evaluate(()=>deleteIdea(ideas[0].id));await sync(a.p,remote.id);await sync(b.p,remote.id);assert.equal(await b.p.locator('.idea-item').count(),0);
 // Real service-worker offline shell, no external services involved.
 await a.p.evaluate(()=>navigator.serviceWorker.ready);await a.p.reload();await a.p.waitForFunction(()=>navigator.serviceWorker.controller);
 await a.c.setOffline(true);await a.p.reload();await a.p.locator('#ideaInput').fill('Offline idea');await a.p.locator('#sendBtn').click();await a.p.waitForFunction(()=>ideas.some(i=>i.text==='Offline idea'));await a.c.setOffline(false);
 // Search integration uses snippets and exposes source links.
 await b.c.route('https://api.tavily.com/search',r=>{searchCount++;return r.fulfill({json:{results:[{url:'https://example.org/evidence',title:'Evidence',content:'A relevant competitor.'}]}});});
 await b.c.route('https://generativelanguage.googleapis.com/**',r=>r.fulfill({json:{candidates:[{content:{parts:[{text:'TITLE: Search result\nVERDICT: Plausible | 6\n## Summary\nA competitor [1].'}]}}]}}));
 await b.p.locator('#settingsBtn').click();await b.p.locator('#apiKey').fill('fake');await b.p.locator('#searchMode').selectOption('tavily');await b.p.locator('#tavilyKey').fill('fake-search');await b.p.locator('#saveSettings').click();
 await b.p.locator('#ideaInput').fill('Research search');await b.p.locator('#sendBtn').click();await b.p.locator('.sources a').waitFor();assert(searchCount>0);assert.equal(await b.p.locator('.sources a').first().getAttribute('href'),'https://example.org/evidence');
 await b.p.setViewportSize({width:390,height:844});await b.p.evaluate(()=>document.body.classList.remove('nav-open'));await b.p.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<0);await b.p.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'ember-mobile-detail.png'),fullPage:true});
 console.log('PASS two-device encrypted sync, merged edits, synced deletion, offline shell/capture, Tavily mock sources');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
