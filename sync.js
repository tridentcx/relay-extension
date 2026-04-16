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
async function pushToCloud(vaultId, encryptedBlob) {
  const body = { data: encryptedBlob, updated_at: new Date().toISOString() };

  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/vaults?vault_key=eq.${vaultId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(body),
    }
  );

  // FIX [C2]: Only parse if response is OK
  if (!patchRes.ok) {
    const err = await patchRes.text().catch(() => `HTTP ${patchRes.status}`);
    throw new Error(friendlyError(err));
  }

  const patchText = await patchRes.text();
  const patched   = patchText ? JSON.parse(patchText) : [];

  // No existing row — insert new one
  if (!patched || patched.length === 0) {
    await supabase('POST', 'vaults', { vault_key: vaultId, ...body });
  }
}

async function pullFromCloud(vaultId) {
  const rows = await supabase('GET', `vaults?vault_key=eq.${vaultId}&select=data,updated_at`);
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

// ── Bookmark engine ───────────────────────────────────────────────────

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
  ? { type:'bookmark', title: String(n.title||'').slice(0, 2000), url: n.url, dateAdded: n.dateAdded||Date.now() }
  : { type:'folder',   title: String(n.title||'').slice(0, 500),  children:(n.children||[]).map(clean) };

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
        const title = String(n.title||'New Bookmark').slice(0, 2000);
        await chrome.bookmarks.create({ parentId, title, url: n.url });
        urls.add(n.url); added++;
      }
    } else if (n.type === 'folder') {
      const kids = await chrome.bookmarks.getChildren(parentId);
      let f = kids.find(c => !c.url && c.title === n.title);
      if (!f) f = await chrome.bookmarks.create({ parentId, title: String(n.title||'Folder').slice(0,500) });
      added += await mergeIn(n.children||[], f.id, urls, depth + 1);
    }
  }
  return added;
}

async function applyRemote(data) {
  if (!Array.isArray(data?.bookmarks)) throw new Error('Invalid data format.');
  const urls  = await getLocalUrls();
  const roots = (await chrome.bookmarks.getTree())[0].children||[];
  let added = 0;
  for (const f of data.bookmarks) {
    if (f.type !== 'folder') continue;
    const target = f.title.toLowerCase().includes('bar')
      ? rootMatch(roots, 'bar') : rootMatch(roots, 'other');
    if (target) added += await mergeIn(f.children||[], target.id, urls, 0);
  }
  return added;
}

// ── Availability check ────────────────────────────────────────────────
async function checkUsernameAvailable(username) {
  const key  = await vaultKey(username);
  const rows = await supabase('GET', `vaults?vault_key=eq.${key}&select=vault_key`);
  return !rows || rows.length === 0;
}

// ── Main bidirectional sync ───────────────────────────────────────────
async function doSync(username, password) {
  const vaultId = await vaultKey(username);

  const remote = await pullFromCloud(vaultId);
  let pulled = 0;

  if (remote?.data) {
    try {
      const plaintext = await decrypt(remote.data, password);
      const data      = JSON.parse(plaintext);
      pulled = await applyRemote(data);
    } catch {
      throw new Error('Wrong password or corrupted data. Check your credentials.');
    }
  }

  const snapshot  = await getLocalSnapshot();
  const blob      = await encrypt(JSON.stringify(snapshot), password);
  await pushToCloud(vaultId, blob);

  return { pulled, count: snapshot.count };
}
