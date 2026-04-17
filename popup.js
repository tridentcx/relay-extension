'use strict';

// ─────────────────────────────────────────────────────────────────────
// Username suggestions — generated when a name is taken
// ─────────────────────────────────────────────────────────────────────
const ADJECTIVES = ['swift','calm','bold','bright','cool','deep','free','glad','kind','lone','neat','pure','soft','true','wise','zesty'];
const NOUNS      = ['panda','tiger','river','storm','cedar','ember','frost','grove','haven','island','lark','maple','prism','quartz','raven','stone'];

function generateSuggestions(base) {
  const clean = base.replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,12) || 'user';
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
// Username guardrails
// ─────────────────────────────────────────────────────────────────────
const RESERVED = new Set([
  // Brand / system
  'relay','admin','administrator','root','system','superuser','mod','moderator',
  'support','help','helpdesk','staff','team','official','ops','operations',
  // Generic abuse vectors
  'test','demo','null','undefined','anonymous','user','username','account',
  'guest','bot','spam','abuse','noreply','no-reply',
  // Common squats
  'me','you','we','us','everyone','all','public','private','global',
  // Relay-specific
  'relayapp','relay-app','relaysync','relay-sync','getrelay',
]);

const BLOCKED_PATTERNS = [
  /^[_\-]/, /[_\-]$/, // can't start or end with _ or -
  /[_\-]{2}/,          // no consecutive separators
];

function validateUsername(username) {
  if (!username)           return { ok:false, msg:'' };
  if (username.length < 3) return { ok:false, msg:'At least 3 characters.' };
  if (username.length > 24)return { ok:false, msg:'Max 24 characters.' };
  if (!/^[a-z0-9_-]+$/.test(username))
                           return { ok:false, msg:'Only letters, numbers, - and _.' };
  if (RESERVED.has(username))
                           return { ok:false, msg:`"${username}" is reserved.` };
  if (BLOCKED_PATTERNS.some(r => r.test(username)))
                           return { ok:false, msg:"Can't start/end with - or _ or use them consecutively." };
  return { ok:true, msg:'' };
}

// ─────────────────────────────────────────────────────────────────────
// Password strength — minimum 3/4 required to create account
// ─────────────────────────────────────────────────────────────────────
const COMMON_PASSWORDS = new Set([
  'password','password1','123456','12345678','qwerty','abc123','letmein',
  'monkey','1234567','dragon','master','sunshine','princess','welcome',
  'shadow','superman','michael','football','iloveyou','admin','login',
  'passw0rd','password123','pass','1234','test','123','relay123',
]);

function pwStrength(p) {
  if (!p) return 0;
  if (COMMON_PASSWORDS.has(p.toLowerCase())) return 1; // cap at weak
  let s = 0;
  if (p.length >= 8)  s++;
  if (p.length >= 12) s++;
  if (/[^a-zA-Z0-9]/.test(p) || (/[A-Z]/.test(p) && /[a-z]/.test(p))) s++;
  if (p.length >= 16 || (/[^a-zA-Z0-9]/.test(p) && p.length >= 12)) s++;
  return Math.min(s, 4);
}

function pwRequirement(p) {
  // Returns a hint for what the user still needs to do
  if (!p)              return '';
  if (COMMON_PASSWORDS.has(p.toLowerCase())) return 'Too common — try something unique.';
  if (p.length < 8)    return `${8-p.length} more character${8-p.length===1?'':'s'} needed.`;
  if (pwStrength(p) < 3) {
    const hints = [];
    if (p.length < 12)       hints.push('make it longer');
    if (!/[A-Z]/.test(p))    hints.push('add uppercase');
    if (!/[0-9]/.test(p))    hints.push('add a number');
    if (!/[^a-zA-Z0-9]/.test(p)) hints.push('add a symbol');
    return hints.length ? `Try: ${hints.slice(0,2).join(', ')}.` : '';
  }
  return '';
}

function renderStrength(p) {
  const s    = pwStrength(p);
  const cols = ['#dddde3','#e63946','#f4a020','#2dc653','#2dc653'];
  const lbls = ['','Weak — not accepted','Fair — almost there','Strong ✓','Very strong ✓'];
  for (let i=1;i<=4;i++) { const b=q(`sb${i}`); if(b) b.style.background = i<=s?cols[s]:'#dddde3'; }
  const l=q('strLbl');
  if (l) {
    const req = pwRequirement(p);
    l.textContent = p ? (req || lbls[s]) : '';
    l.style.color  = cols[s];
  }
}

// ─────────────────────────────────────────────────────────────────────
// Session — chrome.storage.session
// This is the correct API for extension session state:
// - Persists across popup open/close ✓
// - Shared across all extension contexts ✓
// - Clears automatically when browser closes ✓
// - Never written to disk ✓
// ─────────────────────────────────────────────────────────────────────
let _sessionU = null;
let _sessionP = null;

async function loadSession() {
  try {
    const data = await chrome.storage.session.get(['relay_u','relay_p']);
    _sessionU = data.relay_u || null;
    _sessionP = data.relay_p || null;
  } catch { _sessionU = null; _sessionP = null; }
}

async function saveSession(u, p) {
  _sessionU = u;
  _sessionP = p;
  try { await chrome.storage.session.set({ relay_u: u, relay_p: p }); } catch {}
}

async function clearSession() {
  _sessionU = null;
  _sessionP = null;
  try { await chrome.storage.session.remove(['relay_u','relay_p']); } catch {}
}

const getU   = () => _sessionU;
const getP   = () => _sessionP;
const setU   = v  => { _sessionU = v; };
const setP   = v  => { _sessionP = v; };
const clearS = () => clearSession();

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
let unameTimer    = null;
let unameValid    = false;
let unameGeneration = 0; // FIX [H1]: discard stale async results

async function checkUsername(username) {
  const statusEl = q('unameStatus');
  const msgEl    = q('unameMsg');
  const iconEl   = q('unameIcon');
  const inp      = q('unameInput');
  const sugsEl   = q('suggestions');
  const createBtn= q('btnCreate');

  // FIX [H1]: Capture this check's generation before any await
  const myGen = ++unameGeneration;

  // Reset
  statusEl.style.opacity='0';
  sugsEl.style.display='none';
  inp.classList.remove('valid','taken');
  unameValid = false;
  createBtn.disabled = true;

  if (!username) return;

  // Local validation first — no network call needed
  const { ok, msg } = validateUsername(username);
  if (!ok) {
    if (msg && myGen === unameGeneration) {
      statusEl.className='uname-status taken';
      statusEl.style.opacity='1';
      msgEl.textContent = msg;
      iconEl.textContent='✗';
      inp.classList.add('taken');
    }
    return;
  }

  // Show checking state
  statusEl.className='uname-status checking';
  statusEl.style.opacity='1';
  msgEl.textContent='Checking availability…';
  iconEl.textContent='·';

  const available = await checkUsernameAvailable(username);

  // FIX [H1]: Discard result if a newer check has started
  if (myGen !== unameGeneration) return;

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
  q('btnCreate').disabled = !(unameValid && pwStrength(pass) >= 3);
}

// ─────────────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────────────
async function runSync(username, password) {
  const btn = q('btnSync');
  btn.disabled=true;
  btn.classList.remove('done'); btn.classList.add('syncing');
  const orbEl = q('mainOrb'); if(orbEl) orbEl.className='orb syncing';
  q('orbIco').textContent='⇄';
  q('orbLabel').textContent='Syncing…';
  q('orbSub').textContent='Encrypting your bookmarks…';
  clrT('toastMain');

  try {
    const { pulled, count, plan } = await doSync(username, password);
    await chrome.storage.local.set({ lastSync:new Date().toISOString(), plan });
    chrome.action.setBadgeText({text:''}).catch(()=>{});

    btn.classList.remove('syncing'); btn.classList.add('done');
    const orbElS = q('mainOrb'); if(orbElS) orbElS.className='orb done';
    q('orbIco').textContent='✓';
    q('orbLabel').textContent = pulled>0 ? `${pulled} bookmark${pulled===1?'':'s'} added` : 'All synced';
    q('orbSub').textContent   = `${count} bookmarks · encrypted`;

    // Update plan badge
    updatePlanBadge(plan);

    setTimeout(()=>{
      btn.disabled=false; btn.classList.remove('done','syncing');
      const orbElR = q('mainOrb'); if(orbElR) orbElR.className='orb';
      q('orbIco').textContent='⇄';
      q('orbLabel').textContent='Sync Now';
      q('orbSub').textContent='Last synced just now';
    }, 3000);

  } catch(err) {
    btn.disabled=false; btn.classList.remove('syncing','done');

    // Handle free tier limit gracefully
    if (err.message.startsWith('FREE_LIMIT:')) {
      const count = err.message.split(':')[1];
      q('orbIco').textContent='⚡';
      q('orbLabel').textContent='Upgrade to sync all';
      q('orbSub').textContent=`${count} bookmarks — free limit is 500`;
      toast('toastMain', `You have ${count} bookmarks. Free plan supports 500. Upgrade to Pro for unlimited.`, 'err');
      showUpgradePrompt();
      return;
    }

    const orbElE = q('mainOrb'); if(orbElE) orbElE.className='orb';
    q('orbIco').textContent='⚠';
    q('orbLabel').textContent='Sync failed';
    q('orbSub').textContent='';
    toast('toastMain', err.message, 'err');
    if (err.message.includes('password')) clearS();
    setTimeout(()=>{ if(q('orbIco')) q('orbIco').textContent='⇄'; if(q('orbLabel')) q('orbLabel').textContent='Try Again'; },2000);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Plan helpers
// ─────────────────────────────────────────────────────────────────────
const PRICING_URL = 'https://shahakshat14.github.io/relay-extension/pricing/';

function updatePlanBadge(plan) {
  const chip = q('mainChip');
  if (!chip) return;
  if (plan === 'pro') {
    chip.textContent = 'PRO';
    chip.style.background = 'rgba(67,97,238,0.1)';
    chip.style.color = '#4361ee';
    chip.style.borderColor = 'rgba(67,97,238,0.2)';
  } else {
    chip.textContent = 'FREE';
    chip.style.background = 'rgba(45,198,83,0.09)';
    chip.style.color = '#2dc653';
    chip.style.borderColor = 'rgba(45,198,83,0.18)';
  }
}

function showUpgradePrompt() {
  const el = q('upgradeRow');
  if (el) { el.style.display = 'flex'; el.classList.add('upgrade-row'); }
}

// ─────────────────────────────────────────────────────────────────────
// Go to main
// ─────────────────────────────────────────────────────────────────────
async function goMain(autoSync=false) {
  const u = getU();
  show('vMain');
  q('mainUsername').textContent = `@${u}`;

  // BUG 2 FIX: Always persist so returning user stays signed in
  await chrome.storage.local.set({ hasAccount: true, username: u });

  const { lastSync, autoSync:aS, plan } =
    await chrome.storage.local.get(['lastSync','autoSync','plan']);
  q('chkAuto').checked = !!aS;
  q('orbLabel').textContent = 'Sync Now';
  q('orbSub').textContent   = lastSync ? `Last synced ${age(lastSync)}` : 'Ready — tap to sync';

  // Restore plan badge from storage (so it shows even before sync)
  updatePlanBadge(plan || 'free');

  if (autoSync || (aS && (!lastSync || Date.now()-new Date(lastSync)>30_000)))
    setTimeout(()=>runSync(getU(), getP()), 320);
}

// FIX [H3]: Pending sign-in — only persist credentials after successful sync
async function goMainPending(autoSync=false) {
  const u = getU();
  show('vMain');
  q('mainUsername').textContent = `@${u}`;
  q('chkAuto').checked = false;
  q('orbLabel').textContent = 'Sync Now';
  q('orbSub').textContent   = 'Tap to verify your credentials';

  if (autoSync) {
    setTimeout(async () => {
      try {
        await runSync(getU(), getP());
        // Only persist after successful sync — credentials verified
        await chrome.storage.local.set({ hasAccount: true, username: u });
      } catch {
        // runSync already shows the error — don't persist bad credentials
      }
    }, 320);
  }
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
  // Sanitise as user types — only allow valid chars, lowercase
  const val = q('unameInput').value.toLowerCase().replace(/[^a-z0-9\-_]/g,'');
  if (q('unameInput').value !== val) q('unameInput').value = val;
  debouncedCheck(val);
});

q('unameInput').addEventListener('keydown', e=>{
  if (e.key==='Enter') q('passInput')?.focus();
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
  if (pwStrength(password) < 3) { toast('toastSetup','Password too weak — aim for Strong or better.','err'); return; }

  q('btnCreate').disabled=true;
  q('btnCreate').innerHTML='<span class="sp"></span> Creating…';

  try {
    // Double-check availability right before creating
    const stillAvail = await checkUsernameAvailable(username);
    if (!stillAvail) { toast('toastSetup','That username was just taken. Pick another.','err'); q('btnCreate').disabled=false; q('btnCreate').innerHTML='Create Account →'; return; }

    await saveSession(username, password);
    await chrome.storage.local.set({ hasAccount:true, username });
    await goMain(true);
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

q('btnUpgrade')?.addEventListener('click', ()=>{
  chrome.tabs.create({ url: PRICING_URL });
});

q('upgradeRowBtn')?.addEventListener('click', ()=>{
  chrome.tabs.create({ url: PRICING_URL });
});
q('chkAuto').addEventListener('change', e=>chrome.storage.local.set({autoSync:e.target.checked}));

// ─────────────────────────────────────────────────────────────────────
// Events: Security
// ─────────────────────────────────────────────────────────────────────
q('btnLock').addEventListener('click', ()=>{ clearS(); show('vSignIn'); });
q('btnBackMain').addEventListener('click', ()=>show('vMain'));

// ── Gift codes ────────────────────────────────────────────────────────
q('btnShowGift')?.addEventListener('click', ()=>{
  clrT('toastGift');
  q('giftInput').value = '';
  show('vGift');
});

q('btnBackGift')?.addEventListener('click', ()=>show('vSecurity'));

q('giftInput')?.addEventListener('input', ()=>{
  // Auto-format as XXXX-XXXX-XXXX
  let val = q('giftInput').value.replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,12);
  if (val.length > 8)       val = val.slice(0,4)+'-'+val.slice(4,8)+'-'+val.slice(8);
  else if (val.length > 4)  val = val.slice(0,4)+'-'+val.slice(4);
  q('giftInput').value = val;
});

q('giftInput')?.addEventListener('keydown', e=>{
  if (e.key==='Enter') q('btnRedeemGift').click();
});

q('btnRedeemGift')?.addEventListener('click', async ()=>{
  const code = q('giftInput').value.trim().toUpperCase();
  if (code.length < 14) { toast('toastGift','Enter a complete gift code.','err'); return; }

  const btn = q('btnRedeemGift');
  btn.disabled = true;
  btn.innerHTML = '<span class="sp"></span> Redeeming…';
  clrT('toastGift');

  try {
    const u  = getU();
    const vk = await vaultKey(u);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_gift_code`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ p_code: code, p_vault_key: vk }),
    });

    const data = await res.json();

    if (!data.success) {
      toast('toastGift', data.error || 'Invalid code.', 'err');
    } else {
      await chrome.storage.local.set({ plan: 'pro' });
      updatePlanBadge('pro');
      toast('toastGift', `🎉 Pro activated for ${data.days} days!`, 'ok');
      setTimeout(()=>show('vMain'), 2000);
    }
  } catch(err) {
    toast('toastGift', 'Something went wrong. Try again.', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Redeem →';
  }
});

q('btnDeleteAccount')?.addEventListener('click', ()=>show('vDeleteConfirm'));
q('btnDeleteCancel')?.addEventListener('click', ()=>show('vSecurity'));

q('btnDeleteConfirm')?.addEventListener('click', async ()=>{
  const btn = q('btnDeleteConfirm');
  btn.disabled = true;
  btn.innerHTML = '<span class="sp"></span> Deleting…';

  try {
    const u = getU();
    const vaultId = await vaultKey(u);

    // Delete vault from Supabase
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vaults?vault_key=eq.${vaultId}`, {
      method: 'DELETE',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
      },
    });

    if (!res.ok) throw new Error('Delete failed.');

    // Clear all local state
    clearS();
    await chrome.storage.local.clear();

    // Show confirmation then go to sign in
    show('vDeleted');
    setTimeout(()=>show('vSignIn'), 3000);

  } catch(err) {
    btn.disabled = false;
    btn.innerHTML = 'Yes, delete everything';
    toast('toastDelete', err.message, 'err');
  }
});

// ─────────────────────────────────────────────────────────────────────
// Events: Sign In
// ─────────────────────────────────────────────────────────────────────
q('siEye').addEventListener('click', ()=>eyeBtn('siPassword','siEye'));

q('btnSignIn').addEventListener('click', async ()=>{
  const username = q('siUsername').value.trim().toLowerCase();
  const password = q('siPassword').value.trim(); // FIX [M5]: trim trailing spaces
  if (!username) { toast('toastSignIn','Enter your username.','err'); return; }
  if (!password) { toast('toastSignIn','Enter your password.','err'); return; }

  q('btnSignIn').disabled=true;
  q('btnSignIn').innerHTML='<span class="sp"></span> Signing in…';

  await saveSession(username, password);
  q('siUsername').value='';
  q('siPassword').value='';
  await goMainPending(true);

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
  // Load session from background worker first
  await loadSession();

  const { hasAccount } = await chrome.storage.local.get('hasAccount');

  if (!hasAccount) { show('vSignIn'); return; }

  const u = getU(), p = getP();
  if (!u || !p) { show('vSignIn'); return; }

  await goMain();
}

init();
