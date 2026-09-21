const assert=require('node:assert/strict');
const {create}=require('../memex/gemini-client.js');
const response=(status,data)=>({status,ok:status===200,json:async()=>data});
const success=()=>response(200,{candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}]});
const model=name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']});
const opts={key:'secret-test-key',model:'missing-model',prompt:'test',signal:new AbortController().signal};
(async()=>{
 let calls=[],selected='',listCalls=0;
 const client=create({fetchFn:async(url,request)=>{calls.push(url);if(!request.method){listCalls++;return response(200,listCalls===1?{models:[model('gemini-image-model')],nextPageToken:'page2'}:{models:[model('gemini-9-flash'),model('gemini-9-pro')]});}return url.includes('missing-model')?response(404,{error:{message:'not found'}}):success();}});
 assert.deepEqual(await client.json({...opts,onModel:async m=>selected=m}),{ok:true});assert.equal(selected,'gemini-9-flash');assert.equal(listCalls,2);assert.equal(calls.filter(x=>x.includes(':generateContent')).length,2);
 let attempts=0,delays=[];const retry=create({fetchFn:async()=>++attempts<4?response(503,{}):success(),sleep:async ms=>delays.push(ms),random:()=>0});await retry.json({...opts,model:'gemini-test'});assert.equal(attempts,4);assert.deepEqual(delays,[1000,2000,4000]);
 attempts=0;const exhausted=create({fetchFn:async()=>{attempts++;return response(503,{})},sleep:async()=>{}});await assert.rejects(exhausted.json(opts),/temporarily overloaded/);assert.equal(attempts,4);
 attempts=0;const forbidden=create({fetchFn:async()=>{attempts++;return response(403,{error:{message:'restricted secret-test-key'}})}});await assert.rejects(forbidden.json(opts),e=>e.message.includes('denied access')&&!e.message.includes('secret-test-key'));assert.equal(attempts,1);
 const abort=new AbortController();attempts=0;const cancel=create({fetchFn:async()=>{attempts++;return response(503,{})},sleep:async(ms,signal)=>{abort.abort();signal.throwIfAborted();}});await assert.rejects(cancel.json({...opts,signal:abort.signal}),e=>e.name==='AbortError');assert.equal(attempts,1);
 attempts=0;const noModels=create({fetchFn:async(url,req)=>{attempts++;return response(req.method?404:200,{models:[]})}});await assert.rejects(noModels.json(opts),/No available Gemini/);assert.equal(attempts,2);
 attempts=0;const allMissing=create({fetchFn:async(url,req)=>{if(!req.method)return response(200,{models:[model('gemini-a-flash'),model('gemini-b-flash'),model('gemini-c-flash')]});attempts++;return response(404,{})}});await assert.rejects(allMissing.json(opts),/HTTP 404/);assert.equal(attempts,3);
 console.log('PASS: 404 recovery, paginated model discovery, specialty-model filtering, model persistence callback, bounded 503 retries, cancellation, auth no-retry, key redaction, empty models, bounded fallback.');
})().catch(e=>{console.error(e);process.exitCode=1});
