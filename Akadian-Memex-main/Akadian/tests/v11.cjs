const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path'),os=require('node:os');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));let requests=[];
 await c.route('https://generativelanguage.googleapis.com/**',r=>{requests.push(r.request().postDataJSON());return r.fulfill({json:{candidates:[{content:{parts:[{text:'Idea A is cheaper to launch. Validate its demand first.'}]}}]}});});
 await p.goto('http://localhost:8765/ideas.html?capture=voice');await p.locator('#introDialog').waitFor();assert(await p.locator('#introShortcut').inputValue());assert(!await p.evaluate(()=>!!recorder));
 await p.locator('#introNext').click();await p.locator('#introPass').fill('short');await p.locator('#introConfirm').fill('short');await p.locator('#introEncrypt').click();assert((await p.locator('#introLockStatus').textContent()).includes('12'));
 await p.locator('#introPass').fill('a secure test phrase');await p.locator('#introConfirm').fill('a secure test phrase');await p.locator('#introEncrypt').click();await p.waitForFunction(()=>MemexStorage.lockedEnabled);await p.locator('#introNext').click();await p.locator('#introTour').click();await p.locator('#settingsTour').waitFor();
 for(let i=0;i<8;i++){if(i===0)await p.screenshot({path:path.join(os.tmpdir(),'memex-v11-tour.png')});assert.equal(await p.locator('.tour-highlight').count(),1);assert((await p.locator('#tourProgress').textContent()).includes(`${i+1} of 8`));await p.locator('#tourNext').click();}assert(await p.locator('#settingsTour').isHidden());
 for(const mode of ['dark','night','light','custom']){await p.locator('#appearanceMode').selectOption(mode);assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),mode);}
 await p.locator('#customBackground').fill('#18233b');await p.locator('#customAccent').fill('#ba8dff');assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg')),'#18233b');
 await p.locator('#saveSettings').click();
 // Prepare three saved briefs without incurring research calls.
 await p.evaluate(async()=>{for(const [id,text] of [['a','Solar garden'],['b','Math tutoring'],['c','Coffee delivery']]){const i={id,text,title:text,createdAt:Date.now(),updatedAt:Date.now(),status:'done',doc:{markdown:'## Summary\nA useful concept.',sources:[],queries:[],generatedAt:1,model:'test',grounded:false}};await dbPut(i);ideas.push(i);}settings.apiKey='fixture-key';await saveSettings();refresh();});
 await p.locator('#openNav').click();await p.locator('#compareBtn').click();await p.locator('#compareQuestion').fill('Which costs less?');await p.locator('#compareAsk').click();await p.waitForFunction(()=>document.querySelectorAll('#compareChatLog .chat-turn').length===2);
 assert(JSON.stringify(requests.at(-1)).includes('Solar garden'));assert(JSON.stringify(requests.at(-1)).includes('Math tutoring'));
 await p.locator('#compareB').selectOption('c');assert.equal(await p.locator('#compareChatLog .chat-turn').count(),0);await p.locator('#compareB').selectOption('b');assert.equal(await p.locator('#compareChatLog .chat-turn').count(),2);
 const bar=await p.locator('#compareChatForm').boundingBox();assert(bar.x>=0&&bar.x+bar.width<=390&&bar.y+bar.height<=844);
 await p.screenshot({path:path.join(os.tmpdir(),'memex-v11-comparison.png')});
 await p.locator('#closeCompare').click();await p.reload();await p.locator('#unlockGate').waitFor();assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'custom');assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg')),'#18233b');
 // Remove the capture query before unlock to avoid a real microphone prompt in this test.
 await p.evaluate(()=>history.replaceState(null,'','/'));await p.locator('#unlockPass').fill('a secure test phrase');await p.locator('#unlockForm button').click();await p.waitForFunction(()=>typeof settings!=='undefined');assert(await p.locator('#introDialog').isHidden());
 assert.deepEqual(errors,[]);console.log('PASS first-run capture prompt, encryption, eight-step Settings tour, theme changes/persistence/lock screen, comparison context/pair separation/mobile bar.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
