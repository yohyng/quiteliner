# Quietliner

## Current Version

Quietliner v5.0.0

This package is a re-exported v5.0.0 build. The visible app version, `package.json`, `index.html`, `VERSION.txt`, and this README are all aligned to v5.0.0.

Quietliner is a minimal, immersive Workflowy-style outliner note app.

This version is designed for Vercel deployment and uses browser `localStorage` as the primary storage. Optional backup / loose sync is available through GAS → Notion DB.

## v5.0.0 Focus

- Import now defaults to **append** instead of replacing the current outline.
- A Replace mode remains available when you intentionally want to overwrite the current outline.
- Diary imports are appended as `Diary / Date / Body`; if a root `Diary` already exists, new dates are appended under it.
- Blocks that contain longer body text or child body text show a ring around the zoom dot.
- Rows can be moved by dragging the new grip; drop above/below to reorder, or hold Shift / drag farther right to make it a child.
- Breadcrumb labels are shortened when long, while the full label remains available in the tooltip.
- `Shift + Enter` now inserts a line break inside the current block.
- Zoom mode remains Workflowy-like: the zoomed block becomes the editable title and its children appear underneath.
- Favorite sidebar item click zooms into that item.
- Row star remains on the right side.
- The top-right Sync button remains available.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy

Deploy with Vercel by importing this GitHub repository.

If the repository has this shape:

```txt
repo/
  quietliner/
    package.json
    index.html
    src/
  gas/
    Code.gs
```

set Vercel Root Directory to:

```txt
quietliner
```

## Data Storage

- Primary: browser `localStorage`
- Optional cloud backup/sync: GAS Web App → Notion DB
- Export: JSON download from Settings
- Import: JSON file, pasted JSON, or pasted diary text

## Sync Setup

1. Create a Notion integration.
2. Create a Notion database with properties such as `Name`, `Type`, `Version`, `UpdatedAt`, `Device`, and `Status`.
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


## v5.0.0 Updates

- Safe Smart Sync: blocks starter/empty local data from overwriting remote data.
- Smart Sync now pulls when local is empty and remote has data, pushes when remote is empty, and merges when both sides have data.
- Push Backup creates a remote snapshot first when the updated GAS bridge is deployed.
- Force Replace Remote is separated as a dangerous explicit action.
- Removed the subtle selected-row background highlight.
- Added Line Height and Letter Spacing settings.
- Added inline commands: `/today`, `;today`, `/now`, `;now`.
