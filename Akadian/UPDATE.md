# Install this update

Replace the files in your existing `Akadian/memex` directory with the files in this archive's matching directory. Keep the same folder path so your GitHub Pages link and browser storage origin continue to work. Do not upload the ZIP itself as the website.

**Upload the new `memex/vendor/` folder as well.** It holds the maths typesetting engine and its fonts (22 files). If it is missing the app still runs, but equations show as raw LaTeX such as `$\rho_{xx}$` instead of being typeset.

New and changed files in this update: `vendor/katex/` (new), `mathtext.js` (new), `index.html`, `study.js`, `study-core.js`, `study.css`, `sw.js`.

Commit the upload and wait for GitHub Pages deployment to complete. Refresh Memex with Ctrl+Shift+R (on mobile, close the tab and reopen it). The service worker cache version is bumped, so reopen once more if the old version still appears. Do not delete browser site data; it contains your practice sets and ideas.

## What changed

- **Equations are typeset.** Mathematics now renders through KaTeX, vendored locally so the strict Content-Security-Policy is unchanged, nothing is loaded from a third party, and equations still render offline. The question generator and the PDF/image extractor are now instructed to write mathematics as LaTeX.
- **Answer options line up.** Option radio buttons were being caught by the full-width form-field rule, which stretched each circle to the width of its row. They are now sized as controls.
- **Right and wrong are obvious.** A reviewed multiple-choice question marks the correct option in green and your incorrect pick in red, each labelled, and the verdict heading carries a ✓, ✕, – or ◆ badge. A wrong answer previously read "Review this answer" in the same green as a correct one.
- **Source attribution moved.** The per-question "From your source" quotation is gone from each explanation; a single note at the end of the set explains that everything was written from, and checked against, your source material.
- **Mangled equations are repaired on display.** Visual extraction sometimes returned an equation one character per line, which rendered as a vertical column. Runs of single-character lines are rejoined when displayed.

Sets generated before this update keep their original plain text, and still gain the layout, answer-state and source-note changes. Generate a new set to see typeset mathematics.

## Note on existing practice sets

Your saved sets are untouched by this update. The stored `sourceQuote` for each question is still kept in storage — it is simply no longer displayed per question.
