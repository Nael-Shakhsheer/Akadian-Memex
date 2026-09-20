# Memex 11

By **Akadian**.

Capture, research, organize and refine ideas in an installable static web app.

The app lives in `akadian/memex/` and is served from that path on GitHub Pages.

## In 11.1 (follow-up chat fix)

- Follow-up and comparison questions no longer fail with quota / "out of tokens" style errors on busy or rate-limited accounts. They now retry through "high demand" errors, wait out per-minute limits automatically, and say plainly when a *daily* free allowance is used up and when it resets.
- Follow-ups send a size-bounded amount of context (trimmed brief and history), ask Gemini 3 models for light reasoning, and keep your question in the box if a request fails.
- Cut-off answers are labeled, and an empty answer at the length limit is explained.

## In 11

- Ask follow-up questions about two ideas in the comparison view.
- First-run prompts for instant capture and optional encryption.
- Replayable Settings tour highlighting services and controls.
- Light, Dark, warm Night and custom color themes.
- Slim scrollbars that match your chosen theme.

## Deploying

Replace the deployed app files with the contents of `akadian/memex/`, including `appearance.js`.
Commit to the branch GitHub Pages serves, then close and reopen the app while online. Settings
should show **Memex v11.1 · by Akadian**.

Ideas and settings saved by the previous release are picked up automatically on the same origin —
see "Carrying over existing data" in `memex/README.md`.

See `memex/README.md` for setup, security boundaries and upgrade details, and `TESTING.md` for
validation status.
