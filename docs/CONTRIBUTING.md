# Contributing to Relay

Relay is a proprietary product. Contributions are accepted only with the repository owner's approval.

## Before you start

- Review [LICENSE](../LICENSE) to understand the repository terms
- Open an issue before starting substantial work unless you already have direct approval
- Keep changes focused; avoid mixing bug fixes, UI changes, and operational edits in one branch
- Update documentation when behavior, setup, pricing, privacy, security, or licensing expectations change

## Local workflow

```bash
git checkout -b codex/<short-description>
npm run bump:version -- patch
npm run check
```

Manual verification should cover:

- Sign in with an existing account
- Sign in with a different account on the same browser profile
- Bookmark create, rename, move, and delete flows
- Manual sync and any auto-sync behavior affected by the change
- Pricing, privacy, and support links if UI copy changes

## Coding expectations

- Keep the extension dependency-free unless a clear business need justifies otherwise
- Preserve the current privacy model: no analytics, no hidden telemetry, no unnecessary permissions
- Prefer small, reviewable patches over large rewrites
- Treat data loss, sync correctness, and account ownership as high-risk areas
- Match the existing browser-extension architecture unless there is a compelling reason to refactor

## Documentation expectations

Update the relevant docs when you change:

- Product behavior: [README.md](../README.md), [CHANGELOG.md](CHANGELOG.md)
- Security-sensitive behavior: [SECURITY.md](SECURITY.md)
- Data collection or retention statements: [PRIVACY.md](PRIVACY.md), [privacy.html](../privacy.html)

## Pull requests

- Use clear titles that describe the user-facing outcome
- Include verification notes in the PR description
- Do not merge until checks and manual validation are complete

## Ownership and commercial rights

Submitting code, copy, or design suggestions does not transfer ownership of Relay branding or product rights. The repository owner retains control over licensing, distribution, and release decisions unless a separate written agreement says otherwise.
