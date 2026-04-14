# Travel Planner

## Project overview
A multi-user travel itinerary planner: create trips, schedule activities in 30-min slots, let Gemini estimate travel times between stops, chat with an AI assistant about the trip, and export the plan as PDF.

## Tech stack
- React 19 + Vite 6 + TypeScript
- Tailwind CSS v4
- Firebase — Auth + Firestore (trips, activities, checklists) + Hosting
- `@google/genai` — Gemini for chat + travel-time estimation
- `jspdf` + `jspdf-autotable` + `html2canvas` — PDF export
- `react-router-dom` v7
- `react-dropzone`, `date-fns`, `motion`, `lucide-react`, `react-markdown`
- Deployed to **Firebase Hosting**: `travel-planner-cf0d4.web.app`
- CI: `.github/workflows/firebase-deploy.yml` auto-deploys on merge to `main`

## Architecture
```
src/
  App.tsx                 # Router + providers
  main.tsx                # Entry
  services/
    firebase.ts           # Firebase app/auth/firestore init
  assets/
    NotoSansTC-Regular.ts # Embedded CJK font for PDF export
    SourceHanSerif-Bold.ts
  (components, hooks, types — see src/)
firebase.json             # Hosting config: serves dist/, SPA rewrite to /
.firebaserc               # Project: travel-planner-cf0d4
.github/workflows/
  firebase-deploy.yml     # Auto-deploy on push to main
```

Data model lives in Firestore: trips (top-level), activities (per trip, with time slots, lat/lng, notes, AI-generated travel times), checklists, chat messages.

## Setup
Required env vars:
- `VITE_GEMINI_API_KEY` — exposed at build time via Vite's standard `VITE_*` prefix; accessed as `import.meta.env.VITE_GEMINI_API_KEY`
- `VITE_GOOGLE_MAPS_API_KEY` — used by `getActivityPhoto()` in geminiService for Google Places photo lookup
- SMTP vars (`SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT`) — see `.env.example`

Local:
```bash
npm install
# .env at repo root with VITE_GEMINI_API_KEY=... and VITE_GOOGLE_MAPS_API_KEY=...
npm run dev
```

## Dev / Build / Deploy
- **Dev:** `npm run dev`
- **Typecheck:** `npm run lint` (tsc --noEmit)
- **Build:** `npm run build` → `dist/`
- **Deploy (preferred):** merge to `main`; GitHub Actions runs the Firebase deploy workflow.
- **Deploy (manual, rare):** `firebase deploy --only hosting` from the **main repo dir** after a fresh `npm run build`.

### Deploy gotchas (bake these in — these have bitten in production)

**RULE 1 — Never deploy from a git worktree.**
Uncommitted UI changes live in the working tree. If Claude is operating inside `.claude/worktrees/<something>/` or any other worktree, the `dist/` built there may be missing the user's latest uncommitted changes, or the wrong `.env`. Always `cd` back to the canonical repo path (`C:\Users\User\OneDrive\Documents\Travel planner`) before building for deploy. If unsure, run `git rev-parse --show-toplevel` and `git worktree list` first.

**RULE 2 — `.env` with `VITE_GEMINI_API_KEY` must exist in the build directory at build time.**
Vite automatically exposes `VITE_*` vars via `import.meta.env.*`. If `.env` is missing or empty, `new GoogleGenAI(...)` throws at module init and the app is a blank white page in production. Before any deploy, verify the key is set: check `.env` contains `VITE_GEMINI_API_KEY=<real-key>` and the build log does not contain the literal string `VITE_GEMINI_API_KEY` inside `dist/assets/*.js`.

**RULE 3 — Browsers cache aggressively.**
After deploy, the user (and testers) must hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) or test in an incognito window. If a bug report says "still broken after deploy," first ask them to hard-refresh before debugging.

**RULE 4 — Always `npm run build` before `firebase deploy`.**
`firebase.json` publishes `dist/`, not source. Stale `dist/` = stale deploy.

## Do NOT
- Do **not** run `firebase deploy` from a worktree. Ever.
- Do **not** run `firebase deploy` without verifying `.env` contains a real `VITE_GEMINI_API_KEY`.
- Do **not** skip the build step (`npm run build`) before a manual deploy.
- Do **not** commit `.env`, `.firebase/` cache, or anything under `dist/`.
- Do **not** change `firebase.json`'s `public: "dist"` — it would break deploys.
- Do **not** switch Firebase projects; this app is tied to `travel-planner-cf0d4` and the Firestore data lives there.
- Do **not** assume a bug is fixed just because local dev works — Vite's `VITE_*` env var inlining can behave differently between dev (runtime substitution) and production build (inlined at build time).

## Conventions
- Components in PascalCase, hooks in `use*`, services in `src/services/`.
- Firestore access goes through `services/firebase.ts` — no direct `getFirestore()` calls scattered across components.
- PDF export is non-trivial due to embedded CJK fonts; when touching `jspdf` code, test with Traditional Chinese activity names before shipping.
- Travel-time fields on activities are persisted to Firestore and only recalculated when activities change (perf fix — see commit `d3d6337`). Don't regress this by recalculating on every render.
- No test suite; rely on typecheck + manual smoke in dev + hard-refreshed preview after deploy.
