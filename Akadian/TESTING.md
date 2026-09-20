# Validation — Memex 11

## Status of this build

The functional validation below was performed on the codebase **before** the rename to Memex by
Akadian. The rename changed the app's storage identifiers (IndexedDB database, local-storage keys,
backup marker, Gist sync file, service-worker cache) and added a one-time path that copies data
left by the previous release. **That rename has not been re-run through the Playwright suite.**
The test files were updated to match the new names, and every JavaScript file passes `node --check`,
but the suites below should be re-run before deploying:

```
node tests/smoke.cjs
node tests/sync.cjs
node tests/v11.cjs
```

Worth exercising specifically, since it is new and untested: opening the app with data saved by the
previous release still present, both with and without encryption enabled, to confirm ideas appear
and the existing passphrase unlocks.

## Version 11.1 (follow-up chat fix)

Run on 2026-09-20 in Chrome via Playwright with mocked Gemini responses, on Windows:

- `smoke.cjs`, `sync.cjs` and `v11.cjs` all pass (this also re-ran the rename/storage-migration paths that the note above said had not been re-run).
- New `tests/chatfix.cjs` passes: busy retry, per-minute wait with a visible note, daily-quota message with reset time and no pointless retry, question kept and history left clean after a failure, oversized brief/history trimmed and opening with a user turn, low-thinking request with fallback when a model rejects it, cut-off and empty-at-limit answers explained, and comparison chat using the same path.
- `chatfix.cjs` was also run against the pre-fix code and **fails** there, so it does detect the bug.

Not verified: the real Google error wording. The quota classification relies on Google's `RetryInfo` and quota identifiers in HTTP 429 responses, which the docs do not fully specify; unrecognised 429s fall back to a generic quota message. The `thinkingLevel` field name for `generateContent` was not confirmed against live Google docs (the fallback covers a rejection).

Run: `python -m http.server 8765 --directory memex`, then `node tests/chatfix.cjs` (set `BASE` to test another address).

## Prior validation

Validated in headless Chromium on 2026-09-19 using Playwright. External service requests were
intercepted with fixtures; no real API credentials were used.

Passed:
- Text capture and saved idea navigation.
- Status, tags, favorites and two-idea comparison.
- Brief creation, depth-specific requests, follow-up chat, edit/regenerate.
- Encryption migration, ciphertext-only idea payloads, removal of legacy plaintext settings.
- Wrong-passphrase rejection, correct reload/unlock, encrypted backup round-trip and wrong-key rejection.
- Audio Blob encryption and recovery.
- Imported unsafe source URLs restricted to inert links.
- Two isolated browser contexts syncing encrypted Gist payloads, merging edits and propagating deletion tombstones.
- Service-worker offline reload and offline capture.
- Tavily results passed to research and rendered as sources.
- Phone-width layout inspected at 390 × 844.
- JavaScript syntax checks.

Not live-tested: Gemini/Tavily/GitHub account permissions, billing, current provider CORS behavior, physical microphone capture, iOS installation/Action Button permission prompts, or Safari behavior. Those require the user's device and credentials. Native biometrics, push notifications and simultaneous multi-device transactional sync are not implemented.

Run with a localhost server on port 8765:

```
node tests/smoke.cjs
node tests/sync.cjs
```

Requires Playwright and a Chromium installation. Optionally set CHROMIUM_PATH to a compatible browser executable. Tests use synthetic keys only. Test screenshots are written to the system temporary directory.

## Version 11 checks

Additional Playwright browser checks passed with mocked Gemini responses:

- First-access capture instructions appear before any capture shortcut starts recording.
- Short passphrases rejected; encryption enabled from setup with a confirmed passphrase.
- Eight Settings tour steps highlight the relevant controls and finish cleanly.
- Light, Dark, Night and Custom selections apply immediately.
- Custom colors persist across reload and appear before encrypted storage unlocks.
- Completed onboarding stays dismissed on subsequent opens.
- Comparison requests contain both selected ideas and briefs.
- Switching idea pairs separates their conversations.
- Comparison chat bar fits a 390 × 844 viewport.
- Phone screenshots of comparison chat and the Settings tour visually inspected.
- Existing smoke and sync test suites pass after adapting to the new first-run flow.

Run the additional suite with `node tests/v11.cjs` while serving the app at localhost:8765. No live provider calls, physical microphone permission flows or Safari/native device tests were performed.
