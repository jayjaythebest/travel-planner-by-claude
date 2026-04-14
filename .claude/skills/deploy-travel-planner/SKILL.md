---
name: deploy-travel-planner
description: Use this skill whenever the user asks to deploy, release, or ship the Travel Planner app to Firebase Hosting — either manually or when diagnosing why a deploy "did nothing" / caused a blank page. This skill enforces the deploy-safety checklist specific to this repo (main repo dir not worktree, .env present, fresh build, hard-refresh reminder).
---

# Deploy Travel Planner (Firebase Hosting)

This repo has a small set of deploy footguns that have caused real production incidents. Follow this checklist every time.

## Preferred path: don't deploy manually
Merging to `main` triggers `.github/workflows/firebase-deploy.yml`, which builds and deploys. Prefer that. Only do a manual deploy when:
- CI is broken / disabled, or
- The user explicitly asks for a hotfix push

## Manual deploy checklist

1. **Confirm you are in the canonical repo dir, not a worktree.**
   ```bash
   pwd
   git rev-parse --show-toplevel
   git worktree list
   ```
   If the current path contains `.claude/worktrees/` or the git dir is not `<repo>/.git`, `cd` to `C:\Users\User\OneDrive\Documents\Travel planner` first. The working tree of a worktree will not contain the user's uncommitted UI tweaks that live in the main repo.

2. **Confirm `.env` exists and has a real `VITE_GEMINI_API_KEY`.**
   ```bash
   test -s .env && grep -E "^VITE_GEMINI_API_KEY=.+" .env || echo "MISSING"
   ```
   If missing, STOP. Ask the user. Do not proceed — the deploy will silently succeed and the site will white-screen (`new GoogleGenAI(...)` throws at module init).

3. **Clean build.**
   ```bash
   npm run lint        # tsc --noEmit
   npm run build       # produces dist/
   ```
   Verify `dist/index.html` and `dist/assets/*.js` exist and are fresh (compare mtime to now).

4. **Deploy.**
   ```bash
   firebase deploy --only hosting
   ```
   Expect a hosting URL (`https://travel-planner-cf0d4.web.app`).

5. **Smoke test.**
   - Open the site in an **incognito window** (aggressive browser caching is a known issue — normal windows will show the old bundle).
   - Log in, open a trip, confirm the AI chat responds (proves `VITE_GEMINI_API_KEY` was inlined correctly).
   - Tell the user: "hard-refresh (Ctrl+Shift+R) if you still see the old version."

6. **Offer a checkpoint commit** (do this after the user confirms the live site looks correct).
   The root cause of past UI regressions: Jay iterates in the working tree without committing, then an unrelated push to `main` triggers CI which builds from the committed state and silently overwrites the deploy. After every successful deploy, check `git status`. If the working tree is dirty, proactively offer:
   > "Want me to commit the current working tree state so the next CI deploy won't regress the UI? I'll run: `git add <modified files> && git commit -m 'checkpoint: deployed state <date>' && git push origin main`"
   Never do this silently — always confirm with the user first.

## If the deploy looks successful but the site is broken
- **Blank white page** → `VITE_GEMINI_API_KEY` was missing at build time. Rebuild with `.env` present and redeploy.
- **"Still old UI"** → browser cache. Instruct hard refresh. Do not rebuild.
- **Firestore errors** → check `.firebaserc` is still pointing at `travel-planner-cf0d4`; check Firestore rules weren't changed.

## Do NOT
- Do not run `firebase deploy` from inside `.claude/worktrees/*`.
- Do not deploy without a fresh `npm run build` against a valid `.env`.
- Do not switch the Firebase project — data lives in `travel-planner-cf0d4`.
