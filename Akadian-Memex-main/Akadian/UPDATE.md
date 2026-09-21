# Install the model recovery fix

Replace all files in your existing `Akadian-Memex-main/Akadian/memex` directory with the files in this archive's matching directory. Keep the same folder path so your existing GitHub Pages link and browser storage origin continue to work. Do not upload the ZIP itself as the website.

Commit the upload and wait for GitHub Pages deployment to complete. Refresh Memex with Ctrl+Shift+R (on mobile, close the tab and reopen it). In Settings, list available models, choose one and save. You can also leave the model blank for automatic selection. Do not delete browser site data; it contains your practice sets and ideas.

This update includes `gemini-client.js`, updated `index.html`, `study.js`, and `sw.js`. The service worker cache version is bumped. A 404 now attempts available model recovery, and temporary server errors retry up to three times. These changes do not fix revoked keys, account restrictions or exhausted quota; those now receive more specific messages.
