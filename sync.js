'use strict';

// ── Relay sync module ─────────────────────────────────────────────────
// Wrapped in IIFE to prevent globals from being accessible via DevTools.
// All functions needed by popup.js are explicitly exported via window.
(function() {

// ── Remote config ────────────────────────────────────────────────────
// Fetches config from the public site on startup. Lets us change limits,
// URLs, and feature flags without a Chrome Web Store submission.
// Falls back to hardcoded defaults if fetch fails (offline, etc.)

let _remoteConfig = null;

const DEFAULT_CONFIG = {
  free_bookmark_limit: 500,
  free_browser_limit:  2,
  maintenance_mode:    false,
  maintenance_message: '',
};

function supabaseUrl(path) {
  return `${SUPABASE_URL}${path}`;
}

async function supabaseRequest(path, body) {
  const res = await fetch(supabaseUrl(path), {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  return res;
}

async function getConfig() {
  if (_remoteConfig) return _remoteConfig;
  try {
    for (const url of [
      'https://relayextension.com/config.json',
    ]) {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        _remoteConfig = { ...DEFAULT_CONFIG, ...data };
        return _remoteConfig;
      }
    }
  } catch {}
  return DEFAULT_CONFIG;
}


// ── Supabase client ───────────────────────────────────────────────────

// FIX [H2]: Map known errors to friendly messages
function friendlyError(raw) {
  if (!raw) return 'Something went wrong. Try again.';
  if (raw.includes('fetch') || raw.includes('network') || raw.includes('Failed'))
    return 'No internet connection. Check your network and try again.';
  if (raw.includes('401') || raw.includes('403'))
    return 'Access denied. The extension may need to be reinstalled.';
  if (raw.includes('429'))
    return 'Too many requests. Please wait a moment and try again.';
  if (raw.includes('500') || raw.includes('503'))
    return 'Server error. Try again in a few minutes.';
  return 'Sync failed. Please try again.';
}

// ── Supabase RPC client ──────────────────────────────────────────
// Uses the public anon key. Security is provided by:
//   1. Narrow SECURITY DEFINER RPCs instead of public table grants
//   2. Write tokens for server-side ownership checks
//   3. AES-256-GCM encryption — server never sees plaintext
// Level 2 (Supabase anonymous auth) will be added when the
// project's GoTrue version supports grant_type=anonymous.
async function rpc(name, body) {
  const res = await supabaseRequest(`/rest/v1/rpc/${name}`, body);
  if (!res.ok) {
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(friendlyError(err));
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Stub for future Level 2 — keeps popup.js sign-out handler working
async function clearAuthToken() {
  try {
    await chrome.storage.local.remove(['relayAuthToken','relayRefreshToken','relayAuthUserId']);
  } catch {}
}

function makeWriteToken() {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(tokenBytes).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function isValidWriteToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

async function getWriteToken() {
  const { writeToken } = await chrome.storage.local.get('writeToken');
  if (isValidWriteToken(writeToken)) return writeToken;
  return null;
}

async function ensureWriteToken() {
  const existing = await getWriteToken();
  if (existing) return existing;
  const writeToken = makeWriteToken();
  await chrome.storage.local.set({ writeToken });
  return writeToken;
}

async function setWriteTokenFromVault(data) {
  if (isValidWriteToken(data?.writeToken)) {
    const existing = await getWriteToken();
    if (!existing) await chrome.storage.local.set({ writeToken: data.writeToken });
    return data.writeToken;
  }
  return null;
}

// FIX [C2]: Check patchRes.ok before parsing ──────────────────────────
// FIX [MED-3]: Push with optimistic concurrency check.
// If lastSeenUpdatedAt is provided, only patch when DB still has that timestamp.
async function pushToCloud(vaultId, encryptedBlob, lastSeenUpdatedAt) {
  if (!window._relayCrypto.isValidVaultKey(vaultId)) throw new Error('Invalid vault key.');
  const writeToken = await ensureWriteToken();
  const result = await rpc('push_vault', {
    p_vault_key: vaultId,
    p_data: encryptedBlob,
    p_write_token: writeToken,
    p_last_seen_updated_at: lastSeenUpdatedAt || null,
  });
  if (result?.conflict) throw new Error('Another browser synced first. Please sync again.');
  if (!result?.ok) throw new Error('Sync failed. Please try again.');
}

async function claimLegacyVault(vaultId, currentEncryptedBlob) {
  if (!window._relayCrypto.isValidVaultKey(vaultId)) throw new Error('Invalid vault key.');
  if (!currentEncryptedBlob) throw new Error('Cannot migrate this vault. Sign in from a browser that synced before.');
  const writeToken = await ensureWriteToken();
  const result = await rpc('claim_legacy_vault', {
    p_vault_key: vaultId,
    p_current_data: currentEncryptedBlob,
    p_write_token: writeToken,
  });
  if (!result?.ok) throw new Error('This vault needs one sync from a trusted browser before this browser can sync.');
  return writeToken;
}

async function pullFromCloud(vaultId) {
  if (!window._relayCrypto.isValidVaultKey(vaultId)) throw new Error('Invalid vault key.');
  const rows = await rpc('pull_vault', { p_vault_key: vaultId });
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

// ── Bookmark engine ───────────────────────────────────────────────────

// FIX [HIGH-5]: Sanitize bookmark titles before insertion.
// Removes control chars, null bytes, and HTML-significant chars.
// Belt-and-suspenders for third-party tools that might render titles as HTML.
function sanitizeTitle(t, maxLen = 2000) {
  if (typeof t !== 'string') t = String(t ?? '');
  return t
    .replace(/[\x00-\x1F\x7F<>]/g, '')   // control chars + < > (HTML)
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim()
    .slice(0, maxLen);
}

// FIX [C3]: Allowed URL protocols — blocks javascript:, data:, vbscript: etc.
// Restrict to web protocols only.
// Removed: local-file paths, browser-internal URLs, and non-web schemes.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'ftp:', 'ftps:']);

function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const proto = new URL(url).protocol;
    return SAFE_PROTOCOLS.has(proto);
  } catch {
    return false;
  }
}

// FIX [C-1]: Detect bookmark vs folder by presence of children, not URL truthiness.
// Empty-string URLs were being treated as folders, then crashing when missing children.
const clean = n => {
  // Folder: has children array (Chrome's bookmarks API guarantees this)
  if (Array.isArray(n.children)) {
    return { type:'folder', title: sanitizeTitle(n.title, 500), children: n.children.map(clean) };
  }
  // Bookmark: has a non-empty URL
  if (typeof n.url === 'string' && n.url.length > 0) {
    return { type:'bookmark', title: sanitizeTitle(n.title, 2000), url: n.url, dateAdded: n.dateAdded || Date.now() };
  }
  // Unknown — treat as empty folder, will be filtered later
  return { type:'folder', title: sanitizeTitle(n.title, 500), children: [] };
};

async function getLocalSnapshot() {
  const tree = await chrome.bookmarks.getTree();
  const bm   = (tree[0].children||[]).map(clean);
  const writeToken = await getWriteToken();
  const snapshot = {
    version:    '2.0',
    app:        'Relay',
    exportedAt: new Date().toISOString(),
    count:      countAll(bm),
    bookmarks:  bm,
  };
  if (writeToken) snapshot.writeToken = writeToken;
  return snapshot;
}

const countAll = ns => ns.reduce((s,n) => s + (n.type==='bookmark' ? 1 : countAll(n.children||[])), 0);

async function getLocalUrls() {
  const tree = await chrome.bookmarks.getTree();
  const s = new Set();
  (function w(n){ if(n.url) s.add(n.url); (n.children||[]).forEach(w); })(tree[0]);
  return s;
}

function rootMatch(roots, kw) {
  return roots.find(r => (r.title || '').toLowerCase().includes(kw)) || roots[0] || null;
}

// FIX [H4]: Add depth limit to prevent stack overflow on malicious vaults
async function mergeIn(nodes, parentId, urls, depth=0, totalAdded={count:0}) {
  if (depth > 20) return 0; // max nesting
  if (!Array.isArray(nodes)) return 0;
  // FIX [C-3]: Cap total bookmarks added per sync to prevent abuse
  const MAX_PER_SYNC = 10000;
  let added = 0;
  for (const n of nodes) {
    if (totalAdded.count >= MAX_PER_SYNC) break;
    // Validate node shape every iteration (not just top-level)
    if (!isValidNode(n)) continue;

    if (n.type === 'bookmark') {
      if (!isSafeUrl(n.url)) continue;
      if (!urls.has(n.url)) {
        try {
          const title = sanitizeTitle(n.title || 'New Bookmark', 2000);
          await chrome.bookmarks.create({ parentId, title, url: n.url });
          urls.add(n.url); added++; totalAdded.count++;
        } catch {} // skip individual failures, keep merging
      }
    } else if (n.type === 'folder') {
      try {
        const kids = await chrome.bookmarks.getChildren(parentId);
        const cleanFolderTitle = sanitizeTitle(n.title || 'Folder', 500);
        let f = kids.find(c => !c.url && c.title === cleanFolderTitle);
        if (!f) f = await chrome.bookmarks.create({ parentId, title: cleanFolderTitle });
        added += await mergeIn(n.children || [], f.id, urls, depth + 1, totalAdded);
      } catch {}
    }
  }
  return added;
}

// FIX [MED-7]: Strict shape validation before applying remote vault.
function isValidNode(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.type === 'bookmark') return typeof n.url === 'string' && n.url.length < 4096;
  if (n.type === 'folder')   return Array.isArray(n.children);
  return false;
}

async function applyRemote(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid data format.');
  if (!Array.isArray(data.bookmarks))    throw new Error('Invalid data format.');
  // Cap top-level folders at 50 to prevent abuse.
  if (data.bookmarks.length > 50)        throw new Error('Vault structure invalid.');

  const urls  = await getLocalUrls();
  const roots = (await chrome.bookmarks.getTree())[0].children || [];
  let added = 0;
  for (const f of data.bookmarks) {
    if (!isValidNode(f) || f.type !== 'folder') continue;
    const safeTitle = sanitizeTitle(f.title || '');
    const target = safeTitle.toLowerCase().includes('bar')
      ? rootMatch(roots, 'bar')
      : rootMatch(roots, 'other');
    if (target) added += await mergeIn(f.children || [], target.id, urls, 0);
  }
  return added;
}

// ── Availability check ────────────────────────────────────────────────
async function checkUsernameAvailable(username) {
  const key  = await window._relayCrypto.vaultKey(username);
  return !(await rpc('vault_exists', { p_vault_key: key }));
}

// ── Plan checking ─────────────────────────────────────────────────────
// FREE_BOOKMARK_LIMIT now comes from remote config — see getConfig()

async function getPlan(vaultId) {
  if (!window._relayCrypto.isValidVaultKey(vaultId)) return { effective_plan: 'free', bookmark_count: 0 };
  try {
    return await rpc('get_vault_plan', { p_vault_key: vaultId }) ?? { effective_plan: 'free', bookmark_count: 0 };
  } catch {
    return { effective_plan: 'free', bookmark_count: 0 };
  }
}


// ─── Browser identity (random ID stored in chrome.storage.local) ─────
async function getBrowserId() {
  const { browserId } = await chrome.storage.local.get('browserId');
  if (browserId) return browserId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ browserId: id });
  return id;
}

// ─── Register this browser with the vault, enforcing limits ─────────
async function registerBrowser(vaultId) {
  if (!window._relayCrypto.isValidVaultKey(vaultId)) return { allowed: false, reason: 'invalid' };
  const browserId = await getBrowserId();
  const ua        = navigator.userAgent.slice(0, 250);

  try {
    const res = await supabaseRequest('/rest/v1/rpc/register_browser', {
      p_vault_key:  vaultId,
      p_browser_id: browserId,
      p_ua:         ua,
    });
    if (!res.ok) return { allowed: false, reason: 'verification_unavailable' };
    return await res.json();
  } catch {
    return { allowed: false, reason: 'verification_unavailable' };
  }
}

async function checkRateLimit(vaultId) {
  const data = await rpc('check_sync_rate_limit', { p_vault_key: vaultId });
  if (data?.allowed === false) throw new Error(`RATE_LIMIT:${data.window || data.reason || 'minute'}`);
}

async function shouldApplyRemote(remoteUpdatedAt) {
  if (!remoteUpdatedAt) return false;
  try {
    const { lastSync } = await chrome.storage.local.get('lastSync');
    if (!lastSync) return true;
    const remoteTs = new Date(remoteUpdatedAt).getTime();
    const lastTs   = new Date(lastSync).getTime();
    if (!Number.isFinite(remoteTs) || !Number.isFinite(lastTs)) return true;
    // Small tolerance for timestamp jitter across systems.
    return remoteTs > (lastTs + 1000);
  } catch {
    return true;
  }
}

// ─── Save a snapshot to sync_history (Pro only) ─────────────────────
async function saveSnapshot(vaultId, encryptedBlob, count) {
  if (!window._relayCrypto.isValidVaultKey(vaultId)) return;
  try {
    const writeToken = await getWriteToken();
    if (!writeToken) return;
    await rpc('save_sync_snapshot', {
      p_vault_key: vaultId,
      p_write_token: writeToken,
      p_data: encryptedBlob,
      p_bookmark_count: count,
    });
  } catch {} // history is best-effort, never block sync
}

// ─── Fetch sync history (last 30 days) ──────────────────────────────
async function listHistory(vaultId) {
  if (!window._relayCrypto.isValidVaultKey(vaultId)) return [];
  try {
    const writeToken = await getWriteToken();
    if (!writeToken) return [];
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    return await rpc('list_sync_history', {
      p_vault_key: vaultId,
      p_write_token: writeToken,
      p_cutoff: cutoff,
    }) || [];
  } catch {
    return [];
  }
}

// ── Main bidirectional sync ───────────────────────────────────────────
async function doSync(username, password, accountSalt) {
  const vaultId = await window._relayCrypto.vaultKey(username, accountSalt);

  await checkRateLimit(vaultId);

  // Check plan first — needed for browser limit decision
  const planInfo = await getPlan(vaultId);
  const isPro    = planInfo.effective_plan === 'pro';

  const remote = await pullFromCloud(vaultId);
  let pulled = 0;

  if (remote?.data) {
    // Register known vaults before applying remote bookmarks, so free-tier
    // browser limits fail without modifying local bookmarks.
    const reg = await registerBrowser(vaultId);
    if (!reg.allowed) {
      if (reg.reason === 'free_browser_limit') throw new Error(`BROWSER_LIMIT:${reg.count}`);
      throw new Error('Browser verification is temporarily unavailable. Try again in a moment.');
    }

    let plaintext = null;
    try {
      plaintext = await window._relayCrypto.decrypt(remote.data, password);
    } catch {
      // Wrong password — exit with consistent error
      throw new Error('Wrong password or corrupted data. Check your credentials.');
    }
    // Parse JSON separately so we can distinguish parse errors from apply errors
    let data;
    try {
      data = JSON.parse(plaintext);
    } catch {
      throw new Error('Vault data is corrupted. Contact support.');
    }
    await setWriteTokenFromVault(data);
    if (!await getWriteToken()) {
      await claimLegacyVault(vaultId, remote.data);
    }
    // Pull only when cloud is newer than this browser's last successful sync.
    // This prevents deleted local bookmarks from being immediately re-added by
    // replaying an older/equal remote snapshot.
    if (await shouldApplyRemote(remote.updated_at)) {
      // applyRemote may throw structured errors — let them propagate
      pulled = await applyRemote(data);
    }
  }

  await ensureWriteToken();
  const snapshot = await getLocalSnapshot();

  // Free tier limit — check remote config, fall back to 500
  const cfg = await getConfig();
  if (cfg.maintenance_mode) {
    throw new Error(`MAINTENANCE:${cfg.maintenance_message || 'Relay is temporarily down for maintenance.'}`);
  }
  if (!isPro && snapshot.count > (cfg.free_bookmark_limit || 500)) {
    throw new Error(`FREE_LIMIT:${snapshot.count}`);
  }

  const blob = await window._relayCrypto.encrypt(JSON.stringify(snapshot), password);
  await pushToCloud(vaultId, blob, remote?.updated_at);

  if (!remote?.data) {
    const reg = await registerBrowser(vaultId);
    if (!reg.allowed) {
      if (reg.reason === 'free_browser_limit') throw new Error(`BROWSER_LIMIT:${reg.count}`);
      throw new Error('Browser verification is temporarily unavailable. Try again in a moment.');
    }
  }

  // Save to history (Pro only) — non-blocking
  if (isPro) {
    saveSnapshot(vaultId, blob, snapshot.count);
  }

  return { pulled, count: snapshot.count, plan: planInfo.effective_plan };
}

// ── Restore from a history snapshot (Pro feature) ────────────────────
// FIX [M-13]: Validate decrypt + parse fully BEFORE any merge happens.
// If anything fails, no bookmarks are touched.
async function restoreFromSnapshot(snapshotId, password, vaultId) {
  if (!window._relayCrypto.isValidVaultKey(vaultId)) throw new Error('Invalid vault.');
  // Sanitize snapshot ID: should be UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(snapshotId))) throw new Error('Invalid snapshot ID.');

  const writeToken = await getWriteToken();
  if (!writeToken) throw new Error('This browser cannot prove vault ownership. Sync once, then try again.');
  const snapshotBlob = await rpc('get_sync_snapshot', {
    p_vault_key: vaultId,
    p_write_token: writeToken,
    p_snapshot_id: snapshotId,
  });
  if (!snapshotBlob) throw new Error('Snapshot not found.');

  // Step 1: Decrypt — fail fast if password wrong (nothing modified yet)
  let plaintext;
  try {
    plaintext = await window._relayCrypto.decrypt(snapshotBlob, password);
  } catch {
    throw new Error('Cannot decrypt snapshot. Password may have changed since this was saved.');
  }

  // Step 2: Parse — fail fast if data corrupt
  let data;
  try {
    data = JSON.parse(plaintext);
  } catch {
    throw new Error('Snapshot data is corrupted.');
  }

  // Step 3: Validate shape — applyRemote does this internally, but verify here too
  if (!data || typeof data !== 'object' || !Array.isArray(data.bookmarks)) {
    throw new Error('Snapshot has invalid format.');
  }

  // All checks passed — safe to merge
  const added = await applyRemote(data);

  // Push the merged state back
  const snapshot = await getLocalSnapshot();
  const blob     = await window._relayCrypto.encrypt(JSON.stringify(snapshot), password);
  await pushToCloud(vaultId, blob);

  return { restored: added, count: snapshot.count };
}



// ── Gift code redemption ──────────────────────────────────────────────
async function redeemGiftCode(code, vaultKey) {
  const res = await supabaseRequest('/rest/v1/rpc/redeem_gift_code', { p_code: code, p_vault_key: vaultKey });
  if (!res.ok) throw new Error('Server error');
  return await res.json().catch(() => null);
}

async function createCheckout(vaultKey) {
  if (!window._relayCrypto.isValidVaultKey(vaultKey)) throw new Error('Invalid vault key.');
  const siteUrl = 'https://relayextension.com';
  const res = await supabaseRequest('/functions/v1/create-checkout', {
    vault_key: vaultKey,
    success_url: `${siteUrl}/pricing/success.html`,
    cancel_url:  `${siteUrl}/pricing/`,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error('Checkout unavailable. Try again later.');
  return data;
}

// ── Delete vault ──────────────────────────────────────────────────────
async function deleteVault(vaultKey, hadRemoteData) {
  const writeToken = await getWriteToken();
  if (!writeToken) throw new Error('This browser cannot prove vault ownership. Sync once from a trusted browser, then try again.');
  const result = await rpc('delete_vault', { p_vault_key: vaultKey, p_write_token: writeToken });
  if (hadRemoteData && !result?.deleted) {
    throw new Error("Server didn't delete the vault. Contact support.");
  }
}

// ── Exports for popup.js ─────────────────────────────────────────────
window._relay = {
  doSync,
  pullFromCloud,
  checkUsernameAvailable,
  getPlan,
  listHistory,
  restoreFromSnapshot,
	  clearAuthToken,
	  redeemGiftCode,
	  createCheckout,
	  deleteVault,
	};

})();
