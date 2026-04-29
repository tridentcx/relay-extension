<div align="center">
  <img src="icons/icon128.png" width="80" alt="Relay">
  <h1>Relay</h1>
  <p><strong>Different browsers. Same bookmarks.</strong><br>
  One encrypted bookmark vault for Chrome, Edge, Brave, Arc, Opera, and other Chromium browsers. No email account. No tracking profile. No readable cloud copy.</p>

  <a href="https://relayextension.com">Website</a> ·
  <a href="https://github.com/trident-cx/relay-extension/releases">Downloads</a> ·
  <a href="docs/INSTALL.md">Install Guide</a> ·
  <a href="https://github.com/trident-cx/relay-extension/releases/latest">Latest Release</a> ·
  <a href="https://relayextension.com/privacy">Privacy Policy</a> ·
  <a href="https://github.com/trident-cx/relay-extension/issues">Support</a>
  <br><br>
  <a href="https://github.com/trident-cx/relay-extension/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/trident-cx/relay-extension?label=release"></a>
  <a href="https://github.com/trident-cx/relay-extension/actions/workflows/checks.yml"><img alt="Checks" src="https://github.com/trident-cx/relay-extension/actions/workflows/checks.yml/badge.svg"></a>
</div>

---

## Overview

Relay is for people whose bookmarks keep drifting between browsers.

Create a username, save a password, and Relay builds an encrypted vault in your browser. Chrome, Edge, Brave, Arc, Opera, and other Chromium browsers can stay current without exports, imports, or manual cleanup.

The privacy model stays plain: bookmarks are encrypted before upload, and the backend stores the unreadable vault plus the minimum operational metadata needed to keep sync working.

The product goal is simple: one bookmark library wherever you browse, without making a profile out of you.

This repository is intentionally small and user-facing. It includes:

- The browser extension source
- The public website files
- Google submission-ready icons and privacy-first promotional assets
- Installation, privacy, support, and release notes

## Product status

Relay is an actively maintained commercial software project.

- Source is visible for transparency and review
- Relay is proprietary software
- Usage, modification, distribution, and commercial deployment require permission from the copyright holder

See [LICENSE](LICENSE) for the governing terms.

## Plans

| | Free | Pro ($18/yr) |
|---|---|---|
| Chromium browsers | 2 | Unlimited |
| Bookmarks | 500 | Unlimited |
| Sync | Manual | Auto + manual |
| History | — | 30-day restore |

## Install

Download the current stable build from GitHub Releases:

[Relay Releases](https://github.com/trident-cx/relay-extension/releases)

Choose the asset named `relay-extension-stable-v<version>.zip`, then follow [docs/INSTALL.md](docs/INSTALL.md) to load the extension in a supported Chromium-based browser.

## Quick navigation

| I want to... | Go here |
|---|---|
| Install Relay | [docs/INSTALL.md](docs/INSTALL.md) |
| Download a stable build | [Versioned releases](https://github.com/trident-cx/relay-extension/releases) |
| See what changed | [docs/CHANGELOG.md](docs/CHANGELOG.md) |
| Report a problem | [GitHub Issues](https://github.com/trident-cx/relay-extension/issues/new/choose) |
| Review security posture | [docs/SECURITY.md](docs/SECURITY.md) |

## Updates

Relay can check GitHub Releases from inside the extension and tell you when a newer stable build is available. Browser security does not allow an unpacked extension to silently replace its own files, so updates stay explicit: download the versioned stable zip, unzip it, and reload the unpacked folder.

## Security model

Relay separates vault lookup from vault contents:
1. Your **username** is transformed before it is used to locate an encrypted vault.
2. Your **password** derives the local encryption key for bookmark data.
3. A local ownership token is required for sensitive server-side actions.

What lives on the server: a derived vault identifier, an unreadable encrypted blob, and small operational records for sync, plan limits, and abuse protection.

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model and implementation details.

## Docs

- [docs/INSTALL.md](docs/INSTALL.md): install and update Relay
- [docs/SECURITY.md](docs/SECURITY.md): privacy and security model
- [docs/PRIVACY.md](docs/PRIVACY.md): readable privacy policy
- [docs/CHANGELOG.md](docs/CHANGELOG.md): release history
- [docs/GOOGLE_STORE_SUBMISSION.md](docs/GOOGLE_STORE_SUBMISSION.md): Chrome Web Store checklist

## File structure

```text
relay-extension/
├── manifest.json       — MV3 manifest (permissions: bookmarks, storage)
├── background.js       — Service worker: badge dot on bookmark changes
├── config.js           — Public backend connection config
├── crypto.js           — AES-256-GCM + PBKDF2 (IIFE, exports window._relayCrypto)
├── sync.js             — Supabase client, bookmark engine, sync logic (IIFE, exports window._relay)
├── popup.html          — Popup views + design system CSS
├── popup-loader.js     — Tiny first-paint loader for popup.js
├── popup.js            — UI logic: all event handlers, view state
├── config.json         — Remote feature flags served via GitHub Pages
├── docs/               — Install, privacy, security, support, release notes
├── icons/              — icon16.png, icon48.png, icon128.png
├── store-assets/       — Google submission icon and promotional images
└── pricing/            — public pricing and success pages
```

## Architecture

```text
Browser Extension
  chrome.storage.session  -> username + password (cleared on browser close)
  chrome.storage.local    -> browserId, writeToken, plan, lastSync

  popup.js  ->  window._relay (sync.js)        -> backend API surface
  popup.js  ->  window._relayCrypto (crypto.js)

Backend
  encrypted vault storage
  ownership-gated sync operations
  plan and billing integration
  abuse protection and browser-limit enforcement
  encrypted sync history for eligible plans
```

## Remote config

The extension fetches `config.json` from the public website on startup, allowing server-side feature control without a store update:

```json
{
  "free_bookmark_limit": 500,
  "free_browser_limit": 2,
  "maintenance_mode": false,
  "maintenance_message": ""
}
```

Set `maintenance_mode` to `true` to show a maintenance message to all users instantly.

## Development setup

```bash
git clone https://github.com/trident-cx/relay-extension
cd relay-extension
```

Load the folder unpacked from your Chromium-based browser's extensions page with Developer Mode enabled.

There is no build step. Relay is plain HTML, CSS, and vanilla JavaScript.

Recommended local validation before pushing:

```bash
npm run check
```

Run the security scanner directly:

```bash
npm run security:scan
```

Regenerate icons and Google submission artwork:

```bash
npm run assets:store
```

This uses local Chrome or Chromium to render PNG artwork. Set `CHROME_BIN` if your browser executable is in a custom location. Final upload-ready PNGs are copied into `store-assets/google-submission/`.

Package a store-ready zip:

```bash
npm run package
```

Create a checksum file for the package:

```bash
npm run checksums -- /path/to/relay-extension-stable-v<version>.zip
```

Every update must bump `manifest.json` and `package.json` together. Use:

```bash
npm run bump:version -- patch
```

## Commercial use and licensing

Relay is proprietary software. The repository is visible for transparency, review, and approved collaboration only.

- Do not fork or deploy Relay for your own product or service without permission
- Do not reuse the Relay name, icons, or website assets
- Do not distribute modified builds without written approval

If you want to commercialize Relay or negotiate a separate license, use the repository contact path on GitHub.

## Distribution notes

- **Extension permissions:** `bookmarks`, `storage`
- **Hosted assets:** `relayextension.com` for pricing, privacy, and remote config
- **Backend:** Supabase with hardened server-side APIs and Stripe billing support

## License

Proprietary, source-visible. See [LICENSE](LICENSE).
