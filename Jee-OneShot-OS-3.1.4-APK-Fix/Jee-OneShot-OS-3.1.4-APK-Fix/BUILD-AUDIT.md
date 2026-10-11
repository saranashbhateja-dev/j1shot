# Jee OneShot OS 3.1.1 — Build Audit

## Changes

- Renamed the app in the browser tab, header, Android app label, launcher, health endpoint, settings footer, backup metadata, and documentation to **Jee OneShot OS**.
- Removed raw YouTube video titles from the shipped JSON, UI render paths, and search index. Only the user's chapter/topic names are displayed.
- Kept the video IDs and URLs that make each Watch button open the matching video.
- Removed obsolete UI styles responsible for the chapter/title collision shown in the user's screenshot.
- Kept local storage key `jee-os-one-shot-v1` to preserve progress on the same browser/profile.
- Preserved the existing core sections and behavior: Dashboard, Planner, Calendar, One-Shots, Revision, Settings; one entry per calendar day including Sundays; completion, notes, backup, revision cycles, and optional isolated cloud sync.

## Validation completed

- `node --check app.js` and `node --check server.js` passed.
- All six sections rendered non-empty HTML in the test harness.
- 54 entries are in sequential order and retain `id`, chapter name, `videoId`, full URL, and short URL.
- No per-entry `title` fields remain in `one-shots.json`.
- Known original video-title strings do not occur in the shipped `app.js`, `index.html`, or `one-shots.json`.
- One-entry-per-calendar-day mapping passed.
- Mark-complete flow, all five revision cycles, legacy time-setting cleanup, and local persistence passed.
- Final ZIP integrity was verified after packaging.

## Scope / limits

- No tests, rest days, video-duration data/settings, playback-speed controls, or embedded player.
- The APK is not precompiled; its build workflow is included.


## APK workflow fix (3.1.2)
The GitHub Actions workflow no longer calls `node scripts/prepare-mobile.js`. It verifies the required root files and copies `index.html`, `app.js`, and `one-shots.json` into `www/` inline. This directly addresses GitHub Actions failing with `MODULE_NOT_FOUND` for `scripts/prepare-mobile.js`. APK compilation still occurs in GitHub Actions and is not claimed as locally verified.

## APK workflow dependency fix (3.1.4)

- Updated GitHub Actions to explicitly install `@capacitor/core`, `@capacitor/cli`, and `@capacitor/android` v8 before dependency resolution. This addresses the observed `Cannot find module '@capacitor/android'` error even if the repository's committed package manifest is incomplete.
- APK build remains delegated to GitHub Actions; no compiled APK is included.
