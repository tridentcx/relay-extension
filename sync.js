'use strict';

// ─────────────────────────────────────────────────────────────────────
// Supabase sync — reads/writes encrypted blobs only
// ─────────────────────────────────────────────────────────────────────

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
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Push encrypted blob to Supabase (update if exists, insert if new)
async function pushToCloud(vaultId, encryptedBlob) {
  const body = { data: encryptedBlob, updated_at: new Date().toISOString() };

  // Try PATCH first (update existing row)
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
  const patchText = await patchRes.text();
  const patched   = patchText && JSON.parse(patchText);

  // If PATCH updated nothing, INSERT a new row
  if (!patched || patched.length === 0) {
    await supabase('POST', 'vaults', { vault_key: vaultId, ...body });
  }
}

// Pull encrypted blob from Supabase
async function pullFromCloud(vaultId) {
  const rows = await supabase('GET', `vaults?vault_key=eq.${vaultId}&select=data,updated_at`);
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────
// Bookmark engine
// ─────────────────────────────────────────────────────────────────────
const clean = n => n.url
  ? { type:'bookmark', title:n.title||'', url:n.url, dateAdded:n.dateAdded||Date.now() }
  : { type:'folder',   title:n.title||'', children:(n.children||[]).map(clean) };

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

async function mergeIn(nodes, parentId, urls) {
  let added = 0;
  for (const n of nodes) {
    if (n.type==='bookmark' && n.url && !urls.has(n.url)) {
      await chrome.bookmarks.create({ parentId, title:n.title, url:n.url });
      urls.add(n.url); added++;
    } else if (n.type==='folder') {
      const kids = await chrome.bookmarks.getChildren(parentId);
      let f = kids.find(c => !c.url && c.title===n.title);
      if (!f) f = await chrome.bookmarks.create({ parentId, title:n.title });
      added += await mergeIn(n.children||[], f.id, urls);
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
    if (target) added += await mergeIn(f.children||[], target.id, urls);
  }
  return added;
}

// ─────────────────────────────────────────────────────────────────────
// Main sync — bidirectional, fully encrypted
// Vault ID is a random UUID stored locally — completely unlinked from passphrase.
// Brute forcing the passphrase reveals nothing without also knowing the vault ID.
// ─────────────────────────────────────────────────────────────────────
async function doSync(passphrase) {
  const { vaultId } = await chrome.storage.local.get('vaultId');
  if (!vaultId) throw new Error('No vault ID found. Please reinstall Relay.');

  // 1. Pull remote encrypted blob
  const remote = await pullFromCloud(vaultId);
  let pulled = 0;

  if (remote?.data) {
    try {
      const plaintext = await decrypt(remote.data, passphrase);
      const data      = JSON.parse(plaintext);
      pulled = await applyRemote(data);
    } catch {
      throw new Error('Wrong passphrase or corrupted data.');
    }
  }

  // 2. Get local snapshot (includes newly pulled bookmarks)
  const snapshot  = await getLocalSnapshot();
  const plaintext = JSON.stringify(snapshot);
  const blob      = await encrypt(plaintext, passphrase);

  // 3. Push encrypted blob to Supabase
  await pushToCloud(vaultId, blob);

  return { pulled, count: snapshot.count };
}
