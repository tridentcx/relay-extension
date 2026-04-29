# Google Store Submission Checklist

Use this before submitting Relay to the Chrome Web Store.

## Product metadata

- Name: `Relay - Private Bookmark Sync`
- Short name: `Relay`
- Category: Productivity
- Primary value: keep bookmarks in sync across Chromium-based browsers without manual exports, email accounts, tracking, or a readable cloud vault
- Website: `https://relayextension.com`
- Support URL: `https://github.com/trident-cx/relay-extension/issues`
- Privacy policy URL: `https://relayextension.com/privacy`
- Permissions: `bookmarks`, `storage`
- Permission rationale:
- `bookmarks`: read, create, and sync user bookmarks
- `storage`: store session state, plan cache, browser ID, sync metadata, and local ownership token

## Single purpose

```text
Relay keeps browser bookmarks in sync across Chromium-based browsers with an encrypted vault created and decrypted on the user's device.
```

## Privacy answers

- Collects personally identifiable information: No
- Collects browsing history: No
- Collects bookmark contents readable by Relay: No, bookmark data is encrypted client-side
- Uses analytics or tracking: No
- Shares payment data: Payment data is handled by Stripe, not stored by Relay
- Remote code: No remote scripts; remote configuration is data-only
- Data sale: No
- Data transfer for unrelated purposes: No
- Human review of bookmark contents: No, Relay stores encrypted bookmark vault data that is not readable by the service

## Store copy

Short description:

```text
Different browsers. Same bookmarks. Relay keeps Chromium-based browsers current with an encrypted vault only the user can unlock.
```

Long description:

```text
Relay keeps bookmarks in sync across browsers without turning them into another profile about the user.

Relay keeps Chrome, Edge, Brave, Arc, Opera, and other Chromium browsers current with an encrypted vault only the user can unlock.

The interface is intentionally compact: a private vault, a clear sync action, and settings that stay out of the way until bookmarks need updating.

Use a username and password, sync manually on Free, or upgrade to Pro for unlimited Chromium browsers, unlimited bookmarks, auto-sync, and 30-day encrypted restore history.

Privacy basics:
- Bookmarks are encrypted on your device before upload
- Relay does not ask for your name or email
- No analytics SDKs, ads, tracking pixels, or readable bookmark vault
- Account deletion is available inside the extension

Free includes 2 Chromium browsers, 500 bookmarks, and manual sync.
Pro includes unlimited Chromium browsers, unlimited bookmarks, auto-sync, and 30-day restore history.
```

## Detailed description for Google review

```text
Relay is an encrypted bookmark sync extension for people whose bookmarks drift across more than one browser.

It lets users sign in with a username and password, encrypts bookmark data on the device, and syncs the encrypted vault through Relay's backend. This helps users avoid manually exporting, importing, recreating, deleting, and renaming bookmarks across browsers. Relay does not require email, does not include analytics SDKs, does not inject content scripts into pages, and does not collect browsing history.

Free accounts support 2 Chromium browsers, 500 bookmarks, and manual sync. Relay Pro adds unlimited Chromium browsers, unlimited bookmarks, auto-sync, and 30-day encrypted restore history.
```

## Permission explanations

Use these explanations in the Chrome Web Store privacy/permissions form:

```text
bookmarks:
Relay needs the bookmarks permission to read the user's browser bookmark tree, compare it with the encrypted Relay vault, create missing synced bookmarks, and preserve bookmark deletions during sync.

storage:
Relay needs the storage permission to save local extension state such as browser ID, plan cache, last sync timestamp, session metadata, and the local ownership token required for protected sync actions.
```

## Data usage disclosure

```text
Relay does not sell user data and does not use user data for advertising, analytics, creditworthiness, or unrelated product personalization.

Relay stores only the minimum data needed to operate bookmark sync: an encrypted bookmark vault, derived vault lookup identifier, browser install identifier for plan limits, and short-lived operational sync metadata. Bookmark contents are encrypted before upload.
```

## Submission package

Run:

```bash
npm run bump:version -- patch
npm run assets:store
npm run check
npm run package
npm run checksums -- /path/to/relay-extension-stable-v<version>.zip
```

Upload the generated `relay-extension-stable-v<version>.zip` file from the repository root. GitHub Releases publish versioned stable builds and `SHA256SUMS.txt`; there is no `latest` zip.

## Manual QA

- Fresh install shows sign-in/setup
- New account can sync locally
- Same account can sign in from another browser profile
- Bookmark deletion is preserved after sync
- Free plan blocks over-limit browser registration
- Pro history list and restore work
- Account deletion removes the cloud vault
- Pricing, privacy, support, and Stripe links open correctly

## Assets

Upload these PNG files from `store-assets/google-submission/`:

- `store-assets/google-submission/store-icon-128.png`
- `store-assets/google-submission/promo-small-440x280.png`
- `store-assets/google-submission/promo-marquee-1400x560.png`

Google also requires real screenshots in the Chrome Web Store dashboard. Do not use generated mockups for those. Capture screenshots from the installed extension after loading the exact submission build, using clean sample data only and no private bookmarks.

Recommended screenshot set:

- Sign-in/setup screen showing the no-email flow
- Main sync screen after a successful sync with sample bookmarks only
- Settings screen showing privacy/update controls
- Pro restore/history screen if submitting Pro claims
- Account deletion/privacy controls

Source artwork kept in this repository:

- `icons/icon16.png`
- `icons/icon48.png`
- `icons/icon128.png`
- `store-assets/relay-logo.svg`
- `store-assets/promotional/small-promo-440x280.png`
- `store-assets/promotional/marquee-promo-1400x560.png`

Regenerate icons and promotional assets with `npm run assets:store` before a store submission. The generator uses local Chrome or Chromium for PNG rendering; set `CHROME_BIN` if needed.

## Google dashboard upload map

| Dashboard field | Upload |
|---|---|
| Store icon | `store-icon-128.png` |
| Screenshots | Capture real installed-extension screenshots manually |
| Small promo tile | `promo-small-440x280.png` |
| Marquee promo tile | `promo-marquee-1400x560.png` |

The generated image set includes one 128x128 icon, one 440x280 small promo tile, and one 1400x560 marquee tile. Screenshots should be real product captures from the submitted build.

## Rejection watchlist

- Do not add `tabs`, host permissions, content scripts, or broad URL permissions unless absolutely necessary
- Keep the CSP free of `unsafe-inline`, `unsafe-eval`, and remote script sources
- Keep privacy claims aligned with [PRIVACY.md](PRIVACY.md), [privacy.html](../privacy.html), and [SECURITY.md](SECURITY.md)
