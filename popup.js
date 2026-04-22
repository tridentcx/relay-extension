'use strict';

// ─────────────────────────────────────────────────────────────────────
// Password generator — Apple-style strong password (~71 bits entropy)
// Format: xxxxxx-xxxxxx-xxxxxx (three 6-char groups of lowercase a-z + 0-9)
// Each group is guaranteed to contain at least one digit.
// 71 bits vs ~26 bits for the old 4-word system — offline GPU attack
// against PBKDF2-600k would take centuries.
// ─────────────────────────────────────────────────────────────────────
const CHARSET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no confusable l/1/0/o

function genPass() {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    let group = Array.from(bytes).map(b => CHARSET[b % CHARSET.length]);
    // Guarantee at least one digit in every group
    const hasDigit = group.some(c => /[0-9]/.test(c));
    if (!hasDigit) {
      const pos = crypto.getRandomValues(new Uint8Array(1))[0] % 6;
      const digit = '23456789'[crypto.getRandomValues(new Uint8Array(1))[0] % 8];
      group[pos] = digit;
    }
    groups.push(group.join(''));
  }
  return groups.join('-');
}

// ─────────────────────────────────────────────────────────────────────
// Username guardrails
// ─────────────────────────────────────────────────────────────────────
const RESERVED = new Set([
  'relay','admin','administrator','root','system','superuser','mod','moderator',
  'support','help','helpdesk','staff','team','official','ops','operations',
  'test','demo','null','undefined','anonymous','user','username','account',
  'guest','bot','spam','abuse','noreply','no-reply',
  'me','you','we','us','everyone','all','public','private','global',
  'relayapp','relay-app','relaysync','relay-sync','getrelay',
]);

function validateUsername(u) {
  if (!u)              return { ok:false, msg:'' };
  if (u.length < 3)   return { ok:false, msg:'At least 3 characters.' };
  if (u.length > 24)  return { ok:false, msg:'Max 24 characters.' };
  if (!/^[a-z0-9_-]+$/.test(u)) return { ok:false, msg:'Only letters, numbers, - and _.' };
  if (RESERVED.has(u)) return { ok:false, msg:`"${u}" is reserved.` };
  if (/^[_-]|[_-]$|[_-]{2}/.test(u)) return { ok:false, msg:"Can't start/end with - or _ or use them twice." };
  return { ok:true, msg:'' };
}

// ─────────────────────────────────────────────────────────────────────
// Password strength
// ─────────────────────────────────────────────────────────────────────
const COMMON = new Set([
  'password','password1','123456','12345678','qwerty','abc123','letmein',
  'monkey','dragon','master','sunshine','princess','welcome','shadow',
  'passw0rd','password123','pass','1234','test','123','relay123','iloveyou',
]);

function pwStrength(p) {
  if (!p) return 0;
  if (COMMON.has(p.toLowerCase())) return 1;
  let s = 0;
  if (p.length >= 8)  s++;
  if (p.length >= 12) s++;
  if (/[^a-zA-Z0-9]/.test(p) || (/[A-Z]/.test(p) && /[a-z]/.test(p))) s++;
  if (p.length >= 16 || (/[^a-zA-Z0-9]/.test(p) && p.length >= 12)) s++;
  return Math.min(s, 4);
}

function pwHint(p) {
  if (!p) return '';
  if (COMMON.has(p.toLowerCase())) return 'Too common — try something unique.';
  if (p.length < 8) return `${8-p.length} more character${8-p.length===1?'':'s'} needed.`;
  if (pwStrength(p) < 3) {
    const h=[];
    if (p.length < 12)              h.push('make it longer');
    if (!/[A-Z]/.test(p))           h.push('add uppercase');
    if (!/[0-9]/.test(p))           h.push('add a number');
    if (!/[^a-zA-Z0-9]/.test(p))   h.push('add a symbol');
    return h.length ? `Try: ${h.slice(0,2).join(', ')}.` : '';
  }
  return '';
}

function renderStrength(p) {
  const s=pwStrength(p);
  // Use CSS tokens that adapt to light/dark mode
  const root=getComputedStyle(document.documentElement);
  const empty=root.getPropertyValue('--bdr').trim()||'rgba(0,0,0,0.08)';
  const cols=[
    empty,
    root.getPropertyValue('--red').trim()||'#d70015',
    root.getPropertyValue('--amber').trim()||'#b56600',
    root.getPropertyValue('--green').trim()||'#28a745',
    root.getPropertyValue('--green').trim()||'#28a745',
  ];
  const lbls=['','Weak — not accepted','Almost — a bit stronger','Strong','Very strong'];
  for(let i=1;i<=4;i++){
    const b=q(`sb${i}`);
    if(b) b.style.background=i<=s?cols[s]:empty;
  }
  const l=q('strLbl');
  if(l){const h=pwHint(p);l.textContent=p?(h||lbls[s]):'';l.style.color=cols[s];}
}

// ─────────────────────────────────────────────────────────────────────
// Session — chrome.storage.session (survives popup close, clears on browser close)
// ─────────────────────────────────────────────────────────────────────
let _u=null,_p=null;

async function loadSession(){
  try{const d=await chrome.storage.session.get(['relay_u','relay_p']);_u=d.relay_u||null;_p=d.relay_p||null;}
  catch{_u=null;_p=null;}
}
async function saveSession(u,p){
  _u=u;_p=p;
  try{await chrome.storage.session.set({relay_u:u,relay_p:p});}catch{}
}
async function clearSession(){
  _u=null;_p=null;
  try{await chrome.storage.session.remove(['relay_u','relay_p']);}catch{}
}
const getU=()=>_u, getP=()=>_p;

// ─────────────────────────────────────────────────────────────────────
// Account salt — two-secret model
// A 32-byte random salt stored in chrome.storage.local that combines
// with the username in vault key derivation. An attacker who knows
// the username cannot compute the vault key without this salt.
// ─────────────────────────────────────────────────────────────────────
async function getAccountSalt() {
  try {
    const { accountSalt } = await chrome.storage.local.get('accountSalt');
    if (accountSalt && accountSalt.length === 32) {
      return new Uint8Array(accountSalt);
    }
    return null; // no salt yet (legacy account or fresh install)
  } catch { return null; }
}

async function createAccountSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  await chrome.storage.local.set({ accountSalt: Array.from(salt) });
  return salt;
}

// Helper: get vault key using stored salt (or legacy if no salt)
async function myVaultKey() {
  const salt = await getAccountSalt();
  return _relayCrypto.vaultKey(getU(), salt || undefined);
}

// ─────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────
const q=id=>document.getElementById(id);

function show(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  q(id)?.classList.add('active');
}

function eye(inpId, btnId){
  const i = q(inpId);
  const b = q(btnId);
  if (!i || !b) return;
  i.type = i.type === 'password' ? 'text' : 'password';
  // Toggle visual state via opacity rather than swapping icons
  b.style.opacity = i.type === 'password' ? '0.5' : '1';
}

const clrT=(id)=>{const e=q(id);if(e)e.className='toast';};
const toast=(id,msg,t)=>{
  const e=q(id);if(!e)return;
  e.textContent=msg;e.className=`toast ${t}`;
  // Auto-dismiss after 5s for errors, 3s for success
  if(e._dismissTimer)clearTimeout(e._dismissTimer);
  e._dismissTimer=setTimeout(()=>{e.className='toast';},t==='err'?5000:3000);
};

function age(iso){
  if(!iso)return '—';
  const s=Math.round((Date.now()-new Date(iso))/1000);
  if(s<5)  return 'just now';
  if(s<60) return `${s}s ago`;
  if(s<120)return '1m ago';
  if(s<3600)return `${Math.floor(s/60)}m ago`;
  return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

// ─────────────────────────────────────────────────────────────────────
// Plan UI helpers
// ─────────────────────────────────────────────────────────────────────
const PRICING_URL='https://tridentcx.github.io/relay-extension/pricing/';

async function openUpgrade(){
  try {
    const vk = await myVaultKey();
    const data = await _relay.createCheckout(vk);
    if (data?.error === 'already_pro') {
      await chrome.storage.local.set({plan:'pro'});
      applyPlan('pro');
      toast('toastMain','You are already on Pro.','ok');
      return;
    }
    if (data?.url) {
      chrome.tabs.create({url:data.url});
      return;
    }
  } catch {}
  chrome.tabs.create({url:PRICING_URL});
}

function applyPlan(plan){
  const isPro = plan==='pro';

  // [B-11] Hide upgrade alert when becoming Pro
  if (isPro) {
    q('upgradeAlert')?.classList.remove('show');
  }

  // Show/hide history button based on plan
  const histBtn=q('btnShowHistory');
  if(histBtn) histBtn.style.display=isPro?'flex':'none';

  // Visually dim auto-sync toggle for free users
  const autoTog=q('chkAuto')?.closest('.list-row');
  if(autoTog){
    autoTog.style.opacity=isPro?'1':'0.55';
  }

  // Update all chips
  ['mainChip','secChip'].forEach(id=>{
    const el=q(id);
    if(!el)return;
    el.textContent=isPro?'PRO':'FREE';
    el.className=`badge${isPro?' pro':''}`;
  });

  // Update main screen hint
  const hint=q('mainPlanHint');
  if(hint)hint.textContent=isPro?'Pro plan · All features':'Free plan · 500 bookmarks';

  // Show/hide upgrade teaser
  const t=q('upgTeaser');
  if(t)t.style.display=isPro?'none':'flex';

  // Security screen plan details
  const pt=q('secPlanTitle');
  const pb=q('secPlanBody');
  const ub=q('btnUpgrade');
  if(pt)pt.textContent=isPro?'Relay Pro':'Free Plan';
  if(pb)pb.textContent=isPro?'Unlimited bookmarks & browsers, auto-sync, 30-day history.':'Up to 500 bookmarks, 2 browsers, manual sync.';
  if(ub)ub.style.display=isPro?'none':'flex';
}

// ─────────────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────────────
async function runSync(username, password){
  // Load the account salt for this user's vault key derivation
  const accountSalt = await getAccountSalt();
  const btn=q('btnSync');
  btn.disabled=true;
  btn.classList.remove('done','error');btn.classList.add('syncing');
  const orb=q('mainOrb');if(orb)orb.className='orb syncing';
  q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`;
  q('orbLabel').textContent='Syncing…';
  q('orbSub').textContent='Encrypting your bookmarks…';
  clrT('toastMain');

  try{
    const {pulled,count,plan}=await _relay.doSync(username,password,accountSalt);
    await chrome.storage.local.set({lastSync:new Date().toISOString(),plan,bmCount:count});
    // P5: Don't scrub password — needed for subsequent syncs and auto-sync
    // The trade-off: UX wins over marginal security gain here.
    chrome.action.setBadgeText({text:''}).catch(()=>{});

    btn.classList.remove('syncing');btn.classList.add('done');
    if(orb)orb.className='orb done';
    q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    q('orbLabel').textContent=pulled>0?`${pulled} bookmark${pulled===1?'':'s'} added`:'All synced';
    q('orbSub').textContent=`${count} bookmarks synced`;

    // Show persistent stats
    showStats(count, new Date().toISOString());
    applyPlan(plan||'free');

    setTimeout(()=>{
      btn.disabled=false;btn.classList.remove('done');
      if(orb)orb.className='orb';
      q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`;
      q('orbLabel').textContent='Sync Now';
      q('orbSub').textContent=`Synced · ${age(new Date().toISOString())}`;
    },3200);

  }catch(err){
    btn.disabled=false;
    btn.classList.remove('syncing','done');btn.classList.add('error');
    if(orb)orb.className='orb error';

    if(err.message.startsWith('FREE_LIMIT:')){
      const c=err.message.split(':')[1];
      q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
      q('orbLabel').textContent='Upgrade to sync all';
      q('orbSub').textContent=`${c} bookmarks — limit is 500`;
      const al=q('upgradeAlert');if(al)al.classList.add('show');
      btn.classList.remove('error');
      setTimeout(()=>{btn.disabled=false;if(orb)orb.className='orb';q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`;},1500);
      return;
    }
    if(err.message.startsWith('BROWSER_LIMIT:')){
      q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
      q('orbLabel').textContent='Browser limit reached';
      q('orbSub').textContent='Free plan supports 2 browsers';
      toast('toastMain','Free tier supports 2 browsers. Upgrade to add more.','err');
      // Show alert card with upgrade CTA
      const al=q('upgradeAlert');
      if(al){
        al.classList.add('show');
        // Override the alert text
        const txt=al.querySelector('.alert-text');
        if(txt)txt.innerHTML='<b>Browser limit reached.</b>';
      }
      btn.classList.remove('error');
      setTimeout(()=>{btn.disabled=false;if(orb)orb.className='orb';q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`;q('orbLabel').textContent='Try Again';q('orbSub').textContent='';},2200);
      return;
    }

    if(err.message.startsWith('MAINTENANCE:')){
      const msg = err.message.split(':').slice(1).join(':');
      q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
      q('orbLabel').textContent='Maintenance';
      q('orbSub').textContent = msg || 'Relay is temporarily down. Check back soon.';
      btn.classList.remove('error');
      setTimeout(()=>{btn.disabled=false;if(orb)orb.className='orb';q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`;q('orbLabel').textContent='Try Again';q('orbSub').textContent='';},5000);
      return;
    }
    if(err.message.startsWith('RATE_LIMIT:')){
      const window = err.message.split(':')[1];
      q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 10"/></svg>`;
      q('orbLabel').textContent='Slow down';
      q('orbSub').textContent = window === 'minute'
        ? 'Syncing too fast — wait a moment'
        : 'Hourly sync limit reached — try later';
      btn.classList.remove('error');
      setTimeout(()=>{
        btn.disabled=false;
        if(orb)orb.className='orb';
        q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`;
        q('orbLabel').textContent='Sync Now';
        q('orbSub').textContent='';
      }, window === 'minute' ? 15_000 : 60_000);
      return;
    }

    q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    q('orbLabel').textContent='Sync failed';
    q('orbSub').textContent='';
    toast('toastMain',err.message,'err');
    if(err.message.includes('password'))clearSession();
    setTimeout(()=>{
      btn.classList.remove('error');
      if(orb)orb.className='orb';
      if(q('orbIco'))q('orbIco').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>`;
      if(q('orbLabel'))q('orbLabel').textContent='Try Again';
    },2200);
  }
}

function showStats(count, lastSync){
  const stats=q('syncStats');
  const scEl=q('statCount');
  const stEl=q('statTime');
  if(stats&&scEl&&stEl){
    scEl.textContent=count>=0?count.toLocaleString():'—';
    stEl.textContent=age(lastSync);
    stats.classList.add('visible');
  }
}

// ─────────────────────────────────────────────────────────────────────
// Go to main
// ─────────────────────────────────────────────────────────────────────
async function goMain(initialSync=false){
  const u=getU();
  show('vMain');
  if(q('mainUsername'))q('mainUsername').textContent= u ? `@${u}` : '—';
  await chrome.storage.local.set({hasAccount:true,username:u});

  const {lastSync,autoSync:aS,plan:cachedPlan,bmCount}=
    await chrome.storage.local.get(['lastSync','autoSync','plan','bmCount']);

  // Show cached plan immediately for snappy UI, then re-verify in background
  applyPlan(cachedPlan||'free');

  if(lastSync&&bmCount!=null){
    showStats(bmCount,lastSync);
    q('orbLabel').textContent='Sync Now';
    q('orbSub').textContent=`Synced · ${age(lastSync)}`;
  }else{
    q('orbLabel').textContent='Sync Now';
    q('orbSub').textContent='Tap to sync your bookmarks';
  }

  // [B-10] Re-verify plan from server, then update toggle if downgraded
  (async () => {
    try {
      const vk = await myVaultKey();
      const planInfo = await _relay.getPlan(vk);
      const realPlan = planInfo.effective_plan;
      if (realPlan !== cachedPlan) {
        await chrome.storage.local.set({plan: realPlan});
        applyPlan(realPlan);
      }
      // [B-9] If user is no longer Pro, force auto-sync OFF
      if (realPlan !== 'pro' && aS) {
        await chrome.storage.local.set({autoSync: false});
        q('chkAuto').checked = false;
      } else {
        q('chkAuto').checked = !!aS;
      }
    } catch {
      q('chkAuto').checked = !!aS;
    }
  })();

  // For sync-on-open behavior:
  // - initialSync=true means we just signed in, do a sync to merge any cloud changes
  // - aS=true && stale means auto-sync is on and we haven't synced recently
  const stale=!lastSync||(Date.now()-new Date(lastSync))>300_000;
  if(initialSync||(aS&&stale&&cachedPlan==='pro'))
    setTimeout(()=>runSync(getU(),getP()),350);
}

// ─────────────────────────────────────────────────────────────────────
// Username check
// ─────────────────────────────────────────────────────────────────────
let uTimer=null,uGen=0,uValid=false;

async function checkUsername(username){
  const myGen=++uGen;
  const sEl=q('unameStatus'),mEl=q('unameMsg'),iEl=q('unameIcon'),inp=q('unameInput');
  // iEl will be null (unameIcon removed in v4.6) — setIcon() guards all uses
  const setIcon = (txt) => { if (iEl) iEl.textContent = txt; };
  const sugsEl=q('suggestions');

  sEl.style.opacity='0';
  sugsEl.style.display='none';
  inp.classList.remove('valid','taken');
  uValid=false;q('btnCreate').disabled=true;
  if(!username)return;

  const {ok,msg}=validateUsername(username);
  if(!ok){
    if(msg&&myGen===uGen){
      sEl.className='uname-status taken';sEl.style.opacity='1';
      mEl.textContent=msg;setIcon('✗');inp.classList.add('taken');
    }
    return;
  }

  sEl.className='uname-status checking';sEl.style.opacity='1';
  mEl.textContent='Checking…';setIcon('·');

  const avail=await _relay.checkUsernameAvailable(username);
  if(myGen!==uGen)return;

  if(avail){
    sEl.className='uname-status ok';mEl.textContent=`@${username} is available ✓`;
    setIcon('✓');inp.classList.add('valid');uValid=true;updateCreate();
  }else{
    sEl.className='uname-status taken';mEl.textContent=`@${username} is taken`;
    setIcon('✗');inp.classList.add('taken');
    // suggestions
    const ADJS=['swift','calm','bold','bright','cool','deep','free','glad','kind','lone','neat','pure'];
    const NOUNS=['panda','tiger','river','storm','cedar','ember','frost','grove','raven','stone','lark'];
    const clean=username.replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,10)||'user';
    const arr=new Uint32Array(4);crypto.getRandomValues(arr);
    const sugs=[
      `${clean}${(arr[0]%90)+10}`,
      `${ADJS[arr[1]%ADJS.length]}-${clean}`,
      `${clean}-${NOUNS[arr[2]%NOUNS.length]}`,
      `${ADJS[arr[3]%ADJS.length]}-${NOUNS[arr[0]%NOUNS.length]}`,
    ];
    sugsEl.textContent='';
    sugs.forEach(s=>{
      const btn=document.createElement('button');
      btn.className='sug-btn';
      btn.dataset.n=s;
      btn.textContent=`@${s}`;
      sugsEl.appendChild(btn);
    });
    sugsEl.style.display='flex';
    sugsEl.querySelectorAll('.sug-btn').forEach(b=>{
      b.addEventListener('click',()=>{
        q('unameInput').value=b.dataset.n;
        sugsEl.style.display='none';
        clearTimeout(uTimer);checkUsername(b.dataset.n);
      });
    });
  }
}

function updateCreate(){
  const pass=q('passInput')?.value||'';
  const conf=q('passConfirm')?.value||'';
  const match=pass&&conf&&pass===conf;
  q('btnCreate').disabled=!(uValid&&pwStrength(pass)>=3&&match);
}

// ─────────────────────────────────────────────────────────────────────
// Sign In events
// ─────────────────────────────────────────────────────────────────────
q('siEye').addEventListener('click',()=>eye('siPassword','siEye'));

// FIX [C4]: Keyboard navigation
// Auto-lowercase + trim username as user types
q('siUsername').addEventListener('input',e=>{
  const cleaned=e.target.value.toLowerCase().trim();
  if(e.target.value!==cleaned)e.target.value=cleaned;
});
q('siUsername').addEventListener('keydown',e=>{if(e.key==='Enter')q('siPassword').focus();});
q('siPassword').addEventListener('keydown',e=>{if(e.key==='Enter')q('btnSignIn').click();});

q('btnSignIn').addEventListener('click',async()=>{
  const username=q('siUsername').value.trim().toLowerCase();
  const password=q('siPassword').value.trim();
  if(!username){toast('toastSignIn','Enter your username.','err');return;}
  if(!password){toast('toastSignIn','Enter your password.','err');return;}

  const btn=q('btnSignIn');
  btn.disabled=true;
  btn.innerHTML='<span class="sp"></span> Verifying…';
  clrT('toastSignIn');

  try{
    // FIX: Verify vault exists + password decrypts correctly BEFORE
    // advancing to main view. This was previously letting anything through.
    // Sign-in must first try with legacy key (no salt) since we don't have
    // the account salt yet — it lives in local storage of the device that created it.
    // If that fails we check if a salt exists locally (returning user on same device).
    const legacyVk = await _relayCrypto.vaultKey(username); // no salt
    const localSalt = await getAccountSalt();
    const saltedVk  = localSalt ? await _relayCrypto.vaultKey(username, localSalt) : null;

    if(!_relayCrypto.isValidVaultKey(legacyVk)) throw new Error('Invalid username.');

    // Try salted first (existing device), then legacy
    let remote = saltedVk ? await _relay.pullFromCloud(saltedVk) : null;
    let usedVk  = saltedVk;
    if (!remote?.data) {
      remote = await _relay.pullFromCloud(legacyVk);
      usedVk = legacyVk;
    }

    if(!remote?.data){
      throw new Error('No account found. Check your username, or create a new account.');
    }

    // Verify password decrypts the vault
    try{
      await _relayCrypto.decrypt(remote.data, password);
    }catch{
      throw new Error('Wrong password. Please try again.');
    }

    // Credentials verified. Clear local storage, then restore only values that
    // are definitely valid for the vault we just authenticated.
    // NOTE: Keeping an old accountSalt while signing into a legacy vault
    // (or different account) causes sync to derive the wrong vault key.
    const { browserId, accountSalt: existingSalt } = await chrome.storage.local.get(['browserId','accountSalt']);
    const signedInWithLocalSalt = !!(localSalt && usedVk === saltedVk);
    await chrome.storage.local.clear();
    if (browserId) await chrome.storage.local.set({ browserId });
    if (signedInWithLocalSalt && existingSalt) {
      await chrome.storage.local.set({ accountSalt: existingSalt });
    }

    await saveSession(username, password);
    await chrome.storage.local.set({hasAccount:true, username});
    q('siUsername').value='';q('siPassword').value='';

    // Now actually advance to main view and run the real sync
    await goMain(true);

  }catch(err){
    toast('toastSignIn',err.message,'err');
    await clearSession();
    // Clear password but keep username so they can retry
    q('siPassword').value='';
    q('siPassword').focus();
  }finally{
    btn.disabled=false;
    btn.innerHTML='Sign In →';
  }
});

q('btnNewUserSignIn').addEventListener('click',()=>{
  // FIX [C2]: Pre-generate password before showing setup
  const p=genPass();
  q('genText').textContent=p;
  q('passInput').value=p;
  renderStrength(p);
  show('vSetup');
});

// ─────────────────────────────────────────────────────────────────────
// Setup events
// ─────────────────────────────────────────────────────────────────────
// FIX [C3]: Back goes to sign in, not orphaned onboarding
q('btnBackSetup').addEventListener('click',()=>show('vSignIn'));

q('unameInput').addEventListener('input',()=>{
  const v=q('unameInput').value.toLowerCase().replace(/[^a-z0-9\-_]/g,'');
  if(q('unameInput').value!==v)q('unameInput').value=v;
  clearTimeout(uTimer);uTimer=setTimeout(()=>checkUsername(v),480);
  updateCreate();
});
q('unameInput').addEventListener('keydown',e=>{if(e.key==='Enter')q('passInput').focus();});

q('passEye').addEventListener('click',()=>eye('passInput','passEye'));
q('passConfirmEye').addEventListener('click',()=>eye('passConfirm','passConfirmEye'));

q('passInput').addEventListener('keydown',e=>{if(e.key==='Enter')q('passConfirm').focus();});
q('passInput').addEventListener('input',()=>{
  const p=q('passInput').value;
  q('genText').textContent=p||'…';
  renderStrength(p);
  updateCreate();
  checkPassMatch();
});

// FIX [C1]: Password confirm + live match check
q('passConfirm').addEventListener('input',()=>{
  checkPassMatch();updateCreate();
});
q('passConfirm').addEventListener('keydown',e=>{if(e.key==='Enter')q('btnCreate').click();});

function checkPassMatch(){
  const p=q('passInput').value, c=q('passConfirm').value;
  const el=q('passMatchStatus');
  if(!c){el.className='pass-match';return;}
  if(p===c){
    el.className='pass-match show ok';
    el.innerHTML='<span>✓</span> Passwords match';
  }else{
    el.className='pass-match show fail';
    el.innerHTML='<span>✗</span> Passwords don\'t match';
  }
}

q('btnRefresh').addEventListener('click',()=>{
  const p=genPass();
  q('genText').textContent=p;
  q('passInput').value=p;
  q('passConfirm').value='';
  q('passMatchStatus').className='pass-match';
  renderStrength(p);updateCreate();
});

q('btnCopyGen').addEventListener('click',async()=>{
  const pw = q('genText').textContent;
  await navigator.clipboard.writeText(pw);
  q('btnCopyGen').textContent='✓';
  setTimeout(()=>q('btnCopyGen').textContent='⎘',1400);

  // FIX [MED-4]: Auto-clear clipboard after 30s if it still has the password
  setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === pw) await navigator.clipboard.writeText('');
    } catch {} // permission denied is fine
  }, 30_000);
});

q('btnCreate').addEventListener('click',async()=>{
  const username=q('unameInput').value.trim();
  const password=q('passInput').value;
  const confirm=q('passConfirm').value;

  if(!uValid){toast('toastSetup','Choose an available username.','err');return;}
  if(pwStrength(password)<3){toast('toastSetup','Password is too weak — aim for Strong.','err');return;}
  if(password!==confirm){toast('toastSetup','Passwords don\'t match.','err');return;}

  q('btnCreate').disabled=true;
  q('btnCreate').innerHTML='<span class="sp"></span> Creating…';

  try{
    const avail=await _relay.checkUsernameAvailable(username);
    if(!avail){
      toast('toastSetup','That username was just taken. Try another.','err');
      q('btnCreate').disabled=false;q('btnCreate').innerHTML='Create Account →';return;
    }
    // Generate and persist the account salt BEFORE saving session
    // This must happen on the same device as account creation
    await createAccountSalt();
    await saveSession(username,password);
    await chrome.storage.local.set({hasAccount:true,username});

    // FIX [H6]: Show welcome screen first
    show('vWelcome');
    setTimeout(async()=>{
      await goMain(true);
    },2200);
  }catch(err){
    toast('toastSetup',err.message,'err');
    q('btnCreate').disabled=false;q('btnCreate').innerHTML='Create Account →';
  }
});

// ─────────────────────────────────────────────────────────────────────
// Main events
// ─────────────────────────────────────────────────────────────────────
let _syncInProgress = false;
q('btnSync').addEventListener('click',async()=>{
  if(_syncInProgress)return; // FIX [H-7]: Prevent concurrent syncs
  const u=getU(),p=getP();
  if(!u||!p){show('vSignIn');return;}
  _syncInProgress = true;
  try { await runSync(u,p); }
  finally { _syncInProgress = false; }
});

// Make whole account row clickable
q('accountRow')?.addEventListener('click',()=>show('vSecurity'));
q('btnSecurity')?.addEventListener('click',e=>{e.stopPropagation();show('vSecurity');});

q('chkAuto').addEventListener('change',async e=>{
  const {plan}=await chrome.storage.local.get('plan');
  if(e.target.checked && plan!=='pro'){
    // Revert immediately and warn
    e.target.checked=false;
    toast('toastMain','Auto-sync is a Pro feature. Upgrade to enable it.','err');
    setTimeout(()=>clrT('toastMain'),3500);
    return;
  }
  await chrome.storage.local.set({autoSync:e.target.checked});
});

q('upgradeAlertBtn')?.addEventListener('click',openUpgrade);

// ─────────────────────────────────────────────────────────────────────
// Settings events
// ─────────────────────────────────────────────────────────────────────
q('btnBackMain').addEventListener('click',()=>show('vMain'));
q('btnUpgrade')?.addEventListener('click',openUpgrade);
q('upgTeaser')?.addEventListener('click',openUpgrade);

q('btnShowGift')?.addEventListener('click',()=>{
  clrT('toastGift');q('giftInput').value='';show('vGift');
});

// ── History (Pro only) ──────────────────────────────────────────────
q('btnShowHistory')?.addEventListener('click',async()=>{
  const {plan}=await chrome.storage.local.get('plan');
  if(plan!=='pro'){
    toast('toastMain','Sync history is a Pro feature.','err');
    return;
  }
  show('vHistory');
  q('historyList').innerHTML='<div style="text-align:center;color:var(--t-2);padding:20px">Loading…</div>';
  try{
    const u=getU();
    const vk=await myVaultKey();
    const list=await _relay.listHistory(vk);
    if(list.length===0){
      q('historyList').innerHTML='<div style="text-align:center;color:var(--t-2);padding:20px">No history yet. Sync to start tracking.</div>';
      return;
    }
    // FIX [M-8]: Build elements via DOM API instead of innerHTML to prevent XSS
    const escId = (s) => String(s).replace(/[^a-zA-Z0-9-]/g, '');
    q('historyList').innerHTML='';
    list.forEach(s=>{
      const date=new Date(s.created_at);
      if(isNaN(date)) return; // skip invalid dates
      const ago=age(s.created_at);
      const dt=date.toLocaleDateString([],{month:'short',day:'numeric'})+' '+date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      const count = (typeof s.bookmark_count === 'number' && s.bookmark_count >= 0) ? s.bookmark_count : '?';

      const btn = document.createElement('button');
      btn.className = 'list-row';
      btn.dataset.id = escId(s.id);

      const ico = document.createElement('div');
      ico.className = 'row-icon';
      ico.textContent = '📅';

      const cnt = document.createElement('div');
      cnt.className = 'row-content';
      const t = document.createElement('div');
      t.className = 'row-title';
      t.textContent = dt;
      const sub = document.createElement('div');
      sub.className = 'row-subtitle';
      sub.textContent = `${count} bookmarks · ${ago}`;
      cnt.append(t, sub);

      const tr = document.createElement('div');
      tr.className = 'row-trailing';
      tr.textContent = '↶';

      btn.append(ico, cnt, tr);
      btn.addEventListener('click', () => confirmRestore(btn.dataset.id));
      q('historyList').appendChild(btn);
    });
    // (handlers attached during build above)
	  }catch(err){
	    const el=q('historyList');
	    el.textContent='';
	    const msg=document.createElement('div');
	    msg.style.cssText='color:var(--red);padding:20px;text-align:center';
	    msg.textContent=err.message;
	    el.appendChild(msg);
	  }
	});

q('btnBackHistory')?.addEventListener('click',()=>show('vSecurity'));

let pendingRestoreId=null;
function confirmRestore(id){
  pendingRestoreId=id;
  show('vRestoreConfirm');
}

q('btnRestoreCancel')?.addEventListener('click',()=>{pendingRestoreId=null;show('vHistory');});
q('btnRestoreCancel2')?.addEventListener('click',()=>{pendingRestoreId=null;show('vHistory');});

q('btnRestoreConfirm')?.addEventListener('click',async()=>{
  if(!pendingRestoreId)return;
  const btn=q('btnRestoreConfirm');
  btn.disabled=true;btn.innerHTML='<span class="sp"></span> Restoring…';
  try{
    const u=getU(),p=getP();
    if(!u||!p)throw new Error('Session expired. Sign in again.');
    const vk=await myVaultKey();
    // FIX [M-13]: restoreFromSnapshot now validates decryption before merging
    const {restored,count}=await _relay.restoreFromSnapshot(pendingRestoreId,p,vk);
    await chrome.storage.local.set({bmCount:count,lastSync:new Date().toISOString()});
    toast('toastRestore',`Restored ${restored} bookmarks. Total: ${count}.`,'ok');
    setTimeout(async()=>{
      pendingRestoreId=null;
      // Refresh main view with new count
      showStats(count, new Date().toISOString());
      q('orbSub').textContent=`Synced · just now`;
      show('vMain');
    },1800);
  }catch(err){
    toast('toastRestore',err.message,'err');
  }finally{
    btn.disabled=false;btn.innerHTML='Restore this snapshot';
  }
});

q('btnLock').addEventListener('click',async()=>{
  // Clear session creds AND all local storage so account A's data
  // doesn't leak into account B's session in the same browser.
  // We keep browserId since it's tied to this physical browser, not the user.
  await clearSession();
  // Preserve browserId (tied to physical browser) and accountSalt (tied to vault key)
  // so a returning user on this device can sign back in without losing their vault key.
  // Preserve device-bound keys; clear user-bound session data
  const {browserId, accountSalt, writeToken} = await chrome.storage.local.get(['browserId','accountSalt','writeToken']);
  await chrome.storage.local.clear();
  if(browserId)   await chrome.storage.local.set({browserId});
  if(accountSalt) await chrome.storage.local.set({accountSalt});
  if(writeToken)  await chrome.storage.local.set({writeToken});
  // Auth tokens are user-bound — clear them so next user gets a fresh identity
  // (clearAuthToken is in sync.js scope via the shared supabase module)
  try { await _relay.clearAuthToken(); } catch {}

  // Clear stale UI state so previous account's data doesn't briefly flash
  q('mainUsername').textContent='—';
  q('mainPlanHint').textContent='Free plan';
  q('statCount').textContent='—';
  q('statTime').textContent='—';
  q('syncStats')?.classList.remove('visible');
  q('orbLabel').textContent='Sync Now';
  q('orbSub').textContent='Tap to sync your bookmarks';
  applyPlan('free');

  show('vSignIn');
});
q('btnDeleteAccount')?.addEventListener('click',()=>show('vDeleteConfirm'));

// ─────────────────────────────────────────────────────────────────────
// Gift code events
// ─────────────────────────────────────────────────────────────────────
q('btnBackGift')?.addEventListener('click',()=>show('vSecurity'));

// FIX [M4]: Auto-format with dashes + paste detection
q('giftInput')?.addEventListener('input',()=>{
  let v=q('giftInput').value.replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,12);
  if(v.length>8)      v=v.slice(0,4)+'-'+v.slice(4,8)+'-'+v.slice(8);
  else if(v.length>4) v=v.slice(0,4)+'-'+v.slice(4);
  q('giftInput').value=v;
});
q('giftInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')q('btnRedeemGift').click();});

q('btnRedeemGift')?.addEventListener('click',async()=>{
  const code=q('giftInput').value.trim().toUpperCase();
  if(code.length<14){toast('toastGift','Enter a complete gift code (XXXX-XXXX-XXXX).','err');return;}

  const btn=q('btnRedeemGift');
  btn.disabled=true;btn.innerHTML='<span class="sp"></span> Redeeming…';
  clrT('toastGift');

  try{
    const u=getU();
    if(!u){throw new Error('Session expired. Sign in again.');}
    const vk=await myVaultKey();
    if(!_relayCrypto.isValidVaultKey(vk)){throw new Error('Invalid vault key.');}
    let data;
    try {
      data = await _relay.redeemGiftCode(code, vk);
    } catch {
      toast('toastGift','Server error. Try again.','err');
      btn.disabled=false;btn.innerHTML='Redeem →';
      return;
    }
    if(!data || !data.success){
      toast('toastGift',data.error||'Invalid code.','err');
    }else{
      // [H-12]: Verify with server, don't trust local set
      try {
        const u = getU();
        const vk = await myVaultKey();
        const planInfo = await _relay.getPlan(vk);
        await chrome.storage.local.set({plan: planInfo.effective_plan});
        applyPlan(planInfo.effective_plan);
      } catch {
        await chrome.storage.local.set({plan:'pro'});
        applyPlan('pro');
      }
      // FIX [H-11]: Format human-readable expiry instead of raw days count
      let msg = '🎉 Pro activated!';
      if (data.days && data.days < 36500) {
        const expDate = new Date(Date.now() + data.days * 86400_000);
        msg = `🎉 Pro activated until ${expDate.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'})}`;
      } else if (data.days >= 36500) {
        msg = '🎉 Pro activated for life!';
      }
      toast('toastGift', msg, 'ok');
      setTimeout(()=>show('vSecurity'),2200);
    }
  }catch{
    toast('toastGift','Something went wrong. Try again.','err');
  }finally{
    btn.disabled=false;btn.innerHTML='Redeem →';
  }
});

// ─────────────────────────────────────────────────────────────────────
// Delete account events
// ─────────────────────────────────────────────────────────────────────
q('btnDeleteCancel')?.addEventListener('click',()=>show('vSecurity'));
q('btnDeleteCancel2')?.addEventListener('click',()=>show('vSecurity'));

q('btnDeleteConfirm')?.addEventListener('click',async()=>{
  const btn=q('btnDeleteConfirm');
  btn.disabled=true;btn.innerHTML='<span class="sp"></span> Deleting…';

  try{
    const u = getU();
    const p = getP();
    if (!u || !p) throw new Error('Session expired. Sign in again.');

    const vk = await myVaultKey();

    // FIX [MED-1]: Validate vault key format before any DB operation
    if (!_relayCrypto.isValidVaultKey(vk)) throw new Error('Invalid vault key.');

    // FIX [CRIT-1]: Verify password is correct BEFORE allowing delete.
    // Pull the encrypted blob and try to decrypt — only proceed if it works.
    // This prevents anyone-with-username from deleting other people's vaults.
    const remote = await _relay.pullFromCloud(vk);
    if (remote?.data) {
      try {
        await _relayCrypto.decrypt(remote.data, p);
      } catch {
        throw new Error('Password verification failed. Cannot delete.');
      }
    }
    // (If no remote data, vault is local-only — safe to clear)

    // Delete via relay module — keeps Supabase credentials out of popup scope
    await _relay.deleteVault(vk, remote?.data);

    await clearSession();
    await chrome.storage.local.clear();
    show('vDeleted');
    setTimeout(()=>show('vSignIn'),3000);

  }catch(err){
    btn.disabled=false;btn.innerHTML='Delete my account';
    toast('toastDelete',err.message,'err');
  }
});

// ─────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────
async function init(){
  // Show version from manifest
  try{
    const v=chrome.runtime.getManifest().version;
    const lbl=q('versionLabel');
    if(lbl) lbl.textContent=`Relay v${v}`;
  }catch{}

  await loadSession();
  const {hasAccount}=await chrome.storage.local.get('hasAccount');
  if(!hasAccount){show('vSignIn');return;}
  const u=getU(),p=getP();
  if(!u||!p){show('vSignIn');return;}
  await goMain();
}

init();
