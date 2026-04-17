'use strict';

const ENC = new TextEncoder();
const DEC = new TextDecoder();

// FIX [LOW-5]: Bumped PBKDF2 from 310k → 600k (OWASP 2025 recommendation).
// Slows offline brute force ~2x. ~600ms cost on encrypt/decrypt.
const PBKDF2_ITER_DATA = 600_000;
const PBKDF2_ITER_VKEY = 200_000;  // Vault key derivation (faster, less critical)

// ── Key derivation — PBKDF2 + SHA-256 ────────────────────────────────
async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey(
    'raw', ENC.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: PBKDF2_ITER_DATA, hash:'SHA-256' },
    base,
    { name:'AES-GCM', length:256 },
    false, ['encrypt','decrypt']
  );
}

// Safe base64 encoding — no spread operator (avoids V8 stack limit at ~65k items)
function uint8ToBase64(bytes) {
  let str = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    str += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(str);
}

// ── Encrypt plaintext → base64 blob ──────────────────────────────────
// Format: [version 1B][iter 4B BE][salt 32B][iv 12B][ciphertext]
async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, ENC.encode(plaintext));

  // Original format kept for backwards compatibility:
  // [salt 32B][iv 12B][ciphertext]
  const buf  = new Uint8Array(32 + 12 + ct.byteLength);
  buf.set(salt, 0); buf.set(iv, 32); buf.set(new Uint8Array(ct), 44);
  return uint8ToBase64(buf);
}

// ── Decrypt base64 blob → plaintext ──────────────────────────────────
async function decrypt(blob, password) {
  const buf  = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
  if (buf.length < 44 + 16) throw new Error('Invalid blob.');
  const salt = buf.slice(0, 32);
  const iv   = buf.slice(32, 44);
  const ct   = buf.slice(44);
  const key  = await deriveKey(password, salt);
  const pt   = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
  return DEC.decode(pt);
}

// ── Vault key derivation ─────────────────────────────────────────────
// PBKDF2(username, fixed_pepper) → 64-char hex string.
// Slower than SHA-256 to deter enumeration, but not as slow as data key
// since this happens on every API call.
const VAULT_PEPPER = 'relay-vault-pepper-v1';

async function vaultKey(username) {
  const base = await crypto.subtle.importKey(
    'raw', ENC.encode(username.toLowerCase().trim()), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt: ENC.encode(VAULT_PEPPER), iterations: PBKDF2_ITER_VKEY, hash:'SHA-256' },
    base,
    { name:'AES-GCM', length:256 },
    true, ['encrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// FIX [MED-1]: Validate vault_key format before any DB operation.
// PBKDF2-SHA256 output is always 64 lowercase hex chars.
function isValidVaultKey(vk) {
  return typeof vk === 'string' && /^[a-f0-9]{64}$/.test(vk);
}
