'use strict';

// ─────────────────────────────────────────────────────────────────────
// Passphrase generator — 4 random words from a curated list
// ~50 bits of entropy — strong enough, easy to write down
// ─────────────────────────────────────────────────────────────────────
const WORDS = [
  'apple','amber','atlas','azure','blaze','bloom','breeze','bridge',
  'cedar','cloud','coral','crane','dawn','delta','drift','dune',
  'eagle','echo','ember','epoch','fern','field','flame','flint',
  'forest','frost','glade','gleam','grove','haven','hawk','haze',
  'hollow','horizon','ice','inlet','island','jade','jasper','lake',
  'lark','lemon','light','linden','maple','marsh','meadow','mist',
  'moon','moss','mountain','nova','oak','ocean','olive','opal',
  'orbit','peak','pine','prism','quartz','rain','rapid','raven',
  'reef','ridge','river','rock','rose','rush','sage','sand',
  'sierra','silver','sky','slate','snow','solar','spark','spring',
  'star','stone','storm','stream','summit','swift','terra','tide',
  'timber','vale','violet','wave','willow','wind','winter','zenith'
];

function generatePassphrase() {
  const arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(n => WORDS[n % WORDS.length]).join('-');
}

// ─────────────────────────────────────────────────────────────────────
// Passphrase strength
// ─────────────────────────────────────────────────────────────────────
function strength(pass) {
  if (!pass) return 0;
  let score = 0;
  if (pass.length >= 8)  score++;
  if (pass.length >= 16) score++;
  if (/[^a-z0-9-]/i.test(pass)) score++;
  if (pass.length >= 24 || pass.split('-').length >= 4) score++;
  return score;
}

function updateStrength(pass) {
  const s = strength(pass);
  const colors = ['#e5e5ea','#ff3b30','#ff9500','#34c759','#34c759'];
  const labels = ['','Weak','Fair','Strong','Very strong'];
  for (let i = 1; i <= 4; i++) {
    q(`sb${i}`).style.background = i <= s ? colors[s] : '#e5e5ea';
  }
  q('strengthLabel').textContent = pass ? labels[s] : '';
  q('strengthLabel').style.color = colors[s];
}

// ─────────────────────────────────────────────────────────────────────
// Session (clears when browser closes)
// ─────────────────────────────────────────────────────────────────────
const SK = 'relay_pass';
const getPass   = () => sessionStorage.getItem(SK);
const setPass   = p  => sessionStorage.setItem(SK, p);
const clearPass = () => sessionStorage.removeItem(SK);

// ─────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────
const q = id => document.getElementById(id);

function show(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  q(id).classList.add('active');
}

function setOrb(id, state, ico) {
  q(id).className = 'orb' + (state ? ` ${state}` : '');
  const el = q(id).querySelector('.orb-ico');
  if (el && ico !== undefined) el.textContent = ico;
}

function st(tId, sId, title, sub) {
  q(tId).textContent = title;
  q(sId).textContent = sub || '';
}

function clrToast(id) { q(id).className = 'toast'; }
function toast(id, msg, type) { const e = q(id); e.textContent = msg; e.className = `toast ${type}`; }

function eyeToggle(inputId, btnId) {
  const inp = q(inputId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  q(btnId).textContent = inp.type === 'password' ? '👁' : '🙈';
}

function age(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 5)    return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 120)  return '1 min ago';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

// ─────────────────────────────────────────────────────────────────────
// Sync flow
// ─────────────────────────────────────────────────────────────────────
async function runSync(pass, orbId, tId, sId, btnId, toastId) {
  const btn = q(btnId);
  btn.disabled = true;
  btn.innerHTML = '<span class="sp"></span> Syncing…';
  clrToast(toastId);
  setOrb(orbId, 'syncing', '⇄');
  st(tId, sId, 'Syncing…', 'Encrypting your bookmarks…');

  try {
    const { pulled, count } = await doSync(pass);
    await chrome.storage.local.set({ lastSync: new Date().toISOString() });
    chrome.action.setBadgeText({ text: '' }).catch(() => {});

    setOrb(orbId, 'success', '✓');
    btn.innerHTML = '✓ Synced';
    btn.classList.add('done');

    if (pulled > 0)
      st(tId, sId, `${pulled} bookmark${pulled===1?'':'s'} added`, `${count} total · encrypted`);
    else
      st(tId, sId, 'All synced', `${count} bookmarks · encrypted`);

    setTimeout(() => {
      btn.disabled = false; btn.innerHTML = 'Sync Now'; btn.classList.remove('done');
      setOrb(orbId, '', '⇄');
    }, 2800);

  } catch (err) {
    setOrb(orbId, 'error', '!');
    btn.disabled = false; btn.innerHTML = 'Try Again'; btn.classList.remove('done');
    st(tId, sId, 'Sync failed', '');
    toast(toastId, err.message, 'err');
    if (err.message.includes('passphrase')) clearPass();
  }
}

// ─────────────────────────────────────────────────────────────────────
// Events: Onboarding
// ─────────────────────────────────────────────────────────────────────
q('btnStart').addEventListener('click', async () => {
  const { hasVault } = await chrome.storage.local.get('hasVault');
  show(hasVault ? 'vUnlock' : 'vSetup');
});

q('btnBackOnboard').addEventListener('click', () => show('vOnboard'));

// ─────────────────────────────────────────────────────────────────────
// Events: Setup — passphrase
// ─────────────────────────────────────────────────────────────────────
q('passEye').addEventListener('click', () => eyeToggle('passInput', 'passEye'));

q('passInput').addEventListener('input', () => {
  updateStrength(q('passInput').value);
  // Hide generated box if user is typing manually
  if (q('passGenBox').style.display !== 'none') {
    const typed = q('passInput').value;
    const generated = q('passGenText').textContent;
    if (typed !== generated) q('passGenBox').style.display = 'none';
  }
});

// Generate passphrase
q('btnGenPass').addEventListener('click', () => {
  const pass = generatePassphrase();
  q('passGenText').textContent = pass;
  q('passGenBox').style.display = 'flex';
  q('passInput').value = pass;
  q('passInput').type = 'text'; // show it so user can read it
  q('passEye').textContent = '🙈';
  updateStrength(pass);
  q('btnGenPass').textContent = '✨ Generate another';
});

// Refresh generated passphrase
q('btnRefreshPass').addEventListener('click', () => {
  const pass = generatePassphrase();
  q('passGenText').textContent = pass;
  q('passInput').value = pass;
  updateStrength(pass);
});

// Copy generated passphrase
q('btnCopyPass').addEventListener('click', async () => {
  await navigator.clipboard.writeText(q('passGenText').textContent);
  q('btnCopyPass').textContent = '✓';
  setTimeout(() => q('btnCopyPass').textContent = '⎘', 1500);
});

q('passInput').addEventListener('keydown', e => { if (e.key === 'Enter') q('btnSetup').click(); });

q('btnSetup').addEventListener('click', async () => {
  const pass = q('passInput').value.trim();
  if (pass.length < 8) { toast('toastSetup', 'Passphrase must be at least 8 characters.', 'err'); return; }
  setPass(pass);
  const vaultId = generateVaultId();
  await chrome.storage.local.set({ hasVault: true, seenOnboard: true, vaultId });
  show('vMain');
  await loadMainMeta();
  setTimeout(() => runSync(pass, 'mainOrb', 'mTitle', 'mSub', 'btnSync', 'toastMain'), 300);
});

// ─────────────────────────────────────────────────────────────────────
// Events: Main
// ─────────────────────────────────────────────────────────────────────
async function loadMainMeta() {
  const { lastSync, autoSync } = await chrome.storage.local.get(['lastSync','autoSync']);
  q('chkAuto').checked = !!autoSync;
  if (lastSync) st('mTitle', 'mSub', 'Synced', age(lastSync));
  else          st('mTitle', 'mSub', 'Ready', 'Tap to sync your bookmarks');
}

q('btnSync').addEventListener('click', () => {
  const pass = getPass();
  if (!pass) { show('vUnlock'); return; }
  runSync(pass, 'mainOrb', 'mTitle', 'mSub', 'btnSync', 'toastMain');
});

q('btnLock').addEventListener('click', () => { clearPass(); show('vUnlock'); });

q('chkAuto').addEventListener('change', e => chrome.storage.local.set({ autoSync: e.target.checked }));

// ─────────────────────────────────────────────────────────────────────
// Events: Unlock
// ─────────────────────────────────────────────────────────────────────
q('unlockEye').addEventListener('click', () => eyeToggle('unlockInput', 'unlockEye'));

q('btnUnlock').addEventListener('click', async () => {
  const pass = q('unlockInput').value.trim();
  if (!pass) return;
  setPass(pass);
  q('unlockInput').value = '';
  show('vMain');
  await loadMainMeta();
  setTimeout(() => runSync(pass, 'mainOrb', 'mTitle', 'mSub', 'btnSync', 'toastMain'), 300);
});

q('unlockInput').addEventListener('keydown', e => { if (e.key === 'Enter') q('btnUnlock').click(); });

// ─────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────
async function init() {
  const { hasVault, autoSync, lastSync, seenOnboard } =
    await chrome.storage.local.get(['hasVault','autoSync','lastSync','seenOnboard']);

  if (!hasVault) { show(seenOnboard ? 'vSetup' : 'vOnboard'); return; }

  const pass = getPass();
  if (!pass) { show('vUnlock'); return; }

  show('vMain');
  q('chkAuto').checked = !!autoSync;
  if (lastSync) st('mTitle', 'mSub', 'Synced', age(lastSync));
  else          st('mTitle', 'mSub', 'Ready', 'Tap to sync');

  const stale = !lastSync || (Date.now() - new Date(lastSync)) > 30_000;
  if (autoSync && stale)
    setTimeout(() => runSync(pass, 'mainOrb', 'mTitle', 'mSub', 'btnSync', 'toastMain'), 320);
}

init();
