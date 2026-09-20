'use strict';
// All persisted secrets and idea payloads pass through this module.
window.MemexStorage = (() => {
  const DB_NAME = 'memex', SETTINGS_KEY = 'memex.settings';
  // One-time compatibility shim: storage names used by the release this app was renamed from,
  // read only so existing installs carry their data forward. Nothing here is written or shown.
  // Delete this block once no device still holds data under the old names.
  const LEGACY = { db: 'ember', settings: 'ember.settings', backupApp: 'ember' };
  let db, key = null, meta = null, chain = Promise.resolve();
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = bytes => { let s=''; for (const b of new Uint8Array(bytes)) s+=String.fromCharCode(b); return btoa(s); };
  const bytes = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
  async function derive(pass, salt) {
    const material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(salt),iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(value, k=key) {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    return {iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(value))))};
  }
  async function unseal(value,k=key) { return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv)},k,bytes(value.data)))); }
  function transaction(stores, mode, run, target) { return new Promise((resolve,reject)=>{
    const t=(target||db).transaction(stores,mode); let r;
    try { r=run(t); } catch(e) { t.abort(); reject(e); return; }
    t.oncomplete=()=>resolve(r?.result); t.onerror=t.onabort=()=>reject(t.error || new Error('Storage changed; reopen Memex.'));
  }); }
  const getMeta=()=>transaction(['meta'],'readonly',t=>t.objectStore('meta').get('vault'));
  const enqueue=fn=>{ const p=chain.then(fn); chain=p.catch(()=>{}); return p; };
  const readLocalSettings=()=>{ try { return localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY.settings); } catch { return null; } };
  const clearLocalSettings=()=>{ try { localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(LEGACY.settings); } catch { /* ignore */ } };
  function openDb(name, version) { return new Promise((resolve,reject)=>{
    const r=version?indexedDB.open(name,version):indexedDB.open(name); let created=false;
    r.onupgradeneeded=()=>{ created=true; if(!r.result.objectStoreNames.contains('ideas'))r.result.createObjectStore('ideas',{keyPath:'id'}); if(!r.result.objectStoreNames.contains('meta'))r.result.createObjectStore('meta'); };
    r.onsuccess=()=>resolve({handle:r.result,created});
    r.onerror=()=>reject(r.error);
    r.onblocked=()=>reject(new Error('Close other Memex tabs, then reload.'));
  }); }
  // Copies ideas and the vault record from the previous release's database on first run. Runs only
  // against an empty new database and leaves the old one in place, so a failure loses nothing.
  async function adoptPreviousData() {
    let previous=null;
    try {
      if (indexedDB.databases) {
        const names=(await indexedDB.databases()).map(d=>d.name);
        if (!names.includes(LEGACY.db)) return;
        previous=(await openDb(LEGACY.db)).handle;
      } else {
        const opened=await openDb(LEGACY.db);
        if (opened.created) { opened.handle.close(); indexedDB.deleteDatabase(LEGACY.db); return; }
        previous=opened.handle;
      }
      if (!previous.objectStoreNames.contains('ideas') || !previous.objectStoreNames.contains('meta')) return;
      const rows=await transaction(['ideas'],'readonly',t=>t.objectStore('ideas').getAll(),previous);
      const vault=await transaction(['meta'],'readonly',t=>t.objectStore('meta').get('vault'),previous);
      const config=await transaction(['meta'],'readonly',t=>t.objectStore('meta').get('settings'),previous);
      if (!rows.length && !vault) return;
      await transaction(['ideas','meta'],'readwrite',t=>{
        const store=t.objectStore('ideas'); rows.forEach(i=>store.put(i));
        if (vault) t.objectStore('meta').put(vault,'vault');
        if (config) t.objectStore('meta').put(config,'settings');
      });
    } catch { /* leave the new database empty; the old one is untouched */ }
    finally { try { previous?.close(); } catch { /* ignore */ } }
  }
  function write(store, action) {
    return transaction([store,'meta'],'readwrite',t=>{
      const r=t.objectStore('meta').get('vault');
      r.onsuccess=()=> { if ((r.result?.salt || null)!==(meta?.salt || null)) {t.abort(); return;} action(t.objectStore(store)); };
    });
  }
  async function pack(i) { const v={...i}; if(v.audio instanceof Blob) v.audio={type:v.audio.type,base64:b64(await v.audio.arrayBuffer())}; return v; }
  function unpack(i) { if(i.audio?.base64) i.audio=new Blob([bytes(i.audio.base64)],{type:i.audio.type}); return i; }
  const api={
    get lockedEnabled(){return !!meta;},
    async init(){ db=(await openDb(DB_NAME,2)).handle; db.onversionchange=()=>location.reload();
      meta=await getMeta();
      if(!meta && !(await transaction(['ideas'],'readonly',t=>t.objectStore('ideas').count()))) { await adoptPreviousData(); meta=await getMeta(); }
      return !!meta; },
    async unlock(pass){ const k=await derive(pass,meta.salt); await unseal(meta.check,k); key=k; clearLocalSettings(); },
    async settings(){ if(meta) return unseal(await transaction(['meta'],'readonly',t=>t.objectStore('meta').get('settings'))); return JSON.parse(readLocalSettings()||'{}'); },
    saveSettings(s){ const snapshot=JSON.parse(JSON.stringify(s)); return enqueue(async()=>{ if(meta) {const v=await seal(snapshot);await write('meta',st=>st.put(v,'settings'));} else {if(await getMeta())throw new Error('Vault changed; reopen Memex.');localStorage.setItem(SETTINGS_KEY,JSON.stringify(snapshot));} }); },
    async all(){const rows=await transaction(['ideas'],'readonly',t=>t.objectStore('ideas').getAll());return Promise.all(rows.map(async r=>r.encrypted?unpack(await unseal(r.payload)):r));},
    put(i){return enqueue(async()=>{const row=meta?{id:i.id,encrypted:true,payload:await seal(await pack(i))}:i;await write('ideas',s=>s.put(row));});},
    del(id){return enqueue(()=>write('ideas',s=>s.delete(id)));},
    clear(){return enqueue(()=>write('ideas',s=>s.clear()));},
    enable(pass,s){return enqueue(async()=>{
      if(meta)throw new Error('Lock already enabled.');
      if(pass.length<12)throw new Error('Use a passphrase of at least 12 characters.');
      const salt=b64(crypto.getRandomValues(new Uint8Array(16))),k=await derive(pass,salt);
      const rows=await api.all(), encrypted=await Promise.all(rows.map(async i=>({id:i.id,encrypted:true,payload:await seal(await pack(i),k)})));
      const next={salt,check:await seal('Memex vault v1',k)},config=await seal(s,k);
      await transaction(['ideas','meta'],'readwrite',t=>{const a=t.objectStore('ideas');a.clear();encrypted.forEach(i=>a.put(i));t.objectStore('meta').put(next,'vault');t.objectStore('meta').put(config,'settings');});
      meta=next;key=k;clearLocalSettings();
    });},
    async flush(){await chain;},
    async encryptBackup(value,pass){const salt=b64(crypto.getRandomValues(new Uint8Array(16)));return {app:'memex',encrypted:true,version:1,salt,payload:await seal(value,await derive(pass,salt))};},
    async decryptBackup(value,pass){if(!['memex',LEGACY.backupApp].includes(value.app)||value.version!==1||!value.encrypted)throw new Error('Unsupported encrypted backup.');return unseal(value.payload,await derive(pass,value.salt));}
  }; return api;
})();
(async()=>{
  const gate=document.getElementById('unlockGate'),error=document.getElementById('unlockError');
  async function launch(){window.memexInitialSettings=await MemexStorage.settings();gate.close(); const s=document.createElement('script');s.src='app.js';document.body.append(s);}
  try {
    if(await MemexStorage.init()) {gate.showModal();gate.addEventListener('cancel',e=>e.preventDefault());document.getElementById('unlockForm').onsubmit=async e=>{e.preventDefault();const p=document.getElementById('unlockPass');try{await MemexStorage.unlock(p.value);p.value='';await launch();}catch{error.textContent='Could not unlock. Check your passphrase.';}};} else await launch();
  }catch{gate.showModal();error.textContent='Storage is unavailable or another Memex tab is blocking the update. Close other Memex tabs and reopen with browser storage enabled.';}
})();
