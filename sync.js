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

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation,resolution=merge-duplicates',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
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
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'ftp:', 'ftps:', 'chrome:', 'edge:', 'about:', 'file:']);

function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const proto = new URL(url).protocol;
    return SAFE_PROTOCOLS.has(proto);
  } catch {
    return false;
  }
}

const clean = n => n.url
  ? { type:'bookmark', title: sanitizeTitle(n.title, 2000), url: n.url, dateAdded: n.dateAdded||Date.now() }
  : { type:'folder',   title: sanitizeTitle(n.title, 500),  children:(n.children||[]).map(clean) };

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
  return roots.find(r => r.title.toLowerCase().includes(kw)) || roots[0];
}

// FIX [H4]: Add depth limit to prevent stack overflow on malicious vaults
async function mergeIn(nodes, parentId, urls, depth=0) {
  if (depth > 20) return 0; // max 20 levels of folder nesting
  let added = 0;
  for (const n of nodes) {
    if (n.type === 'bookmark' && n.url) {
      // FIX [C3]: Only import bookmarks with safe protocols
      if (!isSafeUrl(n.url)) continue;
      if (!urls.has(n.url)) {
        const title = sanitizeTitle(n.title || 'New Bookmark', 2000);
        await chrome.bookmarks.create({ parentId, title, url: n.url });
        urls.add(n.url); added++;
      }
    } else if (n.type === 'folder') {
      const kids = await chrome.bookmarks.getChildren(parentId);
      const cleanFolderTitle = sanitizeTitle(n.title || 'Folder', 500);
      let f = kids.find(c => !c.url && c.title === cleanFolderTitle);
      if (!f) f = await chrome.bookmarks.create({ parentId, title: cleanFolderTitle });
      added += await mergeIn(n.children||[], f.id, urls, depth + 1);
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

// ── Main bidirectional sync ───────────────────────────────────────────
async function doSync(username, password) {
  const vaultId = await vaultKey(username);

  // Check plan
  const planInfo = await getPlan(vaultId);
  const isPro    = planInfo.effective_plan === 'pro';

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
    // Parse and apply outside the catch so genuine errors (FREE_LIMIT etc) propagate
    try {
      const data = JSON.parse(plaintext);
      pulled = await applyRemote(data);
    } catch (e) {
      // Distinguish corruption from genuine parsing failure
      throw new Error('Vault data is corrupted. Contact support.');
    }
  }

  const snapshot = await getLocalSnapshot();

  // FIX [MED-6]: Free tier limit checked BEFORE expensive encryption
  if (!isPro && snapshot.count > FREE_BOOKMARK_LIMIT) {
    throw new Error(`FREE_LIMIT:${snapshot.count}`);
  }

  const blob = await encrypt(JSON.stringify(snapshot), password);
  // FIX [MED-3]: Pass remote updated_at to detect concurrent writes
  await pushToCloud(vaultId, blob, remote?.updated_at);

  return { pulled, count: snapshot.count, plan: planInfo.effective_plan };
}
