'use strict';

const ENC = new TextEncoder();
const DEC = new TextDecoder();

// ── Key derivation — PBKDF2 + SHA-256 ────────────────────────────────
async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey(
    'raw', ENC.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:310_000, hash:'SHA-256' },
    base,
    { name:'AES-GCM', length:256 },
    false, ['encrypt','decrypt']
  );
}

// FIX [C1]: Safe base64 encoding — no spread operator.
// btoa(String.fromCharCode(...largeArray)) crashes V8 at ~65k items.
// Chunking avoids the call stack limit for any size bookmark collection.
function uint8ToBase64(bytes) {
  let str = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    str += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(str);
}

// ── Encrypt plaintext → base64 blob ──────────────────────────────────
async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, ENC.encode(plaintext));
  const buf  = new Uint8Array(32 + 12 + ct.byteLength);
  buf.set(salt, 0); buf.set(iv, 32); buf.set(new Uint8Array(ct), 44);
  return uint8ToBase64(buf); // FIX [C1]
}

// ── Decrypt base64 blob → plaintext ──────────────────────────────────
async function decrypt(blob, password) {
  const buf  = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
  const salt = buf.slice(0, 32);
  const iv   = buf.slice(32, 44);
  const ct   = buf.slice(44);
  const key  = await deriveKey(password, salt);
  const pt   = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
  return DEC.decode(pt);
}

// ── Vault key — FIX [C5]: PBKDF2 instead of bare SHA-256 ─────────────
// SHA-256 is ~1B ops/sec. PBKDF2(100k iterations) = ~10k ops/sec.
// Enumeration attacks are now 100,000x slower.
// Static pepper ensures different results vs a plain PBKDF2(username).
const VAULT_PEPPER = 'relay-vault-pepper-v1';

async function vaultKey(username) {
  const base = await crypto.subtle.importKey(
    'raw', ENC.encode(username.toLowerCase().trim()), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt: ENC.encode(VAULT_PEPPER), iterations: 100_000, hash:'SHA-256' },
    base,
    { name:'AES-GCM', length:256 },
    true, ['encrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2,'0')).join('');
}
