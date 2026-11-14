# Lift Log

A personal workout planner and tracker that runs as an installable web app on your phone.
All data stays on your device (IndexedDB); nothing is sent to a server.

Live: https://ctplatt2.github.io/fitness-app/

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/fitness-app/
npm test
npm run build
```

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
