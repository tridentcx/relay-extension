'use strict';

// ─────────────────────────────────────────────────────────────────────
// Passphrase generator — shown by default on setup
// ─────────────────────────────────────────────────────────────────────
const WORDS = [
  'apple','amber','atlas','azure','blaze','bloom','breeze','bridge',
  'cedar','cloud','coral','crane','dawn','delta','drift','dune',
  'eagle','echo','ember','epoch','fern','field','flame','flint',
  'forest','frost','glade','gleam','grove','haven','hawk','haze',
  'hollow','horizon','inlet','island','jade','jasper','lake','lark',
  'lemon','light','linden','maple','marsh','meadow','mist','moon',
  'moss','mountain','nova','oak','ocean','olive','opal','orbit',
  'peak','pine','prism','quartz','rain','rapid','raven','reef',
  'ridge','river','rock','rose','rush','sage','sand','sierra',
  'silver','sky','slate','snow','solar','spark','spring','star',
  'stone','storm','stream','summit','swift','terra','tide','timber',
  'vale','violet','wave','willow','wind','winter','zenith','zephyr'
];

function genPass() {
  const arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(n => WORDS[n % WORDS.length]).join('-');
}

function strength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8)  s++;
  if (p.length >= 16) s++;
  if (/[^a-z0-9\-]/i.test(p)) s++;
  if (p.length >= 24 || p.split('-').length >= 4) s++;
  return s;
}

function renderStrength(p) {
  const s = strength(p);
  const cols  = ['#dddde3','#e63946','#f4a020','#2dc653','#2dc653'];
  const lbls  = ['', 'Weak', 'Fair', 'Strong', 'Very strong'];
  for (let i = 1; i <= 4; i++) {
    const b = q(`sb${i}`);
    if (b) b.style.background = i <= s ? cols[s] : '#dddde3';
  }
  const lbl = q('sLbl');
  if (lbl) { lbl.textContent = p ? lbls[s] : ''; lbl.style.color = cols[s]; }
}

// ─────────────────────────────────────────────────────────────────────
// Recovery key download
// ─────────────────────────────────────────────────────────────────────
async function downloadRecoveryKey(passphrase) {
  const { vaultId } = await chrome.storage.local.get('vaultId');
  const date = new Date().toLocaleDateString('en-CA');
  const content = `RELAY RECOVERY KEY
==================
Generated: ${date}

Keep this file safe. Anyone with BOTH secrets below can access your bookmarks.

━━━━━━━━━━━━━━━━━━━━━━━━━━
SECRET 1 — VAULT ID
━━━━━━━━━━━━━━━━━━━━━━━━━━
${vaultId}

A random code that locates your encrypted vault.
NOT derived from your passphrase.
Knowing one secret tells an attacker nothing about the other.

━━━━━━━━━━━━━━━━━━━━━━━━━━
SECRET 2 — PASSPHRASE
━━━━━━━━━━━━━━━━━━━━━━━━━━
${passphrase}

Encrypts and decrypts your bookmarks using AES-256-GCM.
Never stored or transmitted by Relay.

━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO RESTORE (if you reinstall Relay)
━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Install Relay in your browser
2. On the welcome screen, tap "Already use Relay"
3. Tap "Restore from recovery key"
4. Enter your Vault ID and Passphrase from this file
5. Your bookmarks are restored

━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW RELAY PROTECTS YOU
━━━━━━━━━━━━━━━━━━━━━━━━━━
• Bookmarks are encrypted on your device before any network request.
• The cloud stores only encrypted gibberish — unreadable without your passphrase.
• Even Relay's developers cannot read your bookmarks.
• You need BOTH secrets to access your data.

Store this file in a password manager or encrypted drive.
Do NOT store it in plain cloud storage.
`;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
    download: `relay-recovery-${date}.txt`,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ─────────────────────────────────────────────────────────────────────
// Session passphrase (clears when browser closes)
// ─────────────────────────────────────────────────────────────────────
const SK      = 'relay_p';
const getP    = ()  => sessionStorage.getItem(SK);
const setP    = p   => sessionStorage.setItem(SK, p);
const clearP  = ()  => sessionStorage.removeItem(SK);

// ─────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────
const q = id => document.getElementById(id);

function show(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = q(id);
  if (el) el.classList.add('active');
}

function eye(inpId, btnId) {
  const inp = q(inpId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  q(btnId).textContent = inp.type === 'password' ? '👁' : '🙈';
}

function clrT(id) { const e = q(id); if(e) e.className = 'toast'; }
function toast(id, msg, type) { const e = q(id); if(!e) return; e.textContent = msg; e.className = `toast ${type}`; }

function age(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 5)    return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 120)  return '1 min ago';
  if (s < 3600) return `${Math.floor(s/60)} min ago`;
  return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

async function loadVaultId() {
  const { vaultId } = await chrome.storage.local.get('vaultId');
  if (!vaultId) return;
  const short = vaultId.slice(0,8) + '…' + vaultId.slice(-4);
  ['vaultIdDisplay','vaultIdSec'].forEach(id => {
    const el = q(id);
    if (el) { el.textContent = short; el.title = vaultId; }
  });
}

async function copyVaultId(btnId) {
  const { vaultId } = await chrome.storage.local.get('vaultId');
  await navigator.clipboard.writeText(vaultId);
  const b = q(btnId);
  b.textContent = 'Copied!';
  setTimeout(() => b.textContent = 'Copy', 1500);
}

// ─────────────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────────────
async function runSync(pass) {
  const btn = q('btnSync');
  btn.disabled = true;
  btn.classList.add('syncing');
  q('orbIco').textContent = '⇄';
  q('orbLabel').textContent = 'Syncing…';
  q('orbSub').textContent = 'Encrypting your bookmarks';
  clrT('toastMain');

  try {
    const { pulled, count } = await doSync(pass);
    await chrome.storage.local.set({ lastSync: new Date().toISOString() });
    chrome.action.setBadgeText({ text: '' }).catch(() => {});

    btn.classList.remove('syncing');
    btn.classList.add('done');
    q('orbIco').textContent = '✓';
    q('orbLabel').textContent = pulled > 0 ? `${pulled} bookmark${pulled===1?'':'s'} added` : 'All synced';
    q('orbSub').textContent = `${count} bookmarks · encrypted`;

    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('done');
      q('orbIco').textContent = '⇄';
      q('orbLabel').textContent = 'Sync Now';
      q('orbSub').textContent = `Last synced just now`;
    }, 3000);

  } catch(err) {
    btn.disabled = false;
    btn.classList.remove('syncing','done');
    q('orbIco').textContent = '!';
    q('orbLabel').textContent = 'Sync failed';
    q('orbSub').textContent = '';
    toast('toastMain', err.message, 'err');
    if (err.message.includes('passphrase')) clearP();
    setTimeout(() => {
      q('orbIco').textContent = '⇄';
      q('orbLabel').textContent = 'Try Again';
    }, 2000);
  }
}

// ─────────────────────────────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────────────────────────────
q('btnNewUser').addEventListener('click', () => {
  // Pre-generate a passphrase immediately
  const p = genPass();
  q('genText').textContent = p;
  q('passInput').value = p;
  q('passInput').type = 'text';
  q('passEye').textContent = '🙈';
  renderStrength(p);
  show('vSetup');
});

q('btnReturningUser').addEventListener('click', () => show('vRestore'));

// ─────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────
q('passEye').addEventListener('click', () => eye('passInput','passEye'));

q('passInput').addEventListener('input', () => {
  renderStrength(q('passInput').value);
  // Sync gen box text if user is editing the generated value
  const genBox = q('genBox');
  if (genBox) {
    const typed = q('passInput').value;
    q('genText').textContent = typed || '—';
  }
});

q('btnRefresh').addEventListener('click', () => {
  const p = genPass();
  q('genText').textContent = p;
  q('passInput').value = p;
  q('passInput').type = 'text';
  q('passEye').textContent = '🙈';
  renderStrength(p);
});

q('btnCopyGen').addEventListener('click', async () => {
  await navigator.clipboard.writeText(q('genText').textContent);
  q('btnCopyGen').textContent = '✓';
  setTimeout(() => q('btnCopyGen').textContent = '⎘', 1500);
});

q('btnBackSetup').addEventListener('click', () => show('vOnboard'));

q('passInput').addEventListener('keydown', e => { if (e.key==='Enter') q('btnSetup').click(); });

q('btnSetup').addEventListener('click', async () => {
  const pass = q('passInput').value.trim();
  if (pass.length < 8) { toast('toastSetup','Passphrase must be at least 8 characters.','err'); return; }
  setP(pass);
  const vaultId = generateVaultId();
  await chrome.storage.local.set({ hasVault:true, vaultId });
  await loadVaultId();
  show('vSaveKey');
});

// ─────────────────────────────────────────────────────────────────────
// SAVE KEY
// ─────────────────────────────────────────────────────────────────────
q('btnCopyVaultId').addEventListener('click', () => copyVaultId('btnCopyVaultId'));

q('btnDownloadKey').addEventListener('click', async () => {
  await downloadRecoveryKey(getP());
  toast('toastSaveKey','Recovery key downloaded. Store it somewhere safe ✓','ok');
  setTimeout(() => goMain(), 2200);
});

q('btnSkipKey').addEventListener('click', () => goMain());

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────
async function goMain() {
  show('vMain');
  const { lastSync, autoSync } = await chrome.storage.local.get(['lastSync','autoSync']);
  q('chkAuto').checked = !!autoSync;
  if (lastSync) {
    q('orbLabel').textContent = 'Sync Now';
    q('orbSub').textContent = `Last synced ${age(lastSync)}`;
  } else {
    q('orbLabel').textContent = 'Sync Now';
    q('orbSub').textContent = 'Ready — tap to sync';
  }

  const pass = getP();
  const stale = !lastSync || (Date.now()-new Date(lastSync)) > 30_000;
  if (pass && autoSync && stale) setTimeout(() => runSync(pass), 320);
}

q('btnSync').addEventListener('click', () => {
  const pass = getP();
  if (!pass) { show('vUnlock'); return; }
  runSync(pass);
});

q('btnSecurity').addEventListener('click', async () => {
  await loadVaultId();
  show('vSecurity');
});

q('chkAuto').addEventListener('change', e => chrome.storage.local.set({ autoSync: e.target.checked }));

// ─────────────────────────────────────────────────────────────────────
// SECURITY
// ─────────────────────────────────────────────────────────────────────
q('btnCopyVaultIdSec').addEventListener('click', () => copyVaultId('btnCopyVaultIdSec'));

q('btnDownloadKeySec').addEventListener('click', async () => {
  const pass = getP();
  if (!pass) { show('vUnlock'); return; }
  await downloadRecoveryKey(pass);
});

q('btnLock').addEventListener('click', () => { clearP(); show('vUnlock'); });
q('btnBackMain').addEventListener('click', () => show('vMain'));

// ─────────────────────────────────────────────────────────────────────
// UNLOCK
// ─────────────────────────────────────────────────────────────────────
q('unlockEye').addEventListener('click', () => eye('unlockInput','unlockEye'));

q('btnUnlock').addEventListener('click', async () => {
  const pass = q('unlockInput').value.trim();
  if (!pass) return;
  setP(pass);
  q('unlockInput').value = '';
  await goMain();
  setTimeout(() => runSync(pass), 300);
});

q('unlockInput').addEventListener('keydown', e => { if (e.key==='Enter') q('btnUnlock').click(); });
q('btnShowRestore').addEventListener('click', () => show('vRestore'));

// ─────────────────────────────────────────────────────────────────────
// RESTORE (returning user on new browser)
// ─────────────────────────────────────────────────────────────────────
q('restoreEye').addEventListener('click', () => eye('restorePass','restoreEye'));

q('btnRestore').addEventListener('click', async () => {
  const vaultId = q('restoreVaultId').value.trim();
  const pass    = q('restorePass').value.trim();
  if (!vaultId) { toast('toastRestore','Enter your Vault ID from the recovery key file.','err'); return; }
  if (!pass)    { toast('toastRestore','Enter your passphrase.','err'); return; }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vaultId)) {
    toast('toastRestore','Vault ID looks wrong — check your recovery key file.','err'); return;
  }
  setP(pass);
  await chrome.storage.local.set({ hasVault:true, vaultId });
  q('restoreVaultId').value = '';
  q('restorePass').value    = '';
  await goMain();
  setTimeout(() => runSync(pass), 300);
});

q('btnBackUnlock').addEventListener('click', () => show('vUnlock'));
q('btnNewUserRestore').addEventListener('click', () => {
  // Pre-generate passphrase and go to setup
  const p = genPass();
  q('genText').textContent = p;
  q('passInput').value = p;
  q('passInput').type = 'text';
  q('passEye').textContent = '🙈';
  renderStrength(p);
  show('vSetup');
});

// ─────────────────────────────────────────────────────────────────────
// INIT — smart routing
// Primary use case = existing user adding a new browser.
// So fresh installs default to Restore, not Onboarding.
// ─────────────────────────────────────────────────────────────────────
async function init() {
  const { hasVault } = await chrome.storage.local.get('hasVault');

  // Fresh browser with no local vault.
  // Default to Restore — they probably already use Relay elsewhere.
  // First-timers can tap "New to Relay?" at the bottom.
  if (!hasVault) { show('vRestore'); return; }

  // Vault exists — need passphrase to unlock
  const pass = getP();
  if (!pass) { show('vUnlock'); return; }

  // Session still alive — straight to main
  await goMain();
}

init();
