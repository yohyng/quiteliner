# Quietliner

## Current Version

Quietliner v4.5.0


Version: v4.4 Zoom / quick sync / right-side favorite UI patch

Quietliner is a minimal, immersive Workflowy-style outliner note app.

This version is designed for Vercel deployment and uses browser `localStorage` as the primary storage. Optional backup / loose sync is available through GAS → Notion DB.

## Features

- Vite + React
- localStorage primary save
- Workflowy-style nested outliner
- Favorite-only sidebar
- Right-top quick Sync button
- Workflowy-style zoom by clicking the row dot
- Favorite sidebar items open that node in zoom view
- Favorite star moved to the right side of each row
- Minimal UI / immersive mode
- Esc or top-edge hover to restore UI
- Font selection: 明朝 / セリフ / サンセリフ / ゴシック
- Light / dark mode
- Background and text color settings
- Editor font-size slider
- Search highlight that remains visible on the active row
- IME-safe Japanese input guard
- Empty-line Backspace delete with previous-row focus
- GAS / Notion Sync
- Ping / Diagnostics / Push / Pull / Smart Sync
- Sync Debug Log
- JSON export / import

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy with Vercel

Import this repository into Vercel.

If this app is placed at the repository root:

```txt
Root Directory = ./
```

If this app is placed inside a `quietliner/` folder:

```txt
Root Directory = quietliner
```

## Data Storage

```txt
localStorage = primary storage
Notion DB     = backup / loose sync
GAS           = bridge between app and Notion API
```

## Notion DB Setup

Create a Notion database with these properties:

```txt
Name       title
Type       select OR multi_select
Version    number
UpdatedAt  date
Device     rich_text
Status     select
```

Share the database with your Notion integration.

The full Quietliner payload is stored as chunked JSON code blocks inside one Notion page named `Quietliner Data`. This is more robust than storing the full JSON in a single rich_text property.

## GAS Setup

1. Create a GAS project.
2. Paste `gas/Code.gs`.
3. Add Script Properties:

```txt
NOTION_TOKEN
NOTION_DATABASE_ID
QUIETLINER_SECRET
```

4. Deploy as Web App.
5. In Quietliner Settings → GAS / Notion Sync, paste:

```txt
GAS Web App URL
Shared Secret
```

`QUIETLINER_SECRET` is not your Notion token. It is a shared password between the Quietliner app and the GAS bridge.

## Shortcuts

```txt
Enter: next item
Shift + Enter: child item
Tab: indent
Shift + Tab: outdent
○: zoom into item
☆: favorite
Esc / top edge hover: show UI
Ctrl / Cmd + K: search
```

## Notes

`node_modules`, `dist`, `.env`, and `.vercel` should not be committed.

This package intentionally does not include `package-lock.json` because the uploaded previous lockfile contained environment-specific internal registry URLs. Run `npm install` locally or let Vercel generate a fresh lockfile.
## v4.2 note

If Debug Log shows `Unknown action: diagnostics`, the deployed Apps Script is older than the app. Paste `gas/Code.gs` from this package into Apps Script and deploy a new Web App version.



## v4.3 note

GAS now detects the Notion database schema and supports `Type` as either `select` or `multi_select`. This avoids the Notion API validation error where a multi-select database property was queried with a select filter.
