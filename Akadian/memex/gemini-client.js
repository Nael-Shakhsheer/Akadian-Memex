'use strict';
(function(root){
 const API='https://generativelanguage.googleapis.com/v1beta';
 const normalize=name=>String(name||'').trim().replace(/^models\//,'');
 const compatible=m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-/.test(m.name)&&!/(image|embedding|tts|audio|live|robotics|computer-use|deep-research)/i.test(m.name);
 function rank(name){return (/flash/.test(name)?0:20)+(/lite/.test(name)?5:0)+(/preview|exp/.test(name)?10:0);}
 function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason);const abort=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});}
 function create({fetchFn=(...args)=>fetch(...args),sleep=wait,random=Math.random}={}){
  async function error(response,key,model){let detail='';try{detail=(await response.json()).error?.message||'';}catch{}detail=String(detail).split(key).join('[redacted]').replace(/AIza[\w-]+/g,'[redacted]').slice(0,400);
   const messages={400:'Gemini rejected the request. Check the key and whether this model supports the selected input and JSON output.',401:'Your Gemini key was not accepted. Update it in Settings.',403:'Gemini denied access. Check API key restrictions, project permissions and billing.',404:`Gemini model “${model||'selected model'}” is unavailable for this key or API version. Open Settings and list available models.`,429:'Quota exceeded; try later or check the project quota in Google AI Studio.',503:'Gemini is temporarily overloaded. Your source is still here; try again shortly.'};
   return new Error(`${messages[response.status]||'Gemini could not complete the request.'} (HTTP ${response.status})${detail?' Google: '+detail:''}`);
  }
  async function models(key,signal){if(!key)throw new Error('Add a Gemini API key in Settings.');let token='',all=[],seen=new Set();do{
   const url=new URL(API+'/models');url.searchParams.set('pageSize','1000');if(token)url.searchParams.set('pageToken',token);
   const r=await fetchFn(url.href,{headers:{'x-goog-api-key':key},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(!r.ok)throw await error(r,key,'');const d=await r.json();all.push(...(d.models||[]).filter(compatible));token=d.nextPageToken||'';if(token&&seen.has(token))throw new Error('Gemini returned a repeated model-list page. Retry model discovery.');seen.add(token);
  }while(token);return [...new Set(all.map(m=>normalize(m.name)))].sort((a,b)=>rank(a)-rank(b)||b.localeCompare(a,undefined,{numeric:true}));}
  async function json({key,model,prompt,parts=[],signal,onProgress=()=>{},onModel=async()=>{}}){
   if(!key)throw new Error('Add your Gemini API key in Settings.');let selected=normalize(model),listed=null,transient=0,switches=0;const failed=new Set();
   async function choose(){listed=listed||await models(key,signal);const next=listed.find(m=>!failed.has(m));if(!next)throw new Error('No available Gemini text model was found for this key. Check access in Google AI Studio and list models in Settings.');selected=next;onProgress(`Using available model ${selected}…`);}
   if(!selected)await choose();
   for(;;){
    signal?.throwIfAborted();let r;
    try{r=await fetchFn(`${API}/models/${encodeURIComponent(selected)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000),body:JSON.stringify({systemInstruction:{parts:[{text:prompt}]},contents:[{role:'user',parts:parts.length?parts:[{text:'Perform the requested task. Return valid JSON.'}]}],generationConfig:{responseMimeType:'application/json'}})});}catch(e){if(signal?.aborted)throw signal.reason;if(e.name==='TimeoutError')throw new Error('Gemini took too long to respond. Your source is preserved; try fewer questions.');throw new Error('Could not reach Gemini. Check your connection and try again.');}
    if(r.status===404&&switches<2){failed.add(selected);switches++;onProgress(`Model ${selected} is unavailable. Checking models available to your key…`);await choose();continue;}
    if([500,502,503,504].includes(r.status)&&transient<3){const ms=Math.round(1000*2**transient+random()*500);transient++;onProgress(`Gemini is busy (HTTP ${r.status}). Retrying in ${Math.ceil(ms/1000)} seconds · ${transient}/3. You can cancel.`);await sleep(ms,signal);continue;}
    if(!r.ok)throw await error(r,key,selected);
    const d=await r.json(),c=d.candidates?.[0];if(c?.finishReason!=='STOP')throw new Error('Gemini did not finish a complete response. Try fewer questions or a shorter source.');
    const text=(c.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');let result;try{result=JSON.parse(text);}catch{throw new Error('Gemini returned invalid JSON. Please retry.');}
    if(selected!==normalize(model))await onModel(selected);return result;
   }
  }
  return {models,json};
 }
 root.MemexGemini={create};if(typeof module!=='undefined')module.exports=root.MemexGemini;
})(typeof window==='undefined'?globalThis:window);
