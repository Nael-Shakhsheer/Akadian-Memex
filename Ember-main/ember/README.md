# Ember 10

A static, installable idea notebook for GitHub Pages. No backend, build step, analytics, third-party scripts or bundled API keys. Gemini powers voice transcription, briefs and follow-up conversations. Bring your own keys; provider charges and quotas still apply.

## Update your existing installation

1. Export a backup from the old app. Close Ember on other tabs/devices during the update.
2. Replace the deployed app files with **all contents of `ember/`**, including `storage.js`, `sw.js`, the manifest and icons. Preserve the existing GitHub Pages URL and folder. If the app already lives under `ember/` in the repository, replace that folder's contents instead.
3. Commit to the branch served by GitHub Pages. Once deployment completes, close and reopen Ember while online. Settings should show **Ember v10**. Reopen again if the old service worker still controls the page.
4. Existing ideas and Gemini settings migrate in place on the same origin. Do not clear site data or move to another domain without a backup. Changing origin does not move local data automatically.

This ZIP is source code, not a deployment. No repository credentials are included or required to run it locally.

## What's new

- **Security:** strict CSP allowing only local scripts/styles and explicitly listed API origins; no remote embeds, eval, inline scripts, or executable source URLs. API responses and imports render through escaped text/Markdown. Import schemas and file sizes are checked.
- **Optional passphrase lock:** Settings → App lock. Use a long unique passphrase (minimum 12 characters) and repeat it. Existing ideas, audio and settings migrate atomically in IndexedDB. AES-256-GCM uses a fresh 96-bit IV per write. PBKDF2-SHA-256 uses 600,000 iterations and a random 128-bit salt. The derived key stays in memory, never in storage. Plaintext legacy settings are removed after successful migration.
- **Instant capture:** `?capture=voice` tries microphone capture after startup/unlock. The visible microphone remains the one-tap fallback when a browser requires a user gesture. The app manifest includes capture shortcuts where supported. In iOS Shortcuts, use **Open URLs** with the URL shown in Settings, then assign it to the Action Button. No silent or background recording is promised.
- **Follow-up chat:** questions and answers persist with each idea. Context includes the original idea, brief and last 20 messages. Follow-ups do not perform live web searches.
- **Edit and regenerate:** change the text and depth for an existing idea. The prior brief and chat are cleared explicitly before regeneration.
- **Organization:** idea / exploring / building / dropped, favorites, searchable comma-separated tags, and stage/favorite filters.
- **Revisit:** a two-week reminder appears in the idea list and detail view when Ember is open. It is not a scheduled OS notification.
- **Brief depth:** quick sketch (<300 words), standard (700–900), or deep (1200–1600), with a requested competitor comparison table. Model output lengths are targets, not guarantees.
- **Comparison:** two saved ideas and their existing briefs side by side on desktop, stacked on phones. It does not spend API credits or invent a new ranking.
- **Web sources:** choose Google grounding, optional Tavily basic search, or no search. Tavily excerpts and URLs are passed to Gemini as evidence, with explicit source numbering. No raw websites or third-party scripts are loaded. Search failures are visible; no-search briefs are labeled. Free allowances are not unlimited and may change.
- **Backups:** text, briefs, chats, tags and deletion records; no API keys or recordings. With app encryption enabled, exports require a separate encryption passphrase. Imports accept old v1 backups and new v2 backups, validate before writing, and merge newer timestamps.

## Optional cross-device sync

1. Create a GitHub personal access token with **Gists read/write** permission (or classic `gist` scope). Enter it in Settings. Enabling app encryption first is recommended.
2. Leave Gist ID blank on the first device and tap **Sync now**. Choose a long sync passphrase. An encrypted `ember-sync.json` is created in a secret Gist.
3. On the other device, enter the token and the returned Gist ID. Tap **Sync now** and use exactly the same sync passphrase.
4. Sync the device you edited first, then sync the second device. Keys, device settings and audio recordings are never uploaded through this feature. Voice transcripts do sync.

Sync is manual and foreground-only. Newer timestamps win for matching IDs; deletion tombstones prevent deleted ideas reappearing. Keep device clocks accurate. The app checks the remote revision again before writing and stops if it changed, but Gist has no transactional compare-and-swap here: simultaneous writes can still race. **Use one device at a time and keep independent backups.** The encrypted sync file is capped at 900 KB; oversized/truncated files are rejected. Gist history may retain older encrypted versions even after an idea is deleted.

Secret Gists are accessible to anyone with their link; encryption supplies confidentiality, not the “secret” label. Anyone with the token can change or delete the Gist. API keys are excluded even from the encrypted payload.

## Security boundaries

- This protects data **at rest**. A malicious extension, compromised device, modified app code, or same-origin script can access data while unlocked. CSP helps reduce attack surface; it is not a guarantee against XSS or compromised hosting.
- It is a passphrase lock, **not Face ID**. Unlock is required on reload. Switching away hides the app; returning reloads into the lock screen. Active background requests may finish before returning. Use **Lock now** to end the unlocked session immediately. A short numeric PIN is not offered as encryption protection.
- Forgotten passphrases cannot be recovered. There is no passphrase reset or change UI in this release. Keep an independent encrypted backup with a known passphrase. Clearing browser data destroys local records.
- Migration removes current plaintext records, but cannot guarantee forensic erasure of historical browser/disk backups.
- GitHub Pages cannot set arbitrary HTTP security headers. The CSP is in the HTML; deployments with configurable headers should also set `frame-ancestors 'none'` via an HTTP CSP header (not a meta tag). The app does not embed provider-supplied HTML widgets.
- Normal backups omit audio; pending untranscribed recordings cannot be recovered from those backups. Browser storage may be evicted. Requesting persistent storage is best effort, not a guarantee.
- No server-side key custody is added. OpenAI/Anthropic domains are allowed by CSP for future adapters, but this release's AI integration remains Gemini.

## Local validation

Serve `ember/` on localhost (for example `python3 -m http.server 8765 --directory ember`). Tests use Playwright and mocked external APIs, with no real keys:

```
npm install --no-save playwright
npx playwright install chromium
node tests/smoke.cjs
```

The browser executable can be supplied as `CHROMIUM_PATH` if needed. Tests do not certify live provider billing, API availability, iOS permission behavior or native Face ID. Check actual devices and your own keys before relying on those integrations.

API implementation references: [GitHub Gists](https://docs.github.com/en/rest/gists/gists), [Tavily Search](https://docs.tavily.com/), [Web Crypto deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).
