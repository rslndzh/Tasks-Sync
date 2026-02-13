# Flowpin

A playful, ruthlessly simple task and time tracker for focused individuals. Gather tasks from Linear, Todoist, Attio, or create them manually — then triage everything into **Today**, **Sooner**, or **Later**. Run focus sessions, track time, and see your day light up as colored blocks on a visual timeline.

## Features

- **Three-bucket triage** — sort tasks into Today, Sooner, or Later. Create custom buckets for projects.
- **Focus sessions** — start a timer on any task. Switch tasks mid-session without losing a second.
- **Calendar rail** — a visual day timeline with colored time blocks. Bucket colors carry through; provider icons show at a glance where each task came from.
- **Integration inbox** — pull tasks from Linear, Todoist, and Attio. Import manually or configure auto-routing rules per team/project.
- **Two-way sync** — complete a task in Flowpin and it's marked done in the source. Complete it in Todoist/Linear/Attio and Flowpin picks it up.
- **Cloud sync (optional)** — create an account to sync across devices via Supabase. Works fully offline without an account.
- **Drag and drop** — reorder tasks, move between buckets, drag inbox items directly where you want them.
- **Rich task notes** — WYSIWYG editor (Tiptap) for task descriptions with markdown support.
- **Dark mode** — automatic theme switching via system preference.
- **Keyboard-first** — every action is reachable from the keyboard.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4, shadcn/ui |
| State | Zustand with persist middleware |
| Local DB | Dexie.js (IndexedDB) — offline-first |
| Remote DB | Supabase (Postgres + Auth + Realtime + RLS) |
| Animation | Motion (Framer Motion) |
| Editor | Tiptap (rich text) |
| Drag & Drop | dnd-kit |
| Icons | Lucide React |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
git clone https://github.com/rslndzh/Tasks-Sync.git
cd Tasks-Sync
npm install
npm run dev
```

The app runs at `http://localhost:5173`. No account or backend needed — it works fully offline using IndexedDB.

### Enable Cloud Sync (Optional)

To sync across devices, set up a [Supabase](https://supabase.com) project:

1. Create a new Supabase project
2. Run the SQL from `scripts/setup-db.sql` in the Supabase SQL editor
3. Apply migrations from `supabase/migrations/` in order (001 → 004)
4. Copy your project URL and anon key into `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Restart the dev server — a "Sign up" option appears in the app

### Build for Production

```bash
npm run build
npm run preview
```

The `dist/` folder is ready to deploy to Vercel, Netlify, or any static host.

## Project Structure

```
src/
├── components/          # UI components (shadcn/ui + custom)
│   ├── ui/              # shadcn/ui primitives
│   ├── icons/           # Provider icons (Linear, Todoist, Attio)
│   └── settings/        # Settings dialog tabs
├── hooks/               # Custom React hooks
├── integrations/        # API clients (Linear, Todoist, Attio)
├── lib/                 # Utilities, Supabase client, Dexie schema, sync engine
├── pages/               # Route-level components
├── stores/              # Zustand state stores
├── types/               # TypeScript type definitions
└── assets/              # Static assets (SVG icons)

supabase/
└── migrations/          # Postgres schema migrations (001–004)

scripts/
└── setup-db.sql         # Full initial database schema
```

## Integrations

| Provider | Auth | Capabilities |
|----------|------|-------------|
| **Linear** | API key (personal token) | Import issues, two-way completion sync, team routing |
| **Todoist** | API token | Import tasks, two-way completion sync, project routing |
| **Attio** | API key | Import tasks, two-way completion sync |

API keys are stored **locally only** in IndexedDB — they never leave your device or transit through Supabase.

## Architecture

**Offline-first**: All mutations write to local Dexie (IndexedDB) first, then sync to Supabase when online. The UI always reads from local state.

**Sync strategy**:
- Outgoing changes flush via a debounced event-driven queue
- Incoming changes arrive via Supabase Realtime subscriptions
- A periodic pull runs every 30s as a consistency safety net
- Manual "Sync now" button for immediate reconciliation

**Data integrity**: UUID fields are sanitized before every Supabase push. Dexie migrations clean up stale local data. Duplicate default buckets from multi-device sync are automatically deduplicated.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | TypeScript type checking |

## License

Private project.
