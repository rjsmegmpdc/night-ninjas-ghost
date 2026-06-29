## Branch
main (clean — feat/electron-desktop merged)

## Session: 2026-06-29

### Completed

**Phase 28 — Electron Desktop Packaging**

- **`electron/main.ts`** — Electron main process. Runs Next.js 15 programmatically on port 3579. Opens BrowserWindow once ready. Single-instance lock, macOS dock support, OS-browser link routing.
- **`electron/preload.ts`** — minimal preload (contextIsolation: true, no Node bridge).
- **`electron/tsconfig.json`** — CommonJS output for Electron main process.
- **`electron-builder.config.js`** — Windows NSIS installer (x64) + macOS DMG (x64 + arm64, unsigned). Asar packs the app; better-sqlite3 and keytar are asarUnpack'd.
- **`.github/workflows/build.yml`** — matrix CI: `windows-latest` builds `.exe`, `macos-latest` builds `.dmg`. Draft GitHub Release created automatically on `v*` tag push.
- **`package.json`** — added `"main": "electron/main.js"`, `electron:compile/dist` scripts, `electron@^33`, `electron-builder@^25.1.8`, `@electron/rebuild@^3.7.1` to devDependencies.
- **`.gitignore`** — added `dist-electron/`, `electron/*.js`, `electron/*.js.map`.

Tests: 609/609. TypeScript: 0 errors.

**To trigger a release build:**
```
git tag v0.2.1 && git push origin v0.2.1
```
GitHub Actions builds Windows + macOS installers and attaches them to a draft release.

**Phase 27 — Loading Performance** (also this session)

- `lib/store/settings.ts` — React cache() on get()
- `app/(app)/patrol/page.tsx` — parallel fetches (activities + context, chronicKm + midEntry merged into 12-item Promise.all)
- 14 × `loading.tsx` — instant animated skeleton on every route

### In progress
- Nothing

### Blocked
- Nothing

### Next session should
- Push a version tag to trigger the first real release build and download the installers
- Add app icons: `electron-assets/icon.ico` (256x256) + `electron-assets/icon.icns` — then uncomment icon lines in `electron-builder.config.js`
- Manual smoke test: navigate between routes — loading skeletons should flash then resolve
- Manual smoke test: compliance bar scroll, quick-log strip, mid-entry banner
- "Shoes Scienve" DB entry: fix in Calendar page (rename the group run)

## Key decisions made (Phase 28)
- Programmatic Next.js server over child-process spawn — no second Node.js binary needed
- Port 3579 fixed to avoid collision with dev ports 3000/3001
- Unsigned macOS (no Apple Developer cert) — right-click → Open on first launch
- DB path already cross-platform via data-dir.ts — no changes needed

## Files changed this session
- electron/main.ts (new)
- electron/preload.ts (new)
- electron/tsconfig.json (new)
- electron-builder.config.js (new)
- .github/workflows/build.yml (new)
- electron-assets/.gitkeep (new)
- package.json (electron deps + scripts)
- package-lock.json (updated)
- .gitignore (dist-electron/ + electron/*.js)
- PHASES.md (Phase 28 entry, version 0.2.28)
- PROGRESS.md (this file)

---

## Previous session: Phase 27 — Loading Performance

- lib/store/settings.ts (cache wrapper)
- app/(app)/patrol/page.tsx (parallel fetches)
- 14 × loading.tsx across all routes
- PHASES.md + PROGRESS.md
