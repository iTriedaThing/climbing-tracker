# Climb Log

A local-first climbing tracker designed for iPhone use.

## Features in v1

- Walls 6–19
- Grades 5.5- through 5.13+
- Route color picker
- Sent / Hung-Fell / Project result
- Difficulty rating (1–5)
- Confidence rating (1–5)
- Optional notes
- Current-week summary
- Full history with filters
- JSON export backup
- JSON import restore
- Offline-capable PWA after first load

## Run locally on a computer

A service worker does not work reliably from a `file://` URL. Serve the folder with any local HTTP server, for example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Put it on an iPhone

The simplest path is to host this folder on a static HTTPS host such as GitHub Pages, Netlify, or Cloudflare Pages.

Once hosted:

1. Open the HTTPS URL in Safari on the iPhone.
2. Use Share → Add to Home Screen.
3. Open Climb Log from the Home Screen.
4. The app shell will be cached for offline use after the first successful load.

Climb records themselves are stored in browser localStorage on that device. Use the Backup tab to export JSON periodically.

## Backup file format

Backups are JSON objects containing app metadata and an `entries` array. Import validates entries before replacing local data.
