# Smart Home Hub — v2

A **HomeKit-grade smart home hub** that discovers, monitors, pairs, and controls
devices across multiple local protocols (Zigbee, Matter, Wi-Fi/MQTT, Z-Wave).
Operates **fully offline** and ships as a standalone web app and as a Homebridge
plugin.

See `.dyad/plans/chat-33-plan.md` for the full 7-phase plan.

## Core Architectural Decisions

- **DeviceAdapter contract** is the single most important abstraction. A new
  protocol ships in one PR without touching the core.
- **Core domain services** (`DeviceRegistry`, `RoomService`, `EventBus`) live in
  `src/core/` and are shared between the Express backend and consumed by the
  React frontend via the API.
- **better-sqlite3** for persistence (sync, single-file, no daemon). Falls back
  to an in-memory `Map`-backed store when the native binding is unavailable
  (sandbox, browser tests).
- **Zod** for runtime validation at every API boundary.
- **Zustand** for client state with `localStorage` hydration.
- **Adapter fault isolation** — one crashing adapter never takes down others.
- **HomeKit-style UX** — room-based, tile grid, large hit targets, accessible.

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS.
- **Backend:** Node.js + Express + TypeScript.
- **Persistence:** better-sqlite3 (with in-memory fallback).
- **Validation:** Zod.
- **Client state:** Zustand.
- **Tests:** Vitest.

## Repository Layout

```
.
├── packages/
│   ├── backend/            # Express server
│   │   └── src/
│   │       ├── core/       # Domain (adapter, registry, event-bus, persistence)
│   │       ├── adapters/   # mock, zigbee, matter, mqtt, zwave
│   │       ├── routes/     # /api/devices, /api/rooms, /api/adapters, /api/health
│   │       └── index.ts
│   ├── frontend/           # Vite + React SPA
│   │   └── src/
│   │       ├── components/ # UI (HomeKit-style cards, room grid, wizard)
│   │       ├── pages/      # Routes
│   │       ├── stores/     # Zustand stores
│   │       └── App.tsx
│   └── shared/             # Cross-package TypeScript types
├── scripts/
│   └── dev.js              # Concurrent backend + frontend
├── src/                    # Top-level utility sources (logger, etc.)
├── test/                   # Cross-cutting tests
└── Overview.md
```

## Running locally

```bash
npm install
npm run build        # builds shared + backend
npm run dev          # starts backend (3001) and frontend (3000) together
```

The Vite dev server proxies `/api/*` to the backend on port 3001.
