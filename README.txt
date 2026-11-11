MathMatrix LIVE free-orientation release

Upload index.html, manifest.json, sw.js to the ROOT of the live GitHub Pages repository, preserving existing assets.

Both portrait and landscape are supported on iPhone and Android, as in beta. The beta page logic is retained. Android navigation layout is unchanged.

IMPORTANT: the previous live manifest already declared orientation:any, and the HTML already contained free-orientation layout code. The reported portrait lock may therefore come from an OLD INSTALLED PWA, cached service worker, device rotation lock, or the live site serving a different manifest. This release refreshes the manifest URL and service-worker cache version.

After deploying, test in Safari/Chrome browser first with device auto-rotate enabled. On an installed app, fully close/reopen; if it remains locked, remove its old home-screen installation and install again after the updated manifest is served. iOS home-screen app behavior may vary by OS.

This is not a verified production deployment; test on real devices.
