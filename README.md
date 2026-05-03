# Quietliner

## Current Version

Quietliner v4.7.0

This package is a re-exported v4.7.0 build. The visible app version, `package.json`, `index.html`, and this README are all aligned to v4.7.0 so it is easy to confirm that the deployed app has updated.

Quietliner is a minimal, immersive Workflowy-style outliner note app.

This version is designed for Vercel deployment and uses browser `localStorage` as the primary storage. Optional backup / loose sync is available through GAS → Notion DB.

## v4.7.0 Focus

- Root page title can be renamed directly from the editor title area or Settings → Appearance → Root Title.
- Breadcrumbs now show the full hierarchy path, for example: Root / Diary / Date / Content.
- Breadcrumb ancestor items are clickable and zoom into that level.
- The small editor meta line under the title has been removed to keep the writing area quieter.
- Zoom mode remains Workflowy-like:
  - the zoomed block becomes the editable title at the top;
  - only that block's children appear underneath;
  - pressing Enter on the zoom title creates a child row under that title.
- Favorite sidebar item click zooms into that item.
- Row star is on the right side.
- Right-top Sync button is available outside Settings.
- Row dot button zooms into a block.
- Left-side row grip supports drag selection for multiple rows.

## Features

- Vite + React
- `localStorage` primary save
- Workflowy-style nested outliner
- Favorite-only sidebar
- Immersive UI that can fade away while writing
- Esc / top-edge hover to bring UI back
- Search highlight
- Font selection
  - 明朝
  - セリフ
  - サンセリフ
  - ゴシック
- Light / dark mode
- Background and text color settings
- Editor font-size setting
- JSON export / import
- Optional GAS / Notion sync
- Debug Log for sync actions

## Key Operations

```txt
Enter: next item
Shift + Enter: child item
Tab: indent
Shift + Tab: outdent
○ / row dot: zoom into item
☆: favorite
Esc / top edge: show UI
Ctrl / Cmd + K: search
```

IME composition is guarded so Enter / Tab / Backspace shortcuts do not run while Japanese text is being converted.

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

Import the GitHub repository into Vercel.

If the repository root contains this folder directly:

```txt
quietliner_notion_sync_v4_7/quietliner
```

then set Vercel Root Directory to:

```txt
quietliner_notion_sync_v4_7/quietliner
```

If you copy only the contents of `quietliner/` to the repository root, leave Root Directory blank.

## Data Storage

- Primary: browser `localStorage`
- Optional cloud backup/sync: GAS Web App → Notion DB
- Export: JSON download from Settings

## Sync Setup

1. Create a Notion integration.
2. Create a Notion database with these properties:
   - `Name` title
   - `Type` select or multi_select
   - `Version` number
   - `UpdatedAt` date
   - `Device` rich_text
   - `Status` select / status / multi_select
3. Share the Notion database with the integration.
4. Create a GAS project and paste `gas/Code.gs`.
5. Add Script Properties:
   - `NOTION_TOKEN`
   - `NOTION_DATABASE_ID`
   - `QUIETLINER_SECRET`
6. Deploy GAS as Web App.
7. In Quietliner Settings → GAS / Notion Sync, paste:
   - GAS Web App URL
   - Shared Secret
8. Test in this order:
   - Ping
   - Diagnostics
   - Status
   - Push
   - Pull
   - Smart Sync

## Notion / GAS Notes

The GAS bridge is still labeled v4.3 because the sync bridge was stabilized there. It is compatible with this v4.7.0 frontend.

The bridge automatically adapts when `Type` is `multi_select` instead of `select`, fixing the Notion validation error:

```txt
database property multi_select does not match filter select
```

## Included Files

```txt
quietliner_notion_sync_v4_7/
  quietliner/
    package.json
    index.html
    vite.config.js
    README.md
    .gitignore
    src/
      main.jsx
      App.jsx
      index.css
  gas/
    Code.gs
    README.md
```

`node_modules`, `dist`, `.git`, and `package-lock.json` are intentionally not included.
