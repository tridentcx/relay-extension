# Privacy Policy - Relay

*Last updated: April 29, 2026*

## The Short Version

Relay does not ask for your name or email, does not use analytics SDKs, and encrypts bookmark contents before sync. The service stores an encrypted vault, not a readable bookmark profile.

## What We Collect

Relay stores the minimum data needed to operate encrypted bookmark sync:

- **Encrypted vault:** your bookmark data after it has been encrypted on your device.
- **Vault lookup key:** a derived identifier used to find your vault without storing your username in plain text.
- **Browser UUID:** a random install identifier used for browser limits and abuse prevention.
- **Short-lived sync metadata:** minimal technical metadata used for rate limits, abuse prevention, and reliability.

## What We Do Not Collect

Relay does not collect, store, or transmit:

- Your name
- Your email address
- Your password in plaintext
- Your browsing history
- Your location data
- Analytics events or tracking identifiers
- Readable bookmark contents

## Third Parties

**Supabase** stores encrypted vault data and operational metadata for sync.

**Stripe** handles Relay Pro payments. Relay does not receive card details.

**Cloudflare/GitHub hosting** may process standard request metadata when you visit Relay web pages or download a release.

Relay does not include advertising networks, tracking pixels, analytics SDKs, or remote scripts.

## Data Retention

Your encrypted vault is retained until you delete your account. Pro sync history is retained for a limited restore window, then expires. Account deletion removes the server-side vault and related sync records. Payment records are handled by Stripe according to Stripe's retention requirements.

## Cookies and Tracking

Relay does not use website analytics, tracking pixels, advertising scripts, or extension telemetry. The extension does not inject content into web pages. Website hosts and CDNs may keep standard security and delivery logs.

## Source Visibility

Relay's public repository is visible at [github.com/trident-cx/relay-extension](https://github.com/trident-cx/relay-extension) for transparency and review.

Usage, redistribution, modification, and commercial deployment are governed by the proprietary license.

## Changes

If this policy changes materially, we will update the date above.

## Contact

Questions? Open an issue at [github.com/trident-cx/relay-extension/issues](https://github.com/trident-cx/relay-extension/issues).
