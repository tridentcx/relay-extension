# Support

Relay support is intentionally built around minimal account data. There is no email identity, no password recovery, and no server-side access to readable bookmark contents.

## Best support path

Open an issue at [github.com/trident-cx/relay-extension/issues](https://github.com/trident-cx/relay-extension/issues).

Include:

- Browser and version
- Relay version from the extension settings screen
- Whether you are on Free or Pro
- The action that failed: sign in, sync, restore, upgrade, gift code, or account deletion
- The exact error shown in Relay
- Whether this is a first browser or an additional browser

Do not include:

- Your password
- Full bookmark exports
- Stripe card details
- Private URLs or screenshots containing sensitive bookmarks

## Known support boundaries

- Lost passwords cannot be recovered because Relay never stores them.
- Deleted cloud vaults cannot be restored unless you still have a local browser profile or browser backup containing the bookmarks.
- Sync history is a Pro feature and stores encrypted snapshots only.
- Billing questions may require Stripe dashboard access.

## Security issues

For suspected vulnerabilities, open an issue with a minimal reproduction that does not include secrets, private vault data, or exploit instructions. If public disclosure would create risk, request a private reporting path through the repository contact flow first.
