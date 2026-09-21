// Runs the actual Study controller with simulated DOM/storage/network adapters.
// This is an integration test, not a browser layout or real-provider test.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=require('../memex/study-core.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../memex/index.html'),'utf8');
const elements={};
for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements[id]={value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,checked:false,showModal(){this.open=true},close(){this.open=false},classList:{add(){}}};
// Nodes dynamically rendered by the practice screen.
for(const id of ['backBuilder','printSet','retrySet','deleteSet','submitSet'])elements[id]={};
elements.buildForm.elements=Object.values(elements);
elements.difficulty.value='Advanced';elements.technical.value='technical';elements.format.value='mcq';elements.count.value='1';elements.inputType.value='text';
const source='The area of a rectangle equals its length multiplied by its width.';
elements.source.value=source;elements.reviewSource.checked=true;
const q={id:'q1',prompt:'A student calculates 3 + 4 as the area of a 3 by 4 rectangle. Evaluate this.',format:'mcq',options:['Incorrect: area is 12','Correct: area is 7','Area is 5','Area is 24'],answer:'Incorrect: area is 12',explanation:'Area uses multiplication, so 3 times 4 is 12.',bloom:'Evaluate',sourceQuote:source,concept:'Area'};
let saved=[],calls=[],pass=true;
const sandbox={console,StudyCore:core,MemexGemini:require('../memex/gemini-client.js'),URLSearchParams,location:{search:'',hash:'',reload(){}},crypto:require('node:crypto').webcrypto,AbortController,AbortSignal,confirm:()=>true,navigator:{},document:{getElementById:id=>elements[id],addEventListener(){},body:{classList:{add(){}}}},MemexAppearance:{get:()=>({mode:'light',accent:'#aa6600',background:'#ffffff'}),set(){}},MemexStorage:{study:async()=>[],saveStudy:async v=>{saved=structuredClone(v)},saveSettings:async()=>{},flush:async()=>{}},fetch:async(url,opts)=>{const body=JSON.parse(opts.body);calls.push(body);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(calls.length%2?{title:'Area test',questions:[q]}:{verdicts:[{id:'q1',valid:pass,reason:pass?'Independently solved':'Unsupported'}]})}]}}]})}}};
sandbox.window={memexInitialSettings:{apiKey:'test',model:'test-model',studyOnboarded:true},scrollTo(){},print(){}};
const realCreate=sandbox.MemexGemini.create; sandbox.MemexGemini={create:()=>realCreate({fetchFn:(...args)=>sandbox.fetch(...args)})};
vm.createContext(sandbox);
(async()=>{
 await vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../memex/study.js'),'utf8'),sandbox);
 await elements.buildForm.onsubmit({preventDefault(){}});
 assert.equal(calls.length,2);assert.equal(saved.length,1);assert.equal(saved[0].questions.length,1);
 assert.equal(elements.builder.hidden,true);assert(!elements.practice.innerHTML.includes('<div class="answer-review">'));
 await elements.practice.oninput({target:{dataset:{question:'q1'},value:'0'}});
 assert.equal(saved[0].answers.q1,q.answer);
 await elements.submitSet.onclick();assert.equal(saved[0].submitted,true);assert(elements.practice.innerHTML.includes('From your source'));assert(elements.practice.innerHTML.includes('1 / 1'));
 elements.newStudy.onclick();pass=false;await elements.buildForm.onsubmit({preventDefault(){}});
 assert.equal(calls.length,4);assert.equal(saved.length,1);assert.match(elements.studyStatus.textContent,/No questions passed/);assert.equal(elements.generate.disabled,false);
 elements.newStudy.onclick();sandbox.fetch=async()=>({ok:false,status:429});await elements.buildForm.onsubmit({preventDefault(){}});assert.match(elements.studyStatus.textContent,/Quota exceeded/);assert.equal(saved.length,1);assert.equal(elements.generate.disabled,false);
 console.log('PASS: two-pass generation, persisted answers, answer-key gating, scoring, failed verification withholding, provider errors.');
})().catch(e=>{console.error(e);process.exitCode=1});
