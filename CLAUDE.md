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
- `VITE_GOOGLE_OAUTH_CLIENT_ID` — OAuth 2.0 **Web application** client ID for the Google Calendar sync. Unlike the two above, a missing value is a supported state: `services/googleCalendar.ts` reads it into a const and never validates at module scope, so the app still loads and only the calendar button reports it is unconfigured. It is not a secret — it ships in the bundle, and what protects it is the client's authorized-JavaScript-origins list, which must contain `https://travel-planner-cf0d4.web.app` for production and `http://localhost:5173` for dev
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
Uncommitted UI changes live in the working tree. If Claude is operating inside `.claude/worktrees/<something>/` or any other worktree, the `dist/` built there may be missing the user's latest uncommitted changes, or the wrong `.env`. Always `cd` back to the canonical repo path (`C:\Projects\travel-planner`) before building for deploy. A stale clone is still on disk at `C:\Users\User\OneDrive\Documents\Travel planner` — it was the canonical path before the 2026-05-24 migration and is frozen at `13307a9` (April 2026), so a build there ships months-old code over the live site. If unsure, run `git rev-parse --show-toplevel` and `git worktree list` first.

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
- **Google Calendar sync mirrors the activities each traveller picks, and `trip.gcal_users[uid]` is what makes it a mirror.** Three entry points decide it: the header button opens `CalendarSyncModal` for the whole trip, a day tab's 加入日曆 opens it scoped to that day, and each activity card's calendar icon toggles that one activity. Each decides only for the activities it shows (`scopeIds` in `handleSyncCalendar`) and keeps the rest of the viewer's choices, then syncs the whole chosen set — syncing only the scope would remove every other day's events. The choice is stored as `excluded` ids so activities added later default to included. Each member syncs to their **own** Google account, so the activity-id → event-id map is kept per uid — one shared map (the legacy `trip.gcal`, now adopted as the owner's and deleted on their next sync) made a second member's sync patch event ids that only existed in the first one's calendar. With the map, an edited activity patches its own event, and one deleted in the app or unticked has its event removed on the next sync. Two things hold it together. The map lives on the **trip**, not on each activity, because a deleted activity would take its own event id with it and nothing could ever clean up after it. And a failed sync writes **nothing** back, because a partial map silently orphans every event it forgot. Re-pressing the button must always be safe: the access token expires after an hour, so a retry is the normal path, not the exception.
- **Calendar event times carry the destination's time zone, never the browser's.** `TIMEZONE_MAP` in `utils.ts` is keyed the same way `CURRENCY_MAP` is. A naive `09:00` sent without `timeZone` is read in the *viewer's* zone, which puts a Tokyo morning in the middle of the night for someone still at home. USA is a knowing approximation — one country field cannot express six zones.
- **Nothing may be planned or booked for hours the travellers are not in town.** `freeWindows()` in `utils.ts` and `free_windows()` in `reservation-agent/main.py` are the same rule and must stay in step: on a first-half-of-trip day nothing starts until 90 min after the last flight lands; on a second-half day everything ends 3 h before the first flight leaves. Suggested-plan stops outside the window render as 與航班時間衝突 and cannot be imported; Muse's booking email lists the windows, reported slots outside them are dropped, and a change to the windows re-sends the request. This exists because a plan written before the flights were known put Day 1 dinner in Roma while the travellers were still over Houston, and Muse offered Pujol two hours after the flight home.
- No test suite; rely on typecheck + manual smoke in dev + hard-refreshed preview after deploy.
