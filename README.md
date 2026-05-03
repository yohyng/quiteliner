# Quietliner

Quietliner is a minimal, immersive outliner note app inspired by Workflowy.

This version supports optional GAS → Notion DB sync.

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

## Data Storage

- Primary: browser `localStorage`
- Optional cloud backup/sync: GAS Web App → Notion DB
- Export: JSON download from Settings

## Sync Setup

1. Create a Notion integration.
2. Create a Notion database with these properties:
   - `Name` title
   - `Type` select
   - `Version` number
   - `UpdatedAt` date
   - `Device` rich_text
   - `Status` select
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
