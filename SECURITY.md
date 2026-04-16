# How Relay Protects Your Data

Relay was built privacy-first. Here's exactly how your data is protected — no marketing, no vague claims, just the technical truth in plain language.

---

## The two secrets

Relay uses two completely independent secrets. An attacker needs **both** to access your bookmarks. Knowing one tells them nothing about the other.

### 🔑 Your passphrase

- **What it does:** Encrypts and decrypts your bookmark data using AES-256-GCM with a PBKDF2-derived key (310,000 iterations, SHA-256).
- **Where it lives:** Only in your head (and your recovery key file if you downloaded one). Relay never stores it, never transmits it, never logs it.
- **What it protects:** The actual content of your bookmarks. Without your passphrase, the encrypted blob stored in the cloud is completely unreadable — even to us.

### 🎲 Your vault ID

- **What it does:** Identifies which row in the database belongs to you.
- **Where it lives:** Your browser's `chrome.storage.local`. It is generated randomly on first setup and never leaves your device except as an identifier in API requests.
- **What it protects against:** Brute force. Your vault ID is a random 128-bit UUID — completely unrelated to your passphrase. An attacker who somehow guesses your passphrase still cannot find your vault without the vault ID.

---

## Why two secrets?

A common attack on encrypted cloud storage is:

1. Enumerate all vaults in the database
2. For each vault, try to decrypt with a guessed passphrase
3. If decryption succeeds, the data is compromised

If the vault ID were **derived from the passphrase** (which is what many apps do), then brute-forcing the passphrase automatically reveals the vault ID too. One secret to break everything.

Relay generates the vault ID **randomly and independently**. This means:

| What the attacker has | What they can do |
|---|---|
| Passphrase only | Nothing — can't find the vault |
| Vault ID only | Nothing — encrypted blob is unreadable |
| Both | Full access |

The vault ID is the harder secret to steal (it's stored locally), and the passphrase is the harder secret to guess (it never leaves your device). Neither is useful alone.

---

## What Relay (and Supabase) can see

| Data | What we store | Can we read it? |
|---|---|---|
| Your bookmarks | AES-256-GCM encrypted blob | ❌ No |
| Your vault ID | Random UUID | ✅ Yes (it's a row identifier) |
| Your passphrase | Not stored at all | ❌ No |
| Your identity | Nothing — no email, no name | ❌ No |

Supabase (our cloud provider) also cannot read your bookmarks. They store the same encrypted blob. Even a full database breach would yield only unreadable ciphertext.

---

## Encryption details

| Property | Value |
|---|---|
| Algorithm | AES-256-GCM |
| Key derivation | PBKDF2 |
| Iterations | 310,000 |
| Hash | SHA-256 |
| Salt | 32 bytes, random per encrypt |
| IV | 12 bytes, random per encrypt |
| Key length | 256 bits |

The salt and IV are randomly generated on every sync, so the same plaintext will produce a different ciphertext every time. This prevents pattern analysis.

---

## Your recovery key

When you set up Relay, you're offered a recovery key file. This file contains:

1. Your **vault ID** (so you can restore access after reinstalling Relay)
2. Your **passphrase** (so you don't lose it)
3. Plain-language instructions for restoring

**Store this file in a password manager or encrypted drive.** Do not store it unencrypted in cloud storage (Dropbox, Google Drive, etc.) — that would give anyone with access to those accounts both secrets.

If you lose your passphrase and don't have a recovery key, your bookmarks cannot be recovered. This is intentional — no back door means no one can use a back door against you.

---

## What happens if you reinstall Relay?

Reinstalling the extension clears `chrome.storage.local`, which wipes your vault ID. Without it, Relay can't find your vault.

**To restore:** Use the "Restore from recovery key" option on the unlock screen. Enter your vault ID and passphrase from your recovery key file. Your bookmarks will be decrypted from the cloud and restored.

---

## Open source

Relay's source code is fully open on GitHub. You can verify every claim on this page by reading the code yourself:

- Encryption: [`crypto.js`](./crypto.js)
- Sync logic: [`sync.js`](./sync.js)
- UI + vault ID generation: [`popup.js`](./popup.js)

If you find a security issue, please open a GitHub issue or contact us directly.
