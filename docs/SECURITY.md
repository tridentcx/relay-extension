# Security Model — Relay

Relay is designed around a narrow promise: sync bookmarks without giving the service a readable bookmark library. This document describes the implementation at a high level without exposing private operational details.

---

## Vault lookup and encryption

Relay separates locating a vault from decrypting its contents.

### Username-derived vault key

Relay derives a non-plaintext vault identifier from the username before contacting the backend.

- The result is used to locate the encrypted vault
- Usernames are never stored in plaintext by Relay
- The vault identifier is not enough to decrypt bookmark data

Older local installs may still have a device-local `accountSalt` from a previous vault-key model. The extension keeps fallback support so those vaults can be opened from the original browser profile, but new accounts use the portable username-derived vault key so they can sign in from a fresh browser with only username and password.

### Password-derived encryption key

- **What:** Your chosen password (or the generated `xxxxxx-xxxxxx-xxxxxx` format — ~71 bits entropy)
- **Where:** Held in `chrome.storage.session` during your browser session. Cleared when the browser closes. Never stored server-side, never transmitted in plaintext.
- **Role:** Derives the local encryption key for bookmark data using a deliberately slow password-based key derivation flow. Without the password, the stored blob is unreadable.

---

## Data encryption

Bookmark data is encrypted on the user's device before upload. Encryption uses authenticated encryption with fresh randomness per sync, so the same bookmark set does not produce a stable reusable ciphertext.

---

## What the server stores

| Data | Stored as | Readable by server? |
|---|---|---|
| Bookmarks | AES-256-GCM encrypted blob | No |
| Vault identifier | One-way derived identifier | Yes (row key) |
| Password | Not stored | No |
| Username | Not stored | No |
| Write token | Random 32-byte hex token | Used only for ownership checks |
| Identity | Nothing | No |

Even a complete database breach yields encrypted bookmark blobs that require each user's password to decrypt.

---

## Password strength

Generated passwords use the format `xxxxxx-xxxxxx-xxxxxx`:

- 3 groups of 6 characters
- Character set: `abcdefghijkmnpqrstuvwxyz23456789` (32 chars, no ambiguous l/1/0/o)
- Each group guaranteed to contain at least one digit
- Entropy: ~71 bits

The generated password format is designed to be high entropy while still being practical to save and type.

---

## Write token

Each vault has a local ownership token generated at account creation. Current vault snapshots include this token inside the encrypted payload, so a second browser can recover it only after decrypting with the account password.

Sensitive backend operations require this ownership token before updating, deleting, registering browsers, or accessing sync history.

---

## Code isolation (IIFE modules)

`crypto.js` and `sync.js` are wrapped in IIFEs. Their internal functions (`encrypt`, `decrypt`, `vaultKey`, `supabase`, etc.) are not accessible from the browser console. Only the explicitly exported surfaces are reachable:

```javascript
window._relayCrypto = { encrypt, decrypt, vaultKey, isValidVaultKey }
window._relay       = { doSync, pullFromCloud, checkUsernameAvailable,
                        getPlan, listHistory, restoreFromSnapshot,
                        redeemGiftCode, deleteVault, clearAuthToken }
```

The public backend connection config is intentionally not treated as a secret. Security depends on server-side authorization, local ownership proof, and encryption.

---

## URL filtering

Only bookmarks with these protocols are synced: `http:`, `https:`, `ftp:`, `ftps:`

Excluded:

- `file://` — would leak local filesystem paths across devices
- `chrome://`, `edge://` — browser-internal URLs meaningless on other browsers
- `about://`, `javascript://`, `data://` — browser-internal or dangerous

---

## Backend access controls

Direct public table access is blocked. The extension uses narrow server-side API entry points that expose only the fields required by the product flow. Sensitive operations are ownership-gated, and ownership tokens are not returned by anonymous API responses.

---

## Rate limiting

Server-side abuse controls limit excessive sync attempts and retain only short-lived operational records needed for protection.

---

## Content Security Policy

```text
script-src  'self'
object-src  'self'
connect-src 'self' https://mgeiplftbehngfsqtbiq.supabase.co https://relayextension.com https://api.github.com
```

No inline scripts. No eval. No external script sources.

---

## Reporting a vulnerability

Open a GitHub issue at [github.com/trident-cx/relay-extension/issues](https://github.com/trident-cx/relay-extension/issues) with a minimal, non-sensitive reproduction. Do not post secrets, private vault data, or step-by-step abuse instructions. If public disclosure would create risk, request a private reporting path through the repository contact flow first. We aim to respond within 48 hours.
