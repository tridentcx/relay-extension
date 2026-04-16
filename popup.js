'use strict';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const FILE        = 'relay-bookmarks.json';
const IS_SAFARI   = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const HAS_FSA     = 'showDirectoryPicker' in window;
const SAFARI_MODE = IS_SAFARI || !HAS_FSA;

// ─────────────────────────────────────────────
// IndexedDB  — persist FileSystemDirectoryHandle
// ─────────────────────────────────────────────
function _db() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('relay', 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('s');
    r.onsuccess  = e => ok(e.target.result);
    r.onerror    = e => fail(e.target.error);
  });
}

async function dbGet(k) {
  const db = await _db();
  return new Promise((ok, fail) => {
    const r = db.transaction('s','readonly').objectStore('s').get(k);
    r.onsuccess = e => ok(e.target.result ?? null);
    r.onerror   = e => fail(e.target.error);
  });
}

async function dbSet(k, v) {
  const db = await _db();
  return new Promise((ok, fail) => {
    const tx = db.transaction('s','readwrite');
    tx.objectStore('s').put(v, k);
    tx.oncomplete = () => ok();
    tx.onerror    = e => fail(e.target.error);
  });
}

// ─────────────────────────────────────────────
// Bookmark engine
// ─────────────────────────────────────────────
const clean = n => n.url
  ? { type:'bookmark', title:n.title||'', url:n.url, dateAdded:n.dateAdded||Date.now() }
  : { type:'folder',   title:n.title||'', children:(n.children||[]).map(clean) };

async function snapshot() {
  const tree = await chrome.bookmarks.getTree();
  const bm   = (tree[0].children||[]).map(clean);
  return {
    version:'1.0', app:'Relay',
    exportedAt: new Date().toISOString(),
    exportedBy: navigator.userAgent.match(/(Edg|Chrome|Safari)\/[\d.]+/)?.[0]||'Browser',
    count: total(bm),
    bookmarks: bm,
  };
}

const total = ns => ns.reduce((s,n) => s+(n.type==='bookmark'?1:total(n.children||[])),0);

async function urlSet() {
  const tree = await chrome.bookmarks.getTree();
  const s = new Set();
  (function w(n){ if(n.url)s.add(n.url); (n.children||[]).forEach(w); })(tree[0]);
  return s;
}

function rootMatch(roots, kw) {
  return roots.find(r=>r.title.toLowerCase().includes(kw))||roots[0];
}

async function mergeIn(nodes, parentId, urls) {
  let added = 0;
  for (const n of nodes) {
    if (n.type==='bookmark' && n.url && !urls.has(n.url)) {
      await chrome.bookmarks.create({parentId, title:n.title, url:n.url});
      urls.add(n.url); added++;
    } else if (n.type==='folder') {
      const kids = await chrome.bookmarks.getChildren(parentId);
      let f = kids.find(c=>!c.url && c.title===n.title);
      if (!f) f = await chrome.bookmarks.create({parentId, title:n.title});
      added += await mergeIn(n.children||[], f.id, urls);
    }
  }
  return added;
}

async function applySnapshot(data) {
  if (!Array.isArray(data?.bookmarks)) throw new Error('Unrecognised file format.');
  const urls  = await urlSet();
  const roots = (await chrome.bookmarks.getTree())[0].children||[];
  let added = 0;
  for (const f of data.bookmarks) {
    if (f.type!=='folder') continue;
    const target = f.title.toLowerCase().includes('bar')
      ? rootMatch(roots,'bar') : rootMatch(roots,'other');
    if (target) added += await mergeIn(f.children||[], target.id, urls);
  }
  return { added, by: data.exportedBy, at: data.exportedAt };
}

// ─────────────────────────────────────────────
// FSA helpers (Chrome / Edge)
// ─────────────────────────────────────────────
async function okPermission(h) {
  const o = {mode:'readwrite'};
  if (await h.queryPermission(o)==='granted') return true;
  return (await h.requestPermission(o))==='granted';
}

async function readSyncFile(h) {
  try {
    const fh = await h.getFileHandle(FILE);
    return JSON.parse(await (await fh.getFile()).text());
  } catch { return null; }
}

async function writeSyncFile(h, data) {
  const fh = await h.getFileHandle(FILE, {create:true});
  const w  = await fh.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

// ─────────────────────────────────────────────
// Smart bidirectional sync
// ─────────────────────────────────────────────
async function doSync(handle) {
  if (!await okPermission(handle))
    throw new Error('Folder access needed. Tap "change" to reconnect.');

  // 1. Pull from file → local (merge new bookmarks from other browsers)
  const existing = await readSyncFile(handle);
  let pulled = 0;
  if (existing) pulled = (await applySnapshot(existing)).added;

  // 2. Push local (now including anything just pulled) → file
  const data = await snapshot();
  await writeSyncFile(handle, data);

  return { pulled, count: data.count, by: existing?.exportedBy };
}

// ─────────────────────────────────────────────
// Safari fallback helpers
// ─────────────────────────────────────────────
async function safariPush() {
  const data = await snapshot();
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'})),
    download: FILE,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  return data.count;
}

const safariPull = () => new Promise((ok, fail) => {
  const inp = q('fileInput');
  inp.value = '';
  inp.onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return fail(new Error('No file chosen.'));
    try { ok(await applySnapshot(JSON.parse(await f.text()))); }
    catch(err) { fail(err); }
  };
  inp.click();
});

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────
const q = id => document.getElementById(id);

function show(id) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  q(id).classList.add('active');
}

function orb(id, icoId, state, ico) {
  q(id).className = 'orb'+(state?` ${state}`:'');
  if (ico!==undefined) q(icoId).textContent = ico;
}

function st(titleId, subId, title, sub) {
  q(titleId).textContent = title;
  q(subId).textContent   = sub||'';
}

function clrToast(id) { q(id).className='toast'; }
function toast(id, msg, type) { const e=q(id); e.textContent=msg; e.className=`toast ${type}`; }

function age(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now()-new Date(iso))/1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 120) return '1 min ago';
  if (s < 3600) return `${Math.floor(s/60)} min ago`;
  return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

async function loadLastSync(titleId, subId) {
  const {lastSync} = await chrome.storage.local.get('lastSync');
  if (lastSync) st(titleId, subId, 'Synced', age(lastSync));
  else          st(titleId, subId, 'Ready', 'Tap to sync your bookmarks');
}

// ─────────────────────────────────────────────
// Sync flow  (Chrome / Edge)
// ─────────────────────────────────────────────
let handle = null;

async function triggerSync(silent=false) {
  const btn = q('btnSync');
  btn.disabled = true;
  btn.innerHTML = '<span class="sp"></span> Syncing…';
  clrToast('toastMain');

  orb('orb','orbIco','syncing','⇄');
  st('mTitle','mSub','Syncing…','');

  try {
    const {pulled, count, by} = await doSync(handle);

    await chrome.storage.local.set({lastSync: new Date().toISOString()});
    chrome.action.setBadgeText({text:''}).catch(()=>{});

    orb('orb','orbIco','success','✓');
    btn.innerHTML = '✓ Synced';
    btn.classList.add('done');

    const src = by ? ` · ${by.replace(/\/.+/,'')}` : '';
    if (pulled > 0)
      st('mTitle','mSub', `${pulled} bookmark${pulled===1?'':'s'} added`, `${count} total${src}`);
    else
      st('mTitle','mSub', 'All synced', age(new Date().toISOString()));

    setTimeout(()=>{
      btn.disabled=false; btn.innerHTML='Sync Now'; btn.classList.remove('done');
      orb('orb','orbIco','','⇄');
    }, 2600);

  } catch(err) {
    orb('orb','orbIco','error','!');
    btn.disabled=false; btn.innerHTML='Try Again'; btn.classList.remove('done');
    st('mTitle','mSub','Sync failed','');
    if (!silent) toast('toastMain', err.message, 'err');
  }
}

// ─────────────────────────────────────────────
// Events: Onboarding
// ─────────────────────────────────────────────
q('btnStart').addEventListener('click', ()=>show('vSetup'));
q('btnBackOnboard').addEventListener('click', ()=>show('vOnboard'));

// ─────────────────────────────────────────────
// Events: Setup
// ─────────────────────────────────────────────
q('btnChoose').addEventListener('click', async ()=>{
  try {
    const h = await window.showDirectoryPicker({mode:'readwrite',id:'relay'});
    await dbSet('handle', h);
    await chrome.storage.local.set({seenOnboard:true});
    handle = h;
    show('vMain');
    q('mFolder').textContent = `📁 ${h.name}`;
    st('mTitle','mSub','Connected!','Syncing your bookmarks…');
    setTimeout(()=>triggerSync(), 350);
  } catch(err) {
    if (err.name!=='AbortError') toast('toastSetup', err.message, 'err');
  }
});

// ─────────────────────────────────────────────
// Events: Main
// ─────────────────────────────────────────────
q('btnSync').addEventListener('click', ()=>triggerSync());

q('btnChange').addEventListener('click', async ()=>{
  try {
    const h = await window.showDirectoryPicker({mode:'readwrite',id:'relay'});
    await dbSet('handle', h);
    handle = h;
    q('mFolder').textContent = `📁 ${h.name}`;
    clrToast('toastMain');
  } catch(err) {
    if (err.name!=='AbortError') toast('toastMain', err.message, 'err');
  }
});

q('chkAuto').addEventListener('change', e=>{
  chrome.storage.local.set({autoSync: e.target.checked});
});

// ─────────────────────────────────────────────
// Events: Safari
// ─────────────────────────────────────────────
q('btnSPush').addEventListener('click', async ()=>{
  q('btnSPush').style.opacity='0.5';
  orb('orbS','orbIcoS','syncing','⇄');
  try {
    const c = await safariPush();
    orb('orbS','orbIcoS','success','✓');
    st('sTitle','sSub','Saved!',`${c} bookmarks exported`);
    await chrome.storage.local.set({lastSync:new Date().toISOString(),lastAction:'push'});
    q('sLast').textContent='Saved: just now';
    toast('toastSafari',`relay-bookmarks.json downloaded.\nSave it to your iCloud Drive folder.`,'ok');
    setTimeout(()=>orb('orbS','orbIcoS','','⇄'),2200);
  } catch(err){ orb('orbS','orbIcoS','error','!'); toast('toastSafari',err.message,'err'); }
  finally { q('btnSPush').style.opacity='1'; }
});

q('btnSPull').addEventListener('click', async ()=>{
  q('btnSPull').style.opacity='0.5';
  orb('orbS','orbIcoS','syncing','⇄');
  try {
    const {added,by} = await safariPull();
    orb('orbS','orbIcoS','success','✓');
    const src = by?` · ${by.replace(/\/.+/,'')}`:'' ;
    st('sTitle','sSub',
      added===0?'Already up to date':`${added} bookmark${added===1?'':'s'} added`,
      added===0?`Nothing new${src}`:`Successfully merged${src}`
    );
    await chrome.storage.local.set({lastSync:new Date().toISOString(),lastAction:'pull'});
    q('sLast').textContent='Synced: just now';
    clrToast('toastSafari');
    setTimeout(()=>orb('orbS','orbIcoS','','⇄'),2200);
  } catch(err){
    if(err.message!=='No file chosen.'){
      orb('orbS','orbIcoS','error','!'); toast('toastSafari',err.message,'err');
    } else { orb('orbS','orbIcoS','','⇄'); }
  } finally { q('btnSPull').style.opacity='1'; }
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
async function init() {
  if (SAFARI_MODE) {
    show('vSafari');
    const {lastSync,lastAction}=await chrome.storage.local.get(['lastSync','lastAction']);
    if (lastSync) q('sLast').textContent=`Last ${lastAction||'sync'}: ${age(lastSync)}`;
    return;
  }

  const {autoSync,seenOnboard} = await chrome.storage.local.get(['autoSync','seenOnboard']);
  handle = await dbGet('handle');

  if (!handle) { show(seenOnboard?'vSetup':'vOnboard'); return; }

  // Restore toggle
  q('chkAuto').checked = !!autoSync;

  show('vMain');
  q('mFolder').textContent = `📁 ${handle.name}`;
  await loadLastSync('mTitle','mSub');

  // Auto-sync if: toggle ON and last sync was >30s ago
  const {lastSync} = await chrome.storage.local.get('lastSync');
  const stale = !lastSync || (Date.now()-new Date(lastSync)) > 30_000;
  if (autoSync && stale) setTimeout(()=>triggerSync(true), 320);
}

init();
