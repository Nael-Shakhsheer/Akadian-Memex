# Memex 11

By **Akadian**.

A static, installable idea notebook for GitHub Pages. No backend, build step, analytics, third-party scripts or bundled API keys. Gemini powers voice transcription, briefs and follow-up conversations. Bring your own keys; provider charges and quotas still apply.

## Update your existing installation

1. Export a backup from the old app. Close the app on other tabs/devices during the update.
2. Replace the deployed app files with **all contents of `memex/`**, including `storage.js`, `sw.js`, the manifest and icons. The app folder is now `akadian/memex/`; deploy it at that path and drop the folder it replaces.
3. Commit to the branch served by GitHub Pages. Once deployment completes, close and reopen the app while online. Settings should show **Memex v11 · by Akadian**. Reopen again if the old service worker still controls the page.
4. Existing ideas and Gemini settings migrate in place on the same origin. Do not clear site data or move to another domain without a backup. Changing origin does not move local data automatically.

This ZIP is source code, not a deployment. No repository credentials are included or required to run it locally.

## Carrying over existing data

This release renamed the app. Its stored data moved with it, so a one-time compatibility path reads
what the previous release left behind:

- **Ideas and the encrypted vault.** On first run, if the new database is empty, records are copied from the previous database, including the vault salt — your existing passphrase still unlocks the app. The old database is left in place untouched, so a failed copy loses nothing.
- **Settings and theme.** Read from the previous local-storage keys when the new ones are absent, then written under the new names.
- **Backups.** Imports accept files exported by the previous release as well as new `memex` backups.
- **Gist sync.** A sync file written by the previous release is read once, then retired from the Gist on the next write so two devices cannot drift onto different files.
- **Offline cache.** The retired service-worker cache is deleted on activation.

These paths are marked in the source (`LEGACY` in `storage.js`, the `RETIRED_*` constants in `app.js`, `RETIRED_CACHE_PREFIX` in `sw.js`). Once every device has opened the new release and synced, they can be deleted.

**Not automatic:** the repository name still appears in the GitHub Pages URL. Renaming the repository is a GitHub-side change and it changes the origin, which does not carry local data with it — export a backup first if you rename it.

## In version 11

- **Comparison chat:** a compact bar remains below the comparison. Ask follow-ups using both selected ideas and briefs as context. Each pair has its own conversation during the open session. Changing an idea or regenerating its brief starts fresh context. Comparison chats are not persisted, synced or backed up, and clear when the app locks/reloads. Answers use Gemini and do not perform live web search.
- **First-run setup:** a three-step guide introduces instant capture, offers optional passphrase encryption, and introduces services. It appears once per browser installation, including once for users upgrading from the previous version. Encryption requires explicit action and a confirmed passphrase. Capture shortcuts wait for this guide to finish on first access.
- **Settings tour:** eight short steps highlight Gemini, search options, brief depth, encryption, Gist sync, shortcuts, appearance and backups. Replay with **Tour Settings**. Replay setup with **Getting started**.
- **Appearance:** choose Match device, Light, Dark, warm Night, or Custom colors. Custom background/accent choices automatically derive panel, text and scrollbar colors. Low-contrast link colors are adjusted for readability. Preferences apply immediately and are stored locally as non-sensitive appearance settings, so the lock screen uses the same theme. They do not sync between devices.
- **Scrollbars:** thin, rounded, theme-aware scrollbars throughout the app, including dialogs and chats. Exact appearance follows browser support and OS settings.

## Existing features

- **Security:** strict CSP allowing only local scripts/styles and explicitly listed API origins; no remote embeds, eval, inline scripts, or executable source URLs. API responses and imports render through escaped text/Markdown. Import schemas and file sizes are checked.
- **Optional passphrase lock:** Settings → App lock. Use a long unique passphrase (minimum 12 characters) and repeat it. Existing ideas, audio and settings migrate atomically in IndexedDB. AES-256-GCM uses a fresh 96-bit IV per write. PBKDF2-SHA-256 uses 600,000 iterations and a random 128-bit salt. The derived key stays in memory, never in storage. Plaintext legacy settings are removed after successful migration.
- **Instant capture:** `?capture=voice` tries microphone capture after startup/unlock. The visible microphone remains the one-tap fallback when a browser requires a user gesture. The app manifest includes capture shortcuts where supported. In iOS Shortcuts, use **Open URLs** with the URL shown in Settings, then assign it to the Action Button. No silent or background recording is promised.
- **Follow-up chat:** questions and answers persist with each idea. Context includes the original idea, brief and last 20 messages. Follow-ups do not perform live web searches.
- **Edit and regenerate:** change the text and depth for an existing idea. The prior brief and chat are cleared explicitly before regeneration.
- **Organization:** idea / exploring / building / dropped, favorites, searchable comma-separated tags, and stage/favorite filters.
- **Revisit:** a two-week reminder appears in the idea list and detail view when Memex is open. It is not a scheduled OS notification.
- **Brief depth:** quick sketch (<300 words), standard (700–900), or deep (1200–1600), with a requested competitor comparison table. Model output lengths are targets, not guarantees.
- **Comparison:** two saved ideas and their existing briefs side by side on desktop, stacked on phones. It does not spend API credits or invent a new ranking.
- **Web sources:** choose Google grounding, optional Tavily basic search, or no search. Tavily excerpts and URLs are passed to Gemini as evidence, with explicit source numbering. No raw websites or third-party scripts are loaded. Search failures are visible; no-search briefs are labeled. Free allowances are not unlimited and may change.
- **Backups:** text, briefs, chats, tags and deletion records; no API keys or recordings. With app encryption enabled, exports require a separate encryption passphrase. Imports accept old v1 backups and new v2 backups, validate before writing, and merge newer timestamps.

## Optional cross-device sync

1. Create a GitHub personal access token with **Gists read/write** permission (or classic `gist` scope). Enter it in Settings. Enabling app encryption first is recommended.
2. Leave Gist ID blank on the first device and tap **Sync now**. Choose a long sync passphrase. An encrypted `memex-sync.json` is created in a secret Gist.
3. On the other device, enter the token and the returned Gist ID. Tap **Sync now** and use exactly the same sync passphrase.
4. Sync the device you edited first, then sync the second device. Keys, device settings and audio recordings are never uploaded through this feature. Voice transcripts do sync.

Sync is manual and foreground-only. Newer timestamps win for matching IDs; deletion tombstones prevent deleted ideas reappearing. Keep device clocks accurate. The app checks the remote revision again before writing and stops if it changed, but Gist has no transactional compare-and-swap here: simultaneous writes can still race. **Use one device at a time and keep independent backups.** The encrypted sync file is capped at 900 KB; oversized/truncated files are rejected. Gist history may retain older encrypted versions even after an idea is deleted, including versions written under the previous file name.

Secret Gists are accessible to anyone with their link; encryption supplies confidentiality, not the “secret” label. Anyone with the token can change or delete the Gist. API keys are excluded even from the encrypted payload.

## Security boundaries

- This protects data **at rest**. A malicious extension, compromised device, modified app code, or same-origin script can access data while unlocked. CSP helps reduce attack surface; it is not a guarantee against XSS or compromised hosting.
- It is a passphrase lock, **not Face ID**. Unlock is required on reload. Switching away hides the app; returning reloads into the lock screen. Active background requests may finish before returning. Use **Lock now** to end the unlocked session immediately. A short numeric PIN is not offered as encryption protection.
- Forgotten passphrases cannot be recovered. There is no passphrase reset or change UI in this release. Keep an independent encrypted backup with a known passphrase. Clearing browser data destroys local records.
- Migration removes current plaintext records, but cannot guarantee forensic erasure of historical browser/disk backups. The previous release's database is deliberately left in place after its contents are copied, so it still holds a copy until browser data is cleared.
- GitHub Pages cannot set arbitrary HTTP security headers. The CSP is in the HTML; deployments with configurable headers should also set `frame-ancestors 'none'` via an HTTP CSP header (not a meta tag). The app does not embed provider-supplied HTML widgets.
- Normal backups omit audio; pending untranscribed recordings cannot be recovered from those backups. Browser storage may be evicted. Requesting persistent storage is best effort, not a guarantee.
- No server-side key custody is added. OpenAI/Anthropic domains are allowed by CSP for future adapters, but this release's AI integration remains Gemini.

## Local validation

Serve `memex/` on localhost (for example `python3 -m http.server 8765 --directory memex`). Tests use Playwright and mocked external APIs, with no real keys:

```
npm install --no-save playwright
npx playwright install chromium
node tests/smoke.cjs
node tests/sync.cjs
node tests/v11.cjs
```

The browser executable can be supplied as `CHROMIUM_PATH` if needed. Tests do not certify live provider billing, API availability, iOS permission behavior or native Face ID. Check actual devices and your own keys before relying on those integrations.

API implementation references: [GitHub Gists](https://docs.github.com/en/rest/gists/gists), [Tavily Search](https://docs.tavily.com/), [Web Crypto deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).
