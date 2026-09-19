# Ember – never lose an idea

Capture an idea by voice or text. Ember saves it instantly on your device, then researches it and writes a 1–2 page brief: plausibility, early challenges, approaches, solutions, timeline, future obstacles, and a numbered source list.

A static web app (no backend, no build step). Install it on iPhone via **Share → Add to Home Screen**.

## Deploy on GitHub Pages

1. Create a public repo and upload everything in this folder to the root.
2. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`.
3. Open `https://<your-username>.github.io/<repo>/` on your phone → Share → **Add to Home Screen**.

## First run

Each user brings their own free Gemini API key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) and pastes it in **Settings**. It is stored only in that browser's `localStorage` and sent only to Google. **Never commit a key to the repo.**

## How it works

- **Capture first.** Text and voice notes are written to IndexedDB before anything else happens. With no signal or no key, the idea just waits and is processed automatically later.
- **Voice.** Recorded in-browser as 16 kHz mono WAV (works the same on iOS Safari, the home-screen app, Android and desktop) and transcribed by Gemini.
- **Research.** One Gemini call with Google Search grounding; citations are attached as `[n]` markers plus a source list from the grounding metadata. If the key has no Search access, it retries without search and labels the brief as unsourced.
- **Offline.** A service worker caches the app shell, so it opens and captures ideas offline.

## Notes

- Keep the app open while a brief generates (typically 30–90 s). iOS may pause it in the background; it resumes when you come back.
- iOS can clear website data for sites you haven't opened in a while. Installed home-screen apps are exempt, but use **Settings → Export backup** occasionally.
- The default model is `gemini-3.6-flash` (the Gemini 2.5 models are closed to new accounts). Google Search grounding, which provides the cited sources, is a paid feature for Gemini 3 models, so it needs billing enabled on the key. Without it, Ember still writes the brief but marks it "written without web search" and includes no sources. Change the model in Settings if Google retires it.
- Briefs are AI-generated starting points. Check the sources before relying on them.
