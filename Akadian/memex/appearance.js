'use strict';
// Appearance is non-sensitive and loads before unlock, so the lock screen matches.
window.MemexAppearance = (() => {
 const KEY='memex.appearance';
 // Theme saved under the previous release's key; read once so the look carries over, then
 // rewritten under the current key and dropped so this fallback can be deleted later.
 const LEGACY_KEY='ember.appearance';
 const defaults={mode:'system',accent:'#c26a12',background:'#f6f3ec'};
 let choice={...defaults};
 try {
  const saved=localStorage.getItem(KEY),carried=saved??localStorage.getItem(LEGACY_KEY);
  Object.assign(choice,JSON.parse(carried??'{}'));
  if(saved===null&&carried!==null){localStorage.setItem(KEY,carried);localStorage.removeItem(LEGACY_KEY);}
 }catch{}
 const valid=c=>/^#[\da-f]{6}$/i.test(c);
 const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
 const luminance=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
 const system=matchMedia('(prefers-color-scheme: dark)');
 function apply(value=choice){
  choice={...defaults,...value};
  if(!['system','light','dark','night','custom'].includes(choice.mode))choice.mode='system';
  if(!valid(choice.accent))choice.accent=defaults.accent;
  if(!valid(choice.background))choice.background=defaults.background;
  const mode=choice.mode==='system'?(system.matches?'dark':'light'):choice.mode;
  const palettes={light:['#f6f3ec','#c26a12'],dark:['#16191f','#f0a04b'],night:['#100e0b','#cb925a'],custom:[choice.background,choice.accent]};
  const [bg,accent]=palettes[mode],dark=luminance(bg)<.179;
  const ink=dark?'#f5f0e6':'#211e17',opposite=dark?'#ffffff':'#000000';
  // If a custom accent blends into the background, adjust its text/link variant.
  let link=accent;const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  for(let n=0;n<20&&ratio(link,bg)<4.5;n++)link=mix(link,dark?'#ffffff':'#000000',.15);
  const vars={'bg':bg,'panel':mix(bg,opposite,.035),'surface':mix(bg,'#ffffff',dark?.065:.65),'ink':ink,'muted':mix(bg,ink,.68),'line':mix(bg,ink,.18),'accent':link,'accent-ink':luminance(link)>.35?'#101010':'#ffffff','accent-soft':mix(bg,link,.15),'good':dark?'#75ce9b':'#28663e','ok':dark?'#edb866':'#825d0b','risky':dark?'#f59b78':'#a44120','long':dark?'#f28f97':'#8a303b','shadow':dark?'0 8px 24px #0005':'0 8px 24px #39220712'};
  for(const [name,v] of Object.entries(vars))document.documentElement.style.setProperty('--'+name,v);
  document.documentElement.style.colorScheme=dark?'dark':'light';document.documentElement.dataset.theme=mode;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.content=bg);
 }
 apply();system.addEventListener('change',()=>{if(choice.mode==='system')apply();});
 return {get:()=>({...choice}),set:value=>{apply(value);try{localStorage.setItem(KEY,JSON.stringify(choice));}catch{}},reset:()=>{apply(defaults);try{localStorage.removeItem(KEY);localStorage.removeItem(LEGACY_KEY);}catch{}}};
})();
