# Changelog — Relay

This public changelog tracks user-facing release changes. Internal deployment, backend, management, and incident details are kept outside this repository.

## Unreleased

## v1.0.8 — 2026-04-29
- Declared popup dimensions in the first bytes of the document to prevent Edge's tiny pre-size flash
- Removed the first-open view animation and kept smoother transitions for later in-popup navigation

## v1.0.7 — 2026-04-29
- Improved popup first paint by loading the full UI controller after the browser paints the interface
- Kept the direct Edge-safe popup path while reducing startup work before the popup becomes visible

## v1.0.6 — 2026-04-29
- Fixed slow Microsoft Edge startup for downloaded release zips by removing the popup redirect handoff
- Simplified the release package back to one popup document so Edge opens the action popup directly
- Removed unused popup shell files from the downloadable build

## v1.0.5 — 2026-04-29
- Changed the popup shell handoff to a local page navigation for better Edge compatibility
- Removed the local `fetch` and DOMParser bootstrap path that could hang in Edge extension popups
- Kept the tiny shell first so the icon click still paints immediately

## v1.0.4 — 2026-04-29
- Reworked the popup into a tiny instant shell plus a local app payload
- Reduced the action popup's initial document from the full interface to a lightweight first-paint screen
- Loaded the full Relay UI only after the browser has displayed the popup shell

## v1.0.3 — 2026-04-29
- Improved popup click-to-visible speed by loading sync and encryption modules after first paint
- Kept the sign-in screen static and immediate while prewarming sync code in the background
- Reduced parser-blocking popup scripts to make downloaded release zips feel snappier

## v1.0.2 — 2026-04-29
- Improved popup startup reliability for freshly loaded release zips
- Made the sign-in screen render immediately from static HTML before async extension startup finishes
- Delayed the silent update check until after the first view is visible

## v1.0.1 — 2026-04-29
- Tightened the extension network allowlist to the production Relay domain, Supabase, and GitHub Releases API
- Added release checksums for downloadable zip verification
- Removed generated screenshot mockups from the Google submission bundle; store screenshots should be captured from the real submitted build
- Added a live sync RPC contract test to catch backend grant regressions before submission

## v1.0.0 — 2026-04-29
- Public launch baseline for Relay under Trident CX
- Includes private bookmark sync, on-device encryption, manual sync, Pro auto-sync, restore history, and account deletion
- Includes Google submission-ready promotional graphics, install guidance, privacy policy, support docs, and versioned release packaging
