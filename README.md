# projectplanner_wbs

Weekly project status dashboard, built from `projectmaster.xlsx`.

- `index.html` — the dashboard (week selector, search, team filters, status pills)
- `data.json` — parsed weekly report data (78 weeks, Mar 2025–Sept 2026)

To view locally, serve the folder with any static file server (opening `index.html`
directly via `file://` won't load `data.json` due to browser fetch restrictions), e.g.:

```
npx serve .
```

Or enable GitHub Pages for this repo (Settings → Pages → Deploy from branch `main`, `/`)
to view it at `https://santosarahs.github.io/projectplanner_wbs/`.