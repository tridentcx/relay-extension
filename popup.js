'use strict';

// ─────────────────────────────────────────────────────────────────────
// Username suggestions — generated when a name is taken
// ─────────────────────────────────────────────────────────────────────
const ADJECTIVES = ['swift','calm','bold','bright','cool','deep','free','glad','kind','lone','neat','pure','soft','true','wise','zesty'];
const NOUNS      = ['panda','tiger','river','storm','cedar','ember','frost','grove','haven','island','lark','maple','prism','quartz','raven','stone'];

function generateSuggestions(base) {
  const clean = base.replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,12) || 'relay';
  const arr   = new Uint32Array(4);
  crypto.getRandomValues(arr);
  return [
    `${clean}${(arr[0]%90)+10}`,
    `${ADJECTIVES[arr[1]%ADJECTIVES.length]}-${clean}`,
    `${clean}-${NOUNS[arr[2]%NOUNS.length]}`,
    `${ADJECTIVES[arr[3]%ADJECTIVES.length]}-${NOUNS[arr[0]%NOUNS.length]}`,
  ];
}

// ─────────────────────────────────────────────────────────────────────
// Password strength
// ─────────────────────────────────────────────────────────────────────
function pwStrength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8)  s++;
  if (p.length >= 12) s++;
  if (/[^a-zA-Z0-9]/.test(p) || /[A-Z]/.test(p)) s++;
  if (p.length >= 16) s++;
  return s;
}

function renderStrength(p) {
  const s    = pwStrength(p);
  const cols = ['#dddde3','#e63946','#f4a020','#2dc653','#2dc653'];
  const lbls = ['','Weak','Fair','Strong','Very strong'];
  for (let i=1;i<=4;i++) { const b=q(`sb${i}`); if(b) b.style.background = i<=s?cols[s]:'#dddde3'; }
  const l=q('strLbl'); if(l){l.textContent=p?lbls[s]:''; l.style.color=cols[s];}
}

// ─────────────────────────────────────────────────────────────────────
// Session (clears on browser close)
// ─────────────────────────────────────────────────────────────────────
const getU   = ()  => sessionStorage.getItem('relay_u');
const setU   = v   => sessionStorage.setItem('relay_u', v);
const getP   = ()  => sessionStorage.getItem('relay_p');
const setP   = v   => sessionStorage.setItem('relay_p', v);
const clearS = ()  => { sessionStorage.removeItem('relay_u'); sessionStorage.removeItem('relay_p'); };

// ─────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────
const q      = id  => document.getElementById(id);
const show   = id  => { document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); q(id)?.classList.add('active'); };
const clrT   = id  => { const e=q(id); if(e) e.className='toast'; };
const toast  = (id,msg,type) => { const e=q(id); if(!e) return; e.textContent=msg; e.className=`toast ${type}`; };
const eyeBtn = (iId,bId) => { const i=q(iId); i.type=i.type==='password'?'text':'password'; q(bId).textContent=i.type==='password'?'👁':'🙈'; };

function age(iso) {
  const s = Math.round((Date.now()-new Date(iso))/1000);
  if (s<5)    return 'just now';
  if (s<60)   return `${s}s ago`;
  if (s<120)  return '1 min ago';
  if (s<3600) return `${Math.floor(s/60)} min ago`;
  return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

// ─────────────────────────────────────────────────────────────────────
// Username availability check (debounced)
// ─────────────────────────────────────────────────────────────────────
let unameTimer = null;
let unameValid = false;

async function checkUsername(username) {
  const statusEl = q('unameStatus');
  const msgEl    = q('unameMsg');
  const iconEl   = q('unameIcon');
  const inp      = q('unameInput');
  const sugsEl   = q('suggestions');
  const createBtn= q('btnCreate');

  if (!username || username.length < 3) {
    statusEl.style.opacity='0';
    sugsEl.style.display='none';
    inp.classList.remove('valid','taken');
    unameValid = false;
    createBtn.disabled = true;
    return;
  }

  // Show checking state
  statusEl.className='uname-status checking';
  statusEl.style.opacity='1';
  msgEl.textContent='Checking availability…';
  iconEl.textContent='·';
  inp.classList.remove('valid','taken');
  sugsEl.style.display='none';
  unameValid = false;
  createBtn.disabled = true;

  const available = await checkUsernameAvailable(username);

  if (available) {
    statusEl.className='uname-status ok';
    msgEl.textContent=`@${username} is available ✓`;
    iconEl.textContent='✓';
    inp.classList.add('valid');
    unameValid = true;
    updateCreateBtn();
  } else {
    statusEl.className='uname-status taken';
    msgEl.textContent=`@${username} is taken`;
    iconEl.textContent='✗';
    inp.classList.add('taken');
    unameValid = false;
    createBtn.disabled = true;

    // Show suggestions
    const sugs = generateSuggestions(username);
    sugsEl.innerHTML = sugs.map(s =>
      `<button class="sug-btn" data-name="${s}">@${s}</button>`
    ).join('');
    sugsEl.style.display='flex';

    sugsEl.querySelectorAll('.sug-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        q('unameInput').value = btn.dataset.name;
        sugsEl.style.display = 'none';
        clearTimeout(unameTimer);
        checkUsername(btn.dataset.name);
      });
    });
  }
}

function debouncedCheck(username) {
  clearTimeout(unameTimer);
  unameTimer = setTimeout(() => checkUsername(username), 500);
}

function updateCreateBtn() {
  const pass = q('passInput')?.value||'';
  q('btnCreate').disabled = !(unameValid && pwStrength(pass) >= 2);
}

// ─────────────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────────────
async function runSync(username, password) {
  const btn = q('btnSync');
  btn.disabled=true; btn.classList.add('syncing');
  q('orbIco').textContent='⇄';
  q('orbLabel').textContent='Syncing…';
  q('orbSub').textContent='Encrypting your bookmarks';
  clrT('toastMain');

  try {
    const { pulled, count } = await doSync(username, password);
    await chrome.storage.local.set({ lastSync:new Date().toISOString() });
    chrome.action.setBadgeText({text:''}).catch(()=>{});

    btn.classList.remove('syncing'); btn.classList.add('done');
    q('orbIco').textContent='✓';
    q('orbLabel').textContent = pulled>0 ? `${pulled} bookmark${pulled===1?'':'s'} added` : 'All synced';
    q('orbSub').textContent   = `${count} bookmarks · encrypted`;

    setTimeout(()=>{
      btn.disabled=false; btn.classList.remove('done');
      q('orbIco').textContent='⇄';
      q('orbLabel').textContent='Sync Now';
      q('orbSub').textContent=`Last synced just now`;
    }, 3000);

  } catch(err) {
    btn.disabled=false; btn.classList.remove('syncing','done');
    q('orbIco').textContent='!';
    q('orbLabel').textContent='Sync failed';
    q('orbSub').textContent='';
    toast('toastMain', err.message, 'err');
    if (err.message.includes('password')) clearS();
    setTimeout(()=>{ q('orbIco').textContent='⇄'; q('orbLabel').textContent='Try Again'; },2000);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Go to main
// ─────────────────────────────────────────────────────────────────────
async function goMain(autoSync=false) {
  const u = getU();
  show('vMain');
  q('mainUsername').textContent = `@${u}`;
  const { lastSync, autoSync:aS } = await chrome.storage.local.get(['lastSync','autoSync']);
  q('chkAuto').checked = !!aS;
  q('orbLabel').textContent = 'Sync Now';
  q('orbSub').textContent   = lastSync ? `Last synced ${age(lastSync)}` : 'Ready — tap to sync';

  if (autoSync || (aS && (!lastSync || Date.now()-new Date(lastSync)>30_000)))
    setTimeout(()=>runSync(getU(), getP()), 320);
}

// ─────────────────────────────────────────────────────────────────────
// Events: Onboarding
// ─────────────────────────────────────────────────────────────────────
q('btnNewUser').addEventListener('click', ()=>show('vSetup'));
q('btnReturning').addEventListener('click', ()=>show('vSignIn'));

// ─────────────────────────────────────────────────────────────────────
// Events: Setup
// ─────────────────────────────────────────────────────────────────────
q('btnBackSetup').addEventListener('click', ()=>show('vOnboard'));

q('unameInput').addEventListener('input', ()=>{
  const val = q('unameInput').value.toLowerCase().replace(/[^a-z0-9\-_]/g,'');
  q('unameInput').value = val;
  debouncedCheck(val);
});

q('passInput').addEventListener('input', ()=>{
  renderStrength(q('passInput').value);
  updateCreateBtn();
});

q('passEye').addEventListener('click', ()=>eyeBtn('passInput','passEye'));

q('btnCreate').addEventListener('click', async ()=>{
  const username = q('unameInput').value.trim();
  const password = q('passInput').value;
  if (!unameValid) { toast('toastSetup','Choose an available username.','err'); return; }
  if (pwStrength(password) < 2) { toast('toastSetup','Choose a stronger password.','err'); return; }

  q('btnCreate').disabled=true;
  q('btnCreate').innerHTML='<span class="sp"></span> Creating…';

  try {
    // Double-check availability right before creating
    const stillAvail = await checkUsernameAvailable(username);
    if (!stillAvail) { toast('toastSetup','That username was just taken. Pick another.','err'); q('btnCreate').disabled=false; q('btnCreate').innerHTML='Create Account →'; return; }

    setU(username);
    setP(password);
    await chrome.storage.local.set({ hasAccount:true, username });
    await goMain(true); // auto-sync on first create
  } catch(err) {
    toast('toastSetup', err.message, 'err');
    q('btnCreate').disabled=false;
    q('btnCreate').innerHTML='Create Account →';
  }
});

// ─────────────────────────────────────────────────────────────────────
// Events: Main
// ─────────────────────────────────────────────────────────────────────
q('btnSync').addEventListener('click', ()=>{
  const u=getU(), p=getP();
  if (!u||!p) { show('vSignIn'); return; }
  runSync(u, p);
});

q('btnSecurity').addEventListener('click', ()=>show('vSecurity'));
q('chkAuto').addEventListener('change', e=>chrome.storage.local.set({autoSync:e.target.checked}));

// ─────────────────────────────────────────────────────────────────────
// Events: Security
// ─────────────────────────────────────────────────────────────────────
q('btnLock').addEventListener('click', ()=>{ clearS(); show('vSignIn'); });
q('btnBackMain').addEventListener('click', ()=>show('vMain'));

// ─────────────────────────────────────────────────────────────────────
// Events: Sign In
// ─────────────────────────────────────────────────────────────────────
q('siEye').addEventListener('click', ()=>eyeBtn('siPassword','siEye'));

q('btnSignIn').addEventListener('click', async ()=>{
  const username = q('siUsername').value.trim().toLowerCase();
  const password = q('siPassword').value;
  if (!username) { toast('toastSignIn','Enter your username.','err'); return; }
  if (!password) { toast('toastSignIn','Enter your password.','err'); return; }

  q('btnSignIn').disabled=true;
  q('btnSignIn').innerHTML='<span class="sp"></span> Signing in…';

  setU(username);
  setP(password);
  q('siUsername').value='';
  q('siPassword').value='';
  await chrome.storage.local.set({ hasAccount:true, username });
  await goMain(true);

  q('btnSignIn').disabled=false;
  q('btnSignIn').innerHTML='Sign In &amp; Sync →';
});

['siUsername','siPassword'].forEach(id=>{
  q(id).addEventListener('keydown', e=>{ if(e.key==='Enter') q('btnSignIn').click(); });
});

q('btnNewUserSignIn').addEventListener('click', ()=>show('vSetup'));

// ─────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────
async function init() {
  const { hasAccount } = await chrome.storage.local.get('hasAccount');

  // No account on this browser → default to sign-in
  // (primary use case = existing user on new browser)
  if (!hasAccount) { show('vSignIn'); return; }

  const u = getU(), p = getP();
  if (!u || !p) { show('vSignIn'); return; }

  await goMain();
}

init();
