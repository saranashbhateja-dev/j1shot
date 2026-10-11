# Jee OneShot OS 3.1.4

A JEE one-shot tracker based on one YouTube playlist containing 54 ordered entries. The interface shows only your chapter/topic names, never the actual YouTube video titles.

## Included

- Dashboard with overall completion, today's assigned one-shot, expected finish, and revision reminders.
- One-Shot Tracker with the 54 chapter/topic names in your exact order, links, completion status, search, and personal notes.
- Daily Planner assigns exactly one entry every calendar day, including Sundays. No rest days and no splitting entries.
- Calendar showing daily assignments, completed entries, and revision due dates.
- Revision queue scheduled for 1, 3, 7, 14, and 30 days after a one-shot is marked complete.
- Local progress saving, JSON backup export/import, and optional Supabase sync using the dedicated `jeeo_one_shot_state` table.
- Android/Capacitor build workflow for a debug APK.

## Playlist

- Playlist: https://www.youtube.com/playlist?list=PLe2OLDq3OCGA
- Entries: 54, in the user-provided order.
- Video IDs and URLs are retained to open the correct one-shot; raw video titles are not included in the app data or shown in the interface.
- Watch buttons open YouTube externally; no embedded player.
- No video duration display, playback-speed setting, daily-hour target, or test system.

## Run on Windows

1. Install Node.js 22 or newer.
2. Extract the ZIP to a writable folder.
3. Double-click `start.bat`.
4. Jee OneShot OS opens at `http://127.0.0.1:3001`.

Node.js is used for the local web server so the app can load `one-shots.json`.

## Save and backup

Progress is saved locally in this browser under `jee-os-one-shot-v1`. Use Settings → Export backup or Import backup to move or restore progress. The local storage key remains unchanged so an update in the same browser preserves your existing one-shot progress.

## Optional Supabase sync

Local saving works without Supabase. Run `SUPABASE-SETUP.sql` in the Supabase SQL editor if setting up cloud sync from scratch, then sign in in Settings. The app stores one JSON state row per user in `public.jeeo_one_shot_state` and does not change the old lecture OS tables.

## Android APK

Run `android-build.bat` on Windows with Java/Android SDK configured, or push the project and use the **Build Jee OneShot OS APK** GitHub Actions workflow. The workflow now prepares the mobile web assets directly in YAML, so it does not depend on `scripts/prepare-mobile.js` being present in the GitHub repository. The APK is not precompiled in this ZIP.

## Scope

One playlist only. One scheduled one-shot per calendar day, including Sundays. Revision is included. There are no tests, rest days, duration/time controls, video-title labels, or embedded player.

APK build fix (3.1.4): GitHub Actions now clean-installs Capacitor Core, CLI, and Android platform explicitly, verifies all three modules before generating the Android project, then uploads the debug APK as an Actions artifact.
