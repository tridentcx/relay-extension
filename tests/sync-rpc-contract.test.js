const assert = require('node:assert/strict');
const fs = require('node:fs');

const config = fs.readFileSync('config.js', 'utf8');
const url = config.match(/SUPABASE_URL = '([^']+)'/)?.[1];
const key = config.match(/SUPABASE_KEY = '([^']+)'/)?.[1];

assert(url, 'SUPABASE_URL missing from config.js');
assert(key, 'SUPABASE_KEY missing from config.js');

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  assert.equal(res.ok, true, `${name} failed with ${res.status}: ${text}`);
  return data;
}

(async () => {
  const vaultKey = randomHex(32);
  const writeToken = randomHex(32);
  const browserId = `qa-${Date.now()}-${randomHex(4)}`;
  const payload = `qa-encrypted-placeholder-${Date.now()}`;

  const rate = await rpc('check_sync_rate_limit', { p_vault_key: vaultKey });
  assert.equal(rate.allowed, true);

  const pushed = await rpc('push_vault', {
    p_vault_key: vaultKey,
    p_data: payload,
    p_write_token: writeToken,
    p_last_seen_updated_at: null,
  });
  assert.equal(pushed.ok, true);

  const pulled = await rpc('pull_vault', { p_vault_key: vaultKey });
  assert.equal(pulled.length, 1);
  assert.equal(pulled[0].data, payload);

  const registered = await rpc('register_browser', {
    p_vault_key: vaultKey,
    p_browser_id: browserId,
    p_ua: 'relay rpc contract test',
  });
  assert.equal(registered.allowed, true);

  const deleted = await rpc('delete_vault', {
    p_vault_key: vaultKey,
    p_write_token: writeToken,
  });
  assert.equal(deleted.deleted, true);

  const afterDelete = await rpc('pull_vault', { p_vault_key: vaultKey });
  assert.deepEqual(afterDelete, []);

  console.log('PASS live sync RPC contract');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
