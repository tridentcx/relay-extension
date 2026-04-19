'use strict';

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

// ── Auth token management ──────────────────────────────────────────
// Returns the current JWT access token, or falls back to anon key.
// We store the token in chrome.storage.local after signIn/signUp.
async function getAuthToken() {
  try {
    const { relayAuthToken } = await chrome.storage.local.get('relayAuthToken');
    if (relayAuthToken) return relayAuthToken;
  } catch {}
  return SUPABASE_KEY; // fallback for unauthenticated requests
}

async function setAuthToken(token) {
  try { await chrome.storage.local.set({ relayAuthToken: token }); } catch {}
}

async function clearAuthToken() {
  try { await chrome.storage.local.remove('relayAuthToken'); } catch {}
}

// ── Supabase Auth — anonymous sign-in ───────────────────────────
// Creates a real anonymous user in auth.users the first time.
// Subsequent calls refresh the session using the stored refresh token.
async function ensureAuth() {
  try {
    const { relayAuthToken, relayRefreshToken } = await chrome.storage.local.get(
      ['relayAuthToken', 'relayRefreshToken']
    );

    // Already have a valid token
    if (relayAuthToken) return relayAuthToken;

    // Try to refresh existing session
    if (relayRefreshToken) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: relayRefreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          await chrome.storage.local.set({
            relayAuthToken:    data.access_token,
            relayRefreshToken: data.refresh_token || relayRefreshToken,
          });
          return data.access_token;
        }
      }
    }

    // No session — create anonymous user via the correct grant type endpoint
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=anonymous`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return SUPABASE_KEY; // fail open
    const data = await res.json();
    if (data.access_token) {
      await chrome.storage.local.set({
        relayAuthToken:    data.access_token,
        relayRefreshToken: data.refresh_token || '',
        relayAuthUserId:   data.user?.id || '',
      });
      return data.access_token;
    }
  } catch {
    // Auth failed — fall back to anon key (still works for legacy vaults)
  }
  return SUPABASE_KEY;
}

// ── Supabase REST client ─────────────────────────────────────────
async function supabase(method, path, body) {
  const token = await ensureAuth();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation,resolution=merge-duplicates',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    // If 401, our token expired — clear it and retry once with fresh auth
    if (res.status === 401) {
      await chrome.storage.local.remove('relayAuthToken');
      const freshToken = await ensureAuth();
      const retry = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
          'apikey':        SUPABASE_KEY,
          'Authorization': `Bearer ${freshToken}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation,resolution=merge-duplicates',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) {
        const err = await retry.text().catch(() => `HTTP ${retry.status}`);
        throw new Error(friendlyError(err));
      }
      const retryText = await retry.text();
      return retryText ? JSON.parse(retryText) : null;
    }
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(friendlyError(err));
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// FIX [C2]: Check patchRes.ok before parsing ──────────────────────────
// FIX [MED-3]: Push with optimistic concurrency check.
// If lastSeenUpdatedAt is provided, only patch when DB still has that timestamp.
async function pushToCloud(vaultId, encryptedBlob, lastSeenUpdatedAt) {
  if (!isValidVaultKey(vaultId)) throw new Error('Invalid vault key.');
  const body = { data: encryptedBlob, updated_at: new Date().toISOString() };

  // Build URL with optional concurrency check
  let url = `${SUPABASE_URL}/rest/v1/vaults?vault_key=eq.${vaultId}`;
  if (lastSeenUpdatedAt) {
    url += `&updated_at=eq.${encodeURIComponent(lastSeenUpdatedAt)}`;
  }

  const patchRes = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(body),
  });

  if (!patchRes.ok) {
    const err = await patchRes.text().catch(() => `HTTP ${patchRes.status}`);
    throw new Error(friendlyError(err));
  }

  const patchText = await patchRes.text();
  const patched   = patchText ? JSON.parse(patchText) : [];

  // No row matched — either it's new OR another browser updated it (conflict)
  if (!patched || patched.length === 0) {
    if (lastSeenUpdatedAt) {
      // Concurrency check failed — another browser pushed first
      throw new Error('Another browser synced first. Please sync again.');
    }
    // Genuinely new vault
    await supabase('POST', 'vaults', { vault_key: vaultId, ...body });
  }
}

async function pullFromCloud(vaultId) {
  if (!isValidVaultKey(vaultId)) throw new Error('Invalid vault key.');
  const rows = await supabase('GET', `vaults?vault_key=eq.${vaultId}&select=data,updated_at`);
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
// Removed: file: (leaks local filesystem paths), chrome:/edge: (internal URLs
// meaningless cross-browser), about: (browser-internal).
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
  return {
    version:    '2.0',
    app:        'Relay',
    exportedAt: new Date().toISOString(),
    count:      countAll(bm),
    bookmarks:  bm,
  };
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
  const key  = await vaultKey(username);
  const rows = await supabase('GET', `vaults?vault_key=eq.${key}&select=vault_key`);
  return !rows || rows.length === 0;
}

// ── Plan checking ─────────────────────────────────────────────────────
const FREE_BOOKMARK_LIMIT = 500;

async function getPlan(vaultId) {
  if (!isValidVaultKey(vaultId)) return { effective_plan: 'free', bookmark_count: 0 };
  try {
    const rows = await supabase('GET', `vault_plan?vault_key=eq.${vaultId}&select=effective_plan,bookmark_count`);
    return rows?.[0] ?? { effective_plan: 'free', bookmark_count: 0 };
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
  if (!isValidVaultKey(vaultId)) return { allowed: false, reason: 'invalid' };
  const browserId = await getBrowserId();
  const ua        = navigator.userAgent.slice(0, 250);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/register_browser`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        p_vault_key:  vaultId,
        p_browser_id: browserId,
        p_ua:         ua,
      }),
    });
    if (!res.ok) return { allowed: true, reason: 'rpc_error' };  // fail open
    return await res.json();
  } catch {
    return { allowed: true, reason: 'network' };
  }
}

// ─── Save a snapshot to sync_history (Pro only) ─────────────────────
async function saveSnapshot(vaultId, encryptedBlob, count) {
  if (!isValidVaultKey(vaultId)) return;
  try {
    await supabase('POST', 'sync_history', {
      vault_key: vaultId,
      data: encryptedBlob,
      bookmark_count: count,
    });
  } catch {} // history is best-effort, never block sync
}

// ─── Fetch sync history (last 30 days) ──────────────────────────────
async function listHistory(vaultId) {
  if (!isValidVaultKey(vaultId)) return [];
  try {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    return await supabase('GET',
      `sync_history?vault_key=eq.${vaultId}&created_at=gte.${cutoff}&order=created_at.desc&select=id,bookmark_count,created_at,data&limit=50`
    ) || [];
  } catch {
    return [];
  }
}

// ── Claim vault for authenticated user ───────────────────────────────
// Links an existing vault row to the current auth.uid() so that
// real RLS ownership can be enforced going forward.
async function claimVault(vaultId) {
  if (!isValidVaultKey(vaultId)) return;
  try {
    const token = await ensureAuth();
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_vault`, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ p_vault_key: vaultId }),
    });
    // Errors are non-fatal — vault still works without claim
  } catch {}
}

// ── Main bidirectional sync ───────────────────────────────────────────
async function doSync(username, password, accountSalt) {
  const vaultId = await vaultKey(username, accountSalt);

  // Ensure this device has an auth identity and vault is claimed under it.
  // Non-blocking — runs in background, doesn't affect sync success.
  claimVault(vaultId);

  // Rate limit check — non-blocking, fail open if Edge Function unavailable
  try {
    const token = await ensureAuth();
    const rl = await fetch(`${SUPABASE_URL}/functions/v1/sync-rate-limiter`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vault_key: vaultId }),
    });
    if (rl.status === 429) {
      const data = await rl.json().catch(() => ({}));
      const window = data.window === 'minute' ? 'minute' : 'hour';
      throw new Error(`RATE_LIMIT:${window}`);
    }
  } catch (e) {
    // Only rethrow if it's our rate limit error, not a network failure
    if (e.message?.startsWith('RATE_LIMIT:')) throw e;
    // Otherwise fall through — fail open
  }

  // Check plan first — needed for browser limit decision
  const planInfo = await getPlan(vaultId);
  const isPro    = planInfo.effective_plan === 'pro';

  // Register this browser. Free tier capped at 2.
  const reg = await registerBrowser(vaultId);
  if (!reg.allowed && reg.reason === 'free_browser_limit') {
    throw new Error(`BROWSER_LIMIT:${reg.count}`);
  }

  const remote = await pullFromCloud(vaultId);
  let pulled = 0;

  if (remote?.data) {
    let plaintext = null;
    try {
      plaintext = await decrypt(remote.data, password);
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
    // applyRemote may throw structured errors — let them propagate
    pulled = await applyRemote(data);
  }

  const snapshot = await getLocalSnapshot();

  // FIX [MED-6]: Free tier limit checked BEFORE expensive encryption
  if (!isPro && snapshot.count > FREE_BOOKMARK_LIMIT) {
    throw new Error(`FREE_LIMIT:${snapshot.count}`);
  }

  const blob = await encrypt(JSON.stringify(snapshot), password);
  await pushToCloud(vaultId, blob, remote?.updated_at);

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
  if (!isValidVaultKey(vaultId)) throw new Error('Invalid vault.');
  // Sanitize snapshot ID: should be UUID
  if (!/^[a-f0-9-]{36}$/i.test(String(snapshotId))) throw new Error('Invalid snapshot ID.');

  const rows = await supabase('GET',
    `sync_history?id=eq.${snapshotId}&select=data&limit=1`);
  if (!rows || rows.length === 0) throw new Error('Snapshot not found.');

  // Step 1: Decrypt — fail fast if password wrong (nothing modified yet)
  let plaintext;
  try {
    plaintext = await decrypt(rows[0].data, password);
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
  const blob     = await encrypt(JSON.stringify(snapshot), password);
  await pushToCloud(vaultId, blob);

  return { restored: added, count: snapshot.count };
}
