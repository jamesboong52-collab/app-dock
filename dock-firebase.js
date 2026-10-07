/* App Dock — website storage.
   The app was written for Claude's artifact runtime (window.claude.use('db' | 'assets')).
   This file provides the same calls on top of Firebase, so the app code stays identical:
   - sign-in with Google (Firebase Auth)
   - every document lives under users/<your uid>/... in Firestore (only you can read it, see firestore.rules)
   - closet photos are stored in Firestore too (split into ~900 KB parts), so no paid Storage plan is needed
   If config.js is not filled in, the app falls back to "saved in this browser only". */
(function(){
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = !!(cfg.apiKey && !/^PASTE/.test(cfg.apiKey) && window.firebase);
  let resolveUser; const userReady = new Promise(r => resolveUser = r);
  let fs = null, auth = null, base = '', DB = null, ASSETS = null;
  const cache = {}, loading = {};
  const CHUNK = 900000;

  window.claude = { use: async name => {
    if(!configured) return null;
    const u = await userReady; if(!u) return null;
    return name === 'db' ? DB : name === 'assets' ? ASSETS : null;
  }};
  window.__blobURL = id => cache[id] || '';
  window.DOCK_SITE = { email:'', blobURL: id => getBlob(id), signOut: async () => { if(auth){ await auth.signOut(); } location.reload(); }, importBackup };
  if(!configured){ console.warn('App Dock: config.js has no Firebase settings yet, data is saved in this browser only.'); window.DOCK_SITE.signOut = () => location.reload(); return; }

  /* ---------- Firebase ---------- */
  firebase.initializeApp(cfg);
  fs = firebase.firestore();
  try{ fs.settings({ ignoreUndefinedProperties:true, merge:true }); }catch(e){}
  fs.enablePersistence({ synchronizeTabs:true }).catch(()=>{});
  auth = firebase.auth();

  /* ---------- photos ---------- */
  const toDataURL = b => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(b); });
  const dataURLToBlob = async d => (await fetch(d)).blob();
  async function putBlob(id, dataURL){
    const n = Math.max(1, Math.ceil(dataURL.length / CHUNK));
    for(let i=0;i<n;i++) await fs.doc(`${base}blobparts/${id}_${i}`).set({ d: dataURL.slice(i*CHUNK, (i+1)*CHUNK) });
    await fs.doc(`${base}blobs/${id}`).set({ n, size: dataURL.length, created: Date.now() });
  }
  async function getBlob(id){
    if(cache[id]) return cache[id];
    if(loading[id]) return loading[id];
    return loading[id] = (async () => {
      try{
        const m = await fs.doc(`${base}blobs/${id}`).get(); if(!m.exists) return '';
        const n = m.data().n || 1;
        const parts = await Promise.all(Array.from({length:n}, (_,i) => fs.doc(`${base}blobparts/${id}_${i}`).get()));
        const url = URL.createObjectURL(await dataURLToBlob(parts.map(p => p.exists ? p.data().d : '').join('')));
        return cache[id] = url;
      }catch(e){ console.warn('photo', id, e); return ''; }
      finally{ delete loading[id]; }
    })();
  }
  async function deleteBlob(id){
    const m = await fs.doc(`${base}blobs/${id}`).get(); const n = m.exists ? (m.data().n || 1) : 1;
    for(let i=0;i<n;i++) await fs.doc(`${base}blobparts/${id}_${i}`).delete();
    await fs.doc(`${base}blobs/${id}`).delete();
    if(cache[id]){ URL.revokeObjectURL(cache[id]); delete cache[id]; }
  }
  const preload = ids => Promise.all([...new Set(ids.filter(Boolean))].map(getBlob));

  /* closet items: load their photos before the app sees them, so every <img> and canvas has its picture */
  function wrapItems(ref){
    const wrapQ = q => ({
      onSnapshot(cb, err){ return q.onSnapshot(async snap => { await preload(snap.docs.flatMap(d => [d.data().front, d.data().back])); cb(snap); }, err); },
      get: () => q.get(),
    });
    return { doc: (...a) => ref.doc(...a), get: () => ref.get(), orderBy: (...a) => wrapQ(ref.orderBy(...a)), onSnapshot: (cb, err) => wrapQ(ref).onSnapshot(cb, err) };
  }
  function makeDB(){
    DB = Object.freeze({
      collection: name => name === 'items' ? wrapItems(fs.collection(base + name)) : fs.collection(base + name),
      doc: path => fs.doc(base + path),
    });
    ASSETS = Object.freeze({
      upload: async blob => {
        const id = Math.random().toString(36).slice(2,10) + Date.now().toString(36);
        await putBlob(id, await toDataURL(blob));
        cache[id] = URL.createObjectURL(blob);
        return { id, url: cache[id], sizeBytes: blob.size, contentType: blob.type };
      },
      delete: deleteBlob,
    });
  }

  /* ---------- restore a backup (replaces everything in the account) ---------- */
  const COLS = ['todos','habits','habitDays','goals','wishlist','events','shelf','settings','items','outfits'];
  async function importBackup(data, say = () => {}){
    if(!DB) throw new Error('Sign in first.');
    const cols = data.collections || {};
    // 1. clear what is there now
    for(const c of [...COLS, 'blobs', 'blobparts']){
      say(`Clearing ${c}…`);
      const snap = await fs.collection(base + c).get();
      for(let i=0;i<snap.docs.length;i+=400){ const b = fs.batch(); snap.docs.slice(i,i+400).forEach(d => b.delete(d.ref)); await b.commit(); }
    }
    // 2. write the backup, keeping the same ids
    for(const c of COLS){
      const docs = cols[c] || []; let b = fs.batch(), ops = 0, bytes = 0, done = 0;
      for(const d of docs){
        const { id, ...rest } = d; if(id == null) continue;
        const sz = JSON.stringify(rest).length;
        if(ops >= 400 || bytes + sz > 8e6){ await b.commit(); b = fs.batch(); ops = 0; bytes = 0; }
        b.set(fs.doc(`${base}${c}/${String(id)}`), JSON.parse(JSON.stringify(rest))); ops++; bytes += sz; done++;
        say(`Restoring ${c}… ${done}/${docs.length}`);
      }
      if(ops) await b.commit();
    }
    // 3. closet photos
    const blobs = Object.entries(data.blobs || {}); let k = 0;
    for(const [id, url] of blobs){ say(`Uploading closet photos… ${++k}/${blobs.length}`); await putBlob(id, url); }
    // 4. small settings kept in the browser (badge log, last tab, …)
    try{ Object.entries(data.local || {}).forEach(([key, v]) => localStorage.setItem(key, v)); }catch(e){}
  }

  /* ---------- sign-in screen ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #gate{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:16px;background:var(--bg,#ECEEF1)}
  #gate[hidden]{display:none}
  #gate .card{width:100%;max-width:360px;background:var(--surface,#fff);border-radius:20px;padding:28px 22px;text-align:center;box-shadow:0 10px 30px rgb(0 0 0 / .08)}
  #gate img{width:64px;height:64px;border-radius:16px}
  #gate h1{font:700 24px/1.1 var(--display,system-ui);margin:14px 0 6px;color:var(--ink,#15181D)}
  #gate p{margin:0 0 20px;color:var(--muted,#5C6471);font:14px/1.45 var(--body,system-ui)}
  #gate button{width:100%;border:0;border-radius:12px;padding:13px 14px;font:700 15px var(--body,system-ui);background:var(--ink,#15181D);color:var(--bg,#fff);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px}
  #gate button svg{width:18px;height:18px}
  #gate .err{color:#D64545;font-size:13px;min-height:1em;margin:12px 0 0}`;
  document.head.appendChild(css);
  const gate = document.createElement('div'); gate.id = 'gate'; gate.hidden = true;
  gate.innerHTML = `<div class="card"><img src="icon-192.png" alt=""><h1>App Dock</h1><p>Sign in to open your apps. Your data is saved to your account and synced across your devices.</p>
    <button type="button" id="gate-go"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Sign in with Google</button>
    <p class="err" id="gate-err"></p></div>`;
  const mount = () => document.body.appendChild(gate);
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  gate.addEventListener('click', async e => {
    if(!e.target.closest('#gate-go')) return;
    const err = gate.querySelector('#gate-err'); err.textContent = '';
    const p = new firebase.auth.GoogleAuthProvider();
    try{ await auth.signInWithPopup(p); }
    catch(x){
      if(x && /popup-blocked|operation-not-supported/.test(x.code||'')) { try{ await auth.signInWithRedirect(p); return; }catch(y){ x=y; } }
      if(x && x.code === 'auth/popup-closed-by-user') return;
      err.textContent = x && x.code === 'auth/unauthorized-domain' ? 'This web address is not allowed yet: add it under Firebase › Authentication › Settings › Authorized domains.' : 'Sign-in failed: ' + ((x && (x.code || x.message)) || 'unknown error');
    }
  });
  let first = true;
  auth.onAuthStateChanged(u => {
    if(u){
      if(!first && base && base !== `users/${u.uid}/`){ location.reload(); return; }
      base = `users/${u.uid}/`; window.DOCK_SITE.email = u.email || ''; makeDB(); gate.hidden = true; resolveUser(u);
    } else {
      if(!first && base){ location.reload(); return; }
      gate.hidden = false;
    }
    first = false;
  });
})();
