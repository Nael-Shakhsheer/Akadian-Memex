# Validation — Ember 10

Validated in headless Chromium on 2026-09-19 using Playwright. External service requests were intercepted with fixtures; no real API credentials were used.

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
