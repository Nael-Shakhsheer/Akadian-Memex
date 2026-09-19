const { chromium }=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const context=await browser.newContext();const p=await context.newPage();const errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 let calls=[];
 await context.route('https://generativelanguage.googleapis.com/**',r=>{calls.push(r.request().postDataJSON());return r.fulfill({json:{candidates:[{content:{parts:[{text:'TITLE: Test Brief\nVERDICT: Plausible | 7\n## Summary\nA useful idea.\n## Competitors\n| Product | Gap |\n|---|---|\n| Example | Verify |'}]}}]}});});
 await p.goto('http://localhost:8765');await p.locator('#wzSkip').click();
 await p.locator('#ideaInput').fill('A private solar garden idea');await p.locator('#sendBtn').click();await p.locator('[data-extra="star"]').click();
 await p.locator('#ideaStage').selectOption('exploring');await p.locator('#ideaTags').fill('garden, energy');await p.locator('#ideaTags').press('Tab');
 await p.locator('#settingsBtn').click();await p.locator('#apiKey').fill('fake-test-key');await p.locator('#searchMode').selectOption('none');await p.locator('#depth').selectOption('quick');await p.locator('#saveSettings').click();
 await p.locator('.doc').waitFor();assert(calls.length>0);
 await p.locator('#chatInput').fill('Make it cheaper');await p.locator('#chatForm button').click();await p.waitForFunction(()=>document.querySelectorAll('.chat-turn').length===2);
 await p.locator('[data-extra="edit"]').click();await p.locator('#editText').fill('A revised solar idea');await p.locator('#editDepth').selectOption('deep');await p.locator('#editForm button[type="submit"],#editForm .primary').click();await p.waitForFunction(()=>byId(currentId)?.text==='A revised solar idea' && byId(currentId)?.status==='done' && byId(currentId)?.depth==='deep' && byId(currentId)?.doc);assert(JSON.stringify(calls.at(-1)).includes('1200'));
 await p.locator('#newBtn').click();await p.locator('#ideaInput').fill('Second idea');await p.locator('#sendBtn').click();await p.locator('.doc').waitFor();
 await p.locator('#compareBtn').click();assert.equal(await p.locator('.comparison article').count(),2);await p.locator('#closeCompare').click();
 await p.evaluate(()=>EmberStorage.put({id:'audio-test',text:'',createdAt:Date.now(),audio:new Blob(['test audio'],{type:'audio/wav'}),status:'pending-transcript'}));
 await p.locator('#settingsBtn').click();await p.locator('#lockPass').fill('test passphrase long');await p.locator('#lockConfirm').fill('test passphrase long');await p.locator('#enableLock').click();await p.waitForFunction(()=>EmberStorage.lockedEnabled);
 const raw=await p.evaluate(async()=>{const d=await new Promise(res=>{const r=indexedDB.open('ember');r.onsuccess=()=>res(r.result)});return new Promise(res=>{const r=d.transaction('ideas').objectStore('ideas').getAll();r.onsuccess=()=>res(JSON.stringify(r.result));});});assert(!raw.includes('solar'));assert(!raw.includes('Second idea'));assert.equal(await p.evaluate(()=>localStorage.getItem('ember.settings')),null);
 await p.reload();await p.locator('#unlockPass').fill('wrong password');await p.locator('#unlockForm button').click();await p.waitForFunction(()=>document.querySelector('#unlockError').textContent.includes('Could not'));
 await p.locator('#unlockPass').fill('test passphrase long');await p.locator('#unlockForm button').click();await p.locator('#ideaInput').waitFor();await p.locator('.doc').waitFor();
 assert.equal(await p.evaluate(()=>settings.apiKey),'fake-test-key');assert.equal(await p.locator('.idea-item').count(),3);assert.equal(await p.evaluate(async()=>await (await EmberStorage.all()).find(i=>i.id==='audio-test').audio.text()),'test audio');
 // Authenticated encryption rejects tampering and wrong passphrases.
 assert(await p.evaluate(async()=>{const a=await EmberStorage.encryptBackup({hello:'world'},'long backup password');let rejected=false;try{await EmberStorage.decryptBackup(a,'wrong')}catch{rejected=true;}return rejected&&(await EmberStorage.decryptBackup(a,'long backup password')).hello==='world';}));
 // Imported links cannot execute JavaScript; malformed data fails before writes.
 assert(await p.evaluate(()=>{const a=validateBackup({app:'ember',version:1,ideas:[{id:'safe',text:'x',createdAt:1,doc:{markdown:'x',sources:[{uri:'javascript:alert(1)',title:'bad'}]}}]});return a[0].doc.sources[0].uri==='#';}));
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'ember-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS capture, organization, research mock, chat, edit/depth, compare, encryption, unlock, tamper rejection, safe import, mobile render');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
