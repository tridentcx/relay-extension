'use strict';

const ENC = new TextEncoder();
const DEC = new TextDecoder();

// ── Key derivation ────────────────────────────────────────────────────
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

// ── Encrypt → base64 blob ─────────────────────────────────────────────
async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, ENC.encode(plaintext));
  const buf  = new Uint8Array(32 + 12 + ct.byteLength);
  buf.set(salt,0); buf.set(iv,32); buf.set(new Uint8Array(ct),44);
  return btoa(String.fromCharCode(...buf));
}

// ── Decrypt base64 blob → plaintext ──────────────────────────────────
async function decrypt(blob, password) {
  const buf  = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
  const salt = buf.slice(0,32);
  const iv   = buf.slice(32,44);
  const ct   = buf.slice(44);
  const key  = await deriveKey(password, salt);
  const pt   = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
  return DEC.decode(pt);
}

// ── Vault key = SHA-256 hash of username (hex) ────────────────────────
// Username determines WHERE the vault lives.
// Password determines IF you can read it.
// The DB only ever sees the hash — never the actual username.
async function vaultKey(username) {
  const buf = await crypto.subtle.digest('SHA-256', ENC.encode(username.toLowerCase().trim()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
