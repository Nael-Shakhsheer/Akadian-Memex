# Memex by Akadian — Study + Ideas

Memex now opens as an AI study workspace. The original idea refinement app is available through **Ideas** in the workspace switcher (`ideas.html`). No existing idea records are migrated or deleted by this change.

## Run

From this `memex` directory:

```sh
python3 -m http.server 8765
```

Open http://localhost:8765. Use localhost or HTTPS, not a `file://` URL. No build step or package installation is required to run the app. In Settings, enter your Gemini API key, list available models, and choose one supporting text, PDFs and images. Existing Gemini configuration is shared with Ideas. Generation requires internet access and provider quota. No credentials are included.

## Study workflow

1. Paste notes or an existing exam, or upload TXT, Markdown, PDF, PNG, JPEG or WebP. One document per extraction; uploads replace the source editor. Limit: 10 MB and 60,000 extracted characters. Unsupported Word files should first be exported as PDF.
2. Inspect and correct the source. Visual extraction preserves page markers and requests reading order, equations, tables, and diagram relationships; it flags ambiguity. Confirm source review before generation.
3. For seed variations, enter the seed in the main editor and supporting rules, reference text or a worked solution in the reference editor. A bare question alone is not treated as evidence for its own answer.
4. Select difficulty, technical depth, count (1–20), format and learning focus.
5. Memex generates candidate questions, then makes a separate verification request. Local validation rejects unsupported quotations, missing/failed verdicts, invalid options, mismatched formats, and incorrect Bloom labels. Only passing items are saved and shown. If fewer pass, the app explicitly reports the shortfall; if none pass, no set is saved. A mixed set with multiple accepted questions must contain more than one format.
6. Respond without seeing the answer key, then finish to review explanations and source excerpts. MCQ scores are automatic. Written answers use model solutions and self-assessment; they are not automatically marked correct by string matching. Responses autosave. Retry clears the set's previous responses. Print produces the current test or reviewed key.

## Pedagogical mapping

| Selection | Required Bloom levels |
| --- | --- |
| Foundation + conceptual | Remember / Understand |
| Standard + conceptual | Understand / Apply |
| Advanced at either depth | Analyze / Evaluate |
| Technical at any difficulty | Analyze / Evaluate |

Prompts require higher-order tasks, derivations for worked problems, plausible distractors, and explicit grading criteria for written responses. Seed mode requires concept extraction, an abstract formula or logic tree, and changed entities/parameters before generating a new scenario. These fields are visible in answer review.

## Verification: implemented guarantees and limits

Generation and verification are two separate Gemini calls with the same selected model. The verifier independently solves each item, checks source support and requested pedagogy, and returns an explicit verdict. Rejected items are not repaired and silently released. Local quote matching normalizes whitespace only; semantic support is judged by the verifier. The code enforces structural constraints, not a mathematical proof of correctness or actual pedagogical rigor. A second call can repeat the first model's mistake. Educator evaluation remains necessary.

PDF/image extraction uses Gemini native visual document understanding, not a plain-text-only extractor. This release does **not** integrate a separately hosted specialized OCR service or layout model. It does not retain original uploaded binaries, bounding boxes or a visual page overlay. Human-reviewed extracted text is the verification source. Ambiguous original OCR can therefore still affect results.

Official integration references:
- https://ai.google.dev/gemini-api/docs/document-processing
- https://ai.google.dev/gemini-api/docs/structured-output

## Data and privacy

Study sets, sources, answers and ratings live in the existing IndexedDB database under a separate `meta.study` record. They never enter the idea queue, idea comparison, idea export, or GitHub idea sync. Optional AES-GCM encryption covers this record together with existing ideas and keys. Enabling encryption from either mode seals existing study sets atomically. Encryption locks on backgrounding; a forgotten passphrase cannot be recovered. Without encryption local data remains readable by app code and browser storage inspection.

Study history is device-local. Ideas backup/sync does not include study sets. Printing can preserve a human-readable copy. Do not clear browser data if you need to retain the study history.

Extract/generate sends source content to Google; the verification call sends it again with candidates. The key is sent only to Google, and is stored locally (encrypted when the vault is enabled). The key is visible to app code while unlocked. This remains a bring-your-own-key static prototype, not a production server-managed authentication/billing system. API calls are not cached by the service worker. Model discovery and requests use timeouts. A 404 triggers a fresh, paginated model list and up to two switches to available Gemini text models. Successful selections are saved. Temporary HTTP 500/502/503/504 failures receive up to three retries with exponential backoff and jitter; progress is visible and cancellation interrupts the wait. Retries may consume provider quota. Authentication, quota and malformed-request errors are not automatically retried. Leave the model field blank for automatic discovery.

## Code boundaries

- `index.html`, `study.css`, `study.js`: Study workspace, settings, input extraction, practice, persistence.
- `study-core.js`: provider-independent prompt construction, Bloom mapping, validation.
- `storage.js`: shared encrypted vault plus separate study persistence; selects the page's controller after unlock.
- `ideas.html`, `app.js`: original idea refinement mode. See `IDEAS.md` for its legacy documentation.
- `appearance.js`: shared system, light, dark, night and custom themes.
- `sw.js`: updated offline shell for both workspaces. Study generation is online-only.

## Next phase: dedicated educational model

No fine-tuning, training dataset ingestion, Llama/Mistral weights, or dedicated model server has been implemented. The `modelJSON` request boundary and `StudyCore` JSON contracts are the seam for a future provider adapter.

Before switching providers:

1. Introduce a server-side gateway for authentication, quotas, secrets, document parsing and model routing. Move authoritative generation/validation enforcement there; client code can be edited by users.
2. Evaluate a layout-aware OCR service against a representative corpus of scans, columns, tables, diagrams and handwritten equations. Preserve page/region coordinates and confidence, and route uncertain pages for review.
3. Curate appropriately licensed educational data with subject, skill, Bloom level, difficulty, worked solution, distractor rationale and provenance. Split train/evaluation sets by source and problem family to prevent leakage.
4. Fine-tune a selected open model on the same assessment schema and seed abstraction task. Benchmark source entailment, solution correctness, conceptual equivalence, distractor quality and teacher-rated cognitive depth against the Gemini baseline.
5. Keep verification mandatory; consider an independently trained verifier and deterministic math checks. Retain failure withholding, clear provenance and regression evaluation when changing models.

Model recovery patch: `gemini-client.js` owns provider requests and model discovery. No live API key was available for testing. Provider recovery tests use mocked HTTP responses. Reference: https://ai.google.dev/gemini-api/docs/troubleshooting
