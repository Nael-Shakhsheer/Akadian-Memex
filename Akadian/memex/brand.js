'use strict';
// Dismisses the Akadian splash (#boot) once the page has loaded. It stays up for at least MIN_MS, counted
// from navigation start, so a fast load reads as a brief splash rather than a flicker. If this script is
// blocked, a CSS animation on .boot removes the splash after 8 s so it can never trap the app.
(() => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const MIN_MS = 700;
  const hide = () => { boot.classList.add('done'); setTimeout(() => boot.remove(), 600); };
  const ready = () => setTimeout(hide, Math.max(0, MIN_MS - performance.now()));
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready, { once: true });
})();
