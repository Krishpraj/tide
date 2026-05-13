# Tide — Linear-style Kanban with Claude Code

## Context

Build a desktop app (`C:\Users\krish\projects\tide`, currently empty) that runs your dev work as a Kanban board where Claude Code does the implementation. The user files tickets, assigns each to a tracked git repo, and the app spawns Claude Code in that repo on a new branch. Tickets flow Backlog → Queued → In Progress → Review → Done. While a ticket is in Review, the user sees the diff and clicks **Merge**, **Change more** (resume the Claude session with new instructions), or **Discard**. Multiple repos run in parallel; tickets within one repo run sequentially. Each ticket in Review opens its own tab so several reviews can be open at once.

Goal: make Claude Code feel like a team of engineers you can task in parallel, with one Kanban board as the cockpit.

## Tech stack (locked)

- **Electrobun** v1.x — TypeScript + Bun runtime, native webview (WebView2 on Windows 11), type-safe RPC between main and webview. Scaffold with `bunx electrobun init`.
- **`@anthropic-ai/claude-agent-sdk`** (TypeScript) for spawning Claude — NOT shelling out to the `claude` CLI. Use `query()` with `cwd` per repo, stream messages, capture `session_id` for resume, register `PostToolUse` hooks to log file edits.
- **`bun:sqlite`** for local DB.
- **`Bun.spawn`** for `git` CLI calls.
- **`diff2html`** for rendering diffs in the webview.
- **Playwright** (`@playwright/test`) as the end-to-end test driver. See "Testing strategy" below — Electrobun's native WebView2 isn't directly drivable, so we run the webview against Chromium in dev/test mode through a small HTTP/WS dev bridge.
- **UI stack (Linear-style)**:
  - **React 19** + **Vite** (bundler for the webview).
  - **Tailwind CSS** v4 + **shadcn/ui** for primitives (Button, Dialog, DropdownMenu, Tabs, Toast, Tooltip, Command (⌘K), ContextMenu, Select, Badge, Card, Resizable). Theme tuned to Linear's palette: dark default, near-black background `#0E0E10`, accent `#5E6AD2`, system font stack with Inter fallback, tight tracking.
  - **lucide-react** for icons.
  - **TipTap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-code-block-lowlight` + `lowlight` for syntax-highlighted code blocks, `@tiptap/extension-mention` for `@repo` and `#ticket` mentions, `@tiptap/extension-typography`) for ticket descriptions and the "Change more" prompt. Ticket bodies are stored as TipTap JSON in `tickets.description` so they round-trip losslessly.
  - **cmdk** (via shadcn's `Command`) for the command palette.
  - **tinykeys** for global keyboard shortcuts (Linear-style: `C` to create ticket, `⌘K` palette, `J`/`K` to navigate cards, `M` merge, `D` discard, `X` cancel, `O` open in editor, `⌘E` change more).
  - **Zustand** for client state.
  - **framer-motion** for tab/panel transitions (kept light — Linear is animation-restrained).
- **Auth**: rely on existing `claude login` or `ANTHROPIC_API_KEY`; banner if missing. No in-app key storage.

## Confirmed decisions

- Per-repo: **sequential queue** (one Claude at a time). Multiple repos in parallel.
- Repo attachment: pick an existing local dir **or** clone from a Git URL into `data\repos\<slug>\`.
- One Claude session per ticket; "Change more" resumes that session.
- **Cancel** is in scope for MVP: stops the running SDK turn via `AbortController`, ticket lands in Review with whatever was done.
- **Open in editor** ("Code" button) is in scope: launches the user's editor (VS Code, Cursor, Windsurf, JetBrains, custom) checked out to the ticket's branch so they can hand-edit.

## Linear-style feature set (cross-cutting)

These features layer onto the core flow above. Each is mapped to the phase that lands it.

| Feature | What it is | Lands in |
|---|---|---|
| **Projects** | Top-level grouping of repos (Personal / Work / OSS). Sidebar shows the project switcher; repos are nested under a project. | Phase 4 |
| **Priority** | Urgent / High / Medium / Low / None with colored lucide icons. Queue dequeues highest priority first; ties broken by creation time. | Phases 2, 5, 7 |
| **Labels** | Per-project label set (e.g. `bug`, `feature`, `refactor`, `tests`). Multi-select on tickets; rendered as small pills on cards. | Phases 2, 5 |
| **Estimate** | T-shirt size (XS, S, M, L, XL). Drives the Agent SDK `maxTurns` budget per ticket so big tickets get more room. | Phases 2, 5, 7 |
| **Sub-tickets** | Tickets can have a parent; parent shows a progress bar based on children's statuses. Useful to break a big change into agent-sized chunks. | Phases 2, 5 |
| **Linked tickets** | "blocks", "blocked by", "duplicates", "relates to". The worker refuses to dequeue a `blocked by` ticket until blockers reach `done`. | Phases 2, 5, 7 |
| **Triage inbox** | Newly created tickets default to `status='triage'` (above Backlog in the board). User reviews, sets priority/repo/labels, then sends to Backlog with `B`. | Phases 2, 5 |
| **Ticket templates** | "Fix bug", "Add feature", "Write tests", "Refactor module"; pre-fills the TipTap editor. Stored per project; user-editable. | Phase 5 |
| **Group / Sort / Filter** | Board header has shadcn `Select` dropdowns: Group by (status / priority / repo / label), Sort by (priority, created, updated, estimate), Filter pills (status, priority, repo, label, has-diff). | Phase 5 |
| **Saved views** | Persist a Group+Sort+Filter combo with a name; switch via command palette. | Phase 5 |
| **Bulk actions** | Shift-click to multi-select cards; floating action bar at the bottom: Assign repo, Set priority, Add label, Delete. | Phase 5 |
| **Right-click context menu** | shadcn `ContextMenu` on every card: change status, set priority, change repo, copy branch name, copy link, duplicate, delete. | Phase 5 |
| **Inline edits** | Click ticket title to edit in place (single-line TipTap or plain `Input`). Same for repo names and labels. | Phase 5 |
| **Hovercards** | shadcn `HoverCard` on `@repo` and `#ticket` mentions, plus on ticket IDs in the activity feed — shows summary, status, recent activity. | Phase 5 |
| **Activity feed** | A scrollable timeline of `ticket_events` accessible from the ticket detail dialog and review tab. Filters by event kind. | Phases 5, 8 |
| **Notifications inbox** | Bell icon in the titlebar with unread badge. Triggers: ticket completed, hit review, failed, was canceled, blocker resolved. Click to jump to ticket. | Phase 8 |
| **Comments / Notes** | Free-form user notes on a ticket (TipTap). Stored in `ticket_comments`. Useful to leave a note for "future you" or annotate why a ticket was discarded. | Phase 8 |
| **Snooze** | Push a ticket out of the active board for N hours/days; reappears in Triage on wake. | Phase 9 |
| **My issues / Focus view** | A view that shows only the tickets currently `in_progress` or `review` across all repos — the "what's happening right now" page. | Phase 5 |
| **Quick switcher** | ⌘P fuzzy-jump to any ticket by title (separate from ⌘K command palette). | Phase 5 |
| **Theme toggle** | Dark default, light option, system. Available via command palette and Settings. | Phase 5 |
| **Status emojis / icons** | Each status has a lucide icon matching Linear (`Circle` backlog, `CircleDashed` queued, `CircleDot` in-progress, `CircleCheck` review, `CheckCircle2` done, `XCircle` discarded, `Ban` canceled, `AlertCircle` failed). | Phase 5 |
| **Custom titlebar / breadcrumb** | Electrobun custom titlebar shows `<Project> / <Repo> / <Ticket>` breadcrumb. | Phase 5 |
| **Empty states** | Each column and view has a designed empty state with the relevant hotkey hint ("Press C to create your first ticket"). | Phase 5 |

## Testing strategy

Electrobun ships a native webview (WebView2 on Windows), which is **not** directly drivable by Playwright. To keep Playwright in the loop we use a dual-target build:

- **Prod target (`bunx electrobun dev` / `build`)**: webview loads via `views://mainview/index.html`, talks to main over the Electrobun typed RPC bridge.
- **Test target (`bun run dev:web`)**: same webview bundle served at `http://localhost:5733`. A tiny `src/main/devbridge.ts` Bun HTTP/WS server exposes the same RPC contract on `/rpc` (request/response) and `/events` (server-sent events / ws). The webview's `rpc.ts` detects environment and routes to the Electrobun bridge or the dev bridge accordingly.

This means Playwright drives a real Chromium against the real UI bundle calling the real Bun backend — only the transport differs. Production behavior is then sanity-checked by a packaged-app smoke test in Phase 10.

Other test layers per phase:
- **Unit** (Bun's built-in `bun test`) for pure modules (git ops, DAOs, slug helpers, queue logic).
- **Integration** for the worker pipeline using a stubbed Claude runner that emits scripted messages and creates known file edits in a temporary git repo.
- **Playwright e2e** for UI-driven flows, asserting on rendered DOM and the backend's resulting DB state.

## Project layout

```
C:\Users\krish\projects\tide\
├── package.json                    # see deps below
├── electrobun.config.ts            # build config, entry, window size
├── playwright.config.ts            # test target = http://localhost:5733
├── tsconfig.json
├── vite.config.ts                  # webview bundler (React + Tailwind)
├── tailwind.config.ts              # tokens tuned to Linear palette
├── postcss.config.js
├── components.json                 # shadcn CLI config
├── .env.example                    # ANTHROPIC_API_KEY, TIDE_DATA_DIR
├── src\
│   ├── main\
│   │   ├── index.ts                # boot: init DB, restore workers, register RPC, open window
│   │   ├── devbridge.ts            # HTTP/WS bridge for Playwright + browser dev
│   │   ├── db\
│   │   │   ├── schema.sql
│   │   │   ├── client.ts           # bun:sqlite singleton + migration runner
│   │   │   └── repos.ts            # ticketsDao, reposDao, eventsDao, sessionsDao
│   │   ├── queue\
│   │   │   ├── RepoWorker.ts
│   │   │   └── WorkerPool.ts
│   │   ├── claude\
│   │   │   ├── runner.ts           # Agent SDK wrapper, streaming, session capture
│   │   │   └── stubRunner.ts       # deterministic stub used in tests
│   │   ├── git\
│   │   │   └── ops.ts              # checkoutBase, createBranch, commitAll, diff, merge, deleteBranch, clone
│   │   ├── editor\
│   │   │   ├── detect.ts           # detect VS Code/Cursor/Windsurf/JetBrains/Sublime/Neovim on PATH
│   │   │   └── launch.ts           # openInEditor: ensure branch checked out, spawn editor
│   │   ├── rpc\
│   │   │   ├── handlers.ts
│   │   │   └── events.ts
│   │   └── auth\
│   │       └── check.ts
│   ├── shared\
│   │   └── types.ts                # RPC contract + domain types
│   └── webview\
│       ├── index.html
│       ├── main.tsx                 # React root, theme provider, hotkeys
│       ├── rpc.ts                   # auto-detects Electrobun vs dev HTTP bridge
│       ├── store.ts                 # Zustand store
│       ├── styles\
│       │   └── globals.css          # Tailwind base + Linear-tuned tokens
│       ├── lib\
│       │   ├── utils.ts             # cn() helper (clsx + tailwind-merge), shadcn-standard
│       │   ├── hotkeys.ts           # tinykeys bindings (C, ⌘K, J/K, M, D, X, O, ⌘E)
│       │   └── tiptap.ts            # shared TipTap config (extensions, theme, output JSON)
│       └── components\
│           ├── ui\                  # shadcn-generated primitives (button, dialog, dropdown, command, tabs, …)
│           ├── editor\
│           │   ├── TicketEditor.tsx # TipTap-backed rich editor (description + change-more prompt)
│           │   └── TicketRenderer.tsx # readonly TipTap renderer for cards/tabs
│           ├── Sidebar.tsx
│           ├── Board.tsx
│           ├── TicketCard.tsx
│           ├── TopTabs.tsx
│           ├── ReviewPanel.tsx
│           ├── CommandPalette.tsx   # ⌘K — switch board, jump to ticket, create, merge, cancel
│           └── AuthBanner.tsx
├── tests\
│   ├── unit\                       # bun test
│   ├── integration\                # bun test, uses stubRunner + temp repos
│   └── e2e\                        # @playwright/test
│       ├── fixtures\
│       │   ├── tideApp.ts          # spins up bun main + dev bridge, yields page
│       │   └── tempRepo.ts         # creates a throwaway git repo per test
│       └── phase-XX-*.spec.ts      # one spec file per phase below
└── data\                           # runtime, gitignored
    ├── tide.db
    └── repos\<slug>\
```

---

## Phase 1 — Scaffold & Foundation

**Goal**: a window opens; Playwright can drive the webview bundle in Chromium.

**Build**
- `bunx electrobun init` in `C:\Users\krish\projects\tide`. Pin the Electrobun version that scaffolds with Windows target support.
- Add core deps: `react`, `react-dom`, `zustand`, `clsx`, `tailwind-merge`, `lucide-react`, `tinykeys`, `framer-motion`, `cmdk`, `ulid`, `diff2html`, `@anthropic-ai/claude-agent-sdk`.
- Add TipTap: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-code-block-lowlight`, `@tiptap/extension-mention`, `@tiptap/extension-typography`, `lowlight`.
- Add dev deps: `@playwright/test`, `vite`, `@vitejs/plugin-react`, `tailwindcss` v4, `@tailwindcss/vite`, `postcss`, `autoprefixer`, `typescript`.
- Install shadcn: `bunx shadcn@latest init` (pick: TypeScript, Tailwind v4, `src/webview/components/ui` directory, RSC: no, slate base, CSS variables: yes, dark default). Then `bunx shadcn@latest add button dialog dropdown-menu tabs toast tooltip command context-menu select badge card resizable separator scroll-area textarea input switch sonner`.
- Set up `tsconfig.json`, `electrobun.config.ts`, `playwright.config.ts`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `components.json`.
- Tune `src/webview/styles/globals.css` to Linear-ish tokens: `--background: 240 6% 6%`, `--foreground: 0 0% 96%`, `--accent: 234 56% 60%`, `--radius: 6px`; Inter font import; tight `letter-spacing`.
- Create `src/main/index.ts` that just opens a 1400×900 window pointing at `src/webview/index.html`.
- Create `src/main/devbridge.ts` skeleton (HTTP server on 5733, serves the Vite-built webview, exposes `/health`).
- Create `src/webview/index.html` + `main.tsx` rendering "Tide" + version + "RPC: ok" once `/health` returns 200, wrapped in the shadcn dark theme.
- Add `package.json` scripts: `dev` (Electrobun), `dev:web` (devbridge + Vite), `build:webview` (Vite), `build` (Electrobun build), `test:unit`, `test:e2e`.

**Skills / Claude Code tools to lean on**
- `init` — generate the initial `CLAUDE.md` after the layout exists.
- `update-config` — to allow `bunx electrobun`, `bun`, `git` commands in `.claude/settings.json` without prompts.
- `fewer-permission-prompts` — after a couple sessions to scrub frequent prompts.

**Playwright test (`tests/e2e/phase-01-scaffold.spec.ts`)**
- Spawns `bun run dev:web`; waits for `/health`.
- `await page.goto('http://localhost:5733')`.
- `await expect(page.getByText(/Tide/i)).toBeVisible();`
- `await expect(page.getByText('RPC: ok')).toBeVisible();`
- Also manually: `bunx electrobun dev` opens a native window with the same text — captured as a screenshot artifact.

---

## Phase 2 — Database & Domain Types

**Goal**: SQLite schema applied on boot; DAOs round-trip every entity.

**Build**
- `src/main/db/schema.sql` with the four tables (`repos`, `tickets`, `claude_sessions`, `ticket_events`) and indexes (see "Schema" section below).
- `src/main/db/client.ts`: open `data/tide.db`, run `PRAGMA journal_mode = WAL`, apply schema if `schema_version` row missing.
- `src/main/db/repos.ts`: typed DAOs with prepared statements (`insertTicket`, `listByStatus`, `updateStatus`, etc.).
- `src/shared/types.ts`: `Repo`, `Ticket`, `TicketStatus` enum, `ClaudeSession`, `TicketEvent` types — shared between main and webview.

**Schema**
```sql
CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#5E6AD2',
  position     INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE repos (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  path         TEXT NOT NULL UNIQUE,
  origin_url   TEXT,
  base_branch  TEXT NOT NULL DEFAULT 'main',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE tickets (
  id              TEXT PRIMARY KEY,
  repo_id         TEXT REFERENCES repos(id) ON DELETE SET NULL,
  parent_id       TEXT REFERENCES tickets(id) ON DELETE SET NULL,   -- sub-ticket
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,                                    -- TipTap JSON (stringified)
  description_md  TEXT NOT NULL DEFAULT '',                         -- derived plaintext/markdown sent to Claude
  status          TEXT NOT NULL CHECK (status IN
                   ('triage','backlog','queued','in_progress','review','done','discarded','failed','canceled','snoozed')),
  priority        INTEGER NOT NULL DEFAULT 0,                       -- 0=none,1=low,2=medium,3=high,4=urgent
  estimate        TEXT,                                             -- 'XS'|'S'|'M'|'L'|'XL' or null
  branch_name     TEXT,
  base_branch     TEXT,
  position        INTEGER NOT NULL,
  snooze_until    INTEGER,                                          -- epoch ms; reappears in triage after
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_tickets_repo_status     ON tickets(repo_id, status, position);
CREATE INDEX idx_tickets_status_priority ON tickets(status, priority DESC, created_at);
CREATE INDEX idx_tickets_parent          ON tickets(parent_id);

CREATE TABLE labels (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL,                                       -- hex
  UNIQUE(project_id, name)
);
CREATE TABLE ticket_labels (
  ticket_id    TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  label_id     TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, label_id)
);

CREATE TABLE ticket_links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_ticket  TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  to_ticket    TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('blocks','blocked_by','duplicates','relates_to')),
  UNIQUE (from_ticket, to_ticket, kind)
);
CREATE INDEX idx_links_to ON ticket_links(to_ticket, kind);

CREATE TABLE ticket_templates (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  icon         TEXT,                                                -- lucide name
  title_prefix TEXT NOT NULL DEFAULT '',
  body_json    TEXT NOT NULL,                                       -- TipTap JSON skeleton
  position     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ticket_comments (
  id           TEXT PRIMARY KEY,
  ticket_id    TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,                                       -- TipTap JSON
  body_md      TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id, created_at);

CREATE TABLE notifications (
  id           TEXT PRIMARY KEY,
  ticket_id    TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                                       -- 'review_ready'|'failed'|'canceled'|'merged'|'unblocked'|...
  title        TEXT NOT NULL,
  body         TEXT,
  read_at      INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_notifications_unread ON notifications(read_at, created_at DESC);

CREATE TABLE saved_views (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  group_by     TEXT,                                                -- 'status'|'priority'|'repo'|'label'
  sort_by      TEXT,                                                -- 'priority'|'created'|'updated'|'estimate'
  filters_json TEXT NOT NULL DEFAULT '{}',
  position     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE app_settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL                                        -- JSON
);
CREATE TABLE claude_sessions (
  id             TEXT PRIMARY KEY,
  ticket_id      TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sdk_session_id TEXT,
  status         TEXT NOT NULL CHECK (status IN ('running','completed','errored','interrupted','canceled')),
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  error          TEXT
);
CREATE INDEX idx_sessions_ticket ON claude_sessions(ticket_id);
CREATE TABLE ticket_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id    TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  ts           INTEGER NOT NULL,
  kind         TEXT NOT NULL,
  payload      TEXT NOT NULL
);
CREATE INDEX idx_events_ticket_ts ON ticket_events(ticket_id, ts);
```

**Skills / Claude Code tools**
- `simplify` — run on `db/repos.ts` once the DAOs exist to flatten any over-abstraction.

**Tests**
- **Unit** (`tests/unit/db.test.ts`): create temp dir, init DB, insert a repo + ticket, list, update status, assert row counts and FK cascade for `ticket_events`.
- **Playwright** (`tests/e2e/phase-02-db.spec.ts`): the webview exposes a hidden debug panel under `?debug=1` showing `db.schemaVersion`. Test asserts it's `>= 1`. Keeps the e2e habit going even though there's no real UI yet.

---

## Phase 3 — RPC Bridge & Auth Banner

**Goal**: webview can call typed RPC methods; auth status surfaces.

**Build**
- `src/shared/types.ts`: define `RpcMethods` and `RpcEvents` discriminated types.
- `src/main/rpc/handlers.ts`: register one real method `getAuthStatus()` and one event-emitting method `ping()`.
- `src/main/rpc/events.ts`: `emit(name, payload)` helper (works in both Electrobun and dev-bridge modes).
- `src/main/auth/check.ts`: returns `{ok: true}` if `ANTHROPIC_API_KEY` is set OR `~/.claude/credentials.json` is present and readable; otherwise `{ok: false, reason: 'no-credentials'}`.
- `src/webview/rpc.ts`: auto-detect — if `window.electrobun` exists use the native bridge, else use the dev-bridge WebSocket.
- `src/webview/components/AuthBanner.tsx`: red banner with instructions when `ok === false`.

**Skills / Claude Code tools**
- `claude-api` — to make sure SDK installation and key detection match current docs.

**Tests**
- **Unit**: `auth/check.ts` against fake HOME directories.
- **Playwright** (`tests/e2e/phase-03-auth.spec.ts`):
  - Launch dev bridge with `ANTHROPIC_API_KEY=` empty and a sandbox HOME → `await expect(page.getByRole('banner', {name: /not authenticated/i})).toBeVisible();`
  - Restart with `ANTHROPIC_API_KEY=test` → banner gone.
  - Test the RPC roundtrip: `await page.evaluate(() => window.__rpc.getAuthStatus())` returns the expected shape.

---

## Phase 4 — Projects, Repos, Labels

**Goal**: attach repos under a project; manage labels per project; sidebar reflects the hierarchy.

**Build**
- Auto-seed a `"Default"` project on first boot if `projects` is empty (so users don't have to set one up).
- `src/main/git/ops.ts` (initial subset): `cloneRepo(url, dest)`, `detectBaseBranch(path)` (`git symbolic-ref refs/remotes/origin/HEAD`), `isGitRepo(path)`. All via `Bun.spawn` with `stdout: 'pipe'`.
- `handlers.ts`: `listProjects`, `createProject`, `renameProject`, `deleteProject`, `listRepos({projectId?})`, `addRepoLocal({path, projectId})` (validates `isGitRepo`), `addRepoClone({url, name, projectId})` (clones into `data/repos/<slug>/`), `moveRepoToProject({repoId, projectId})`, `listLabels({projectId})`, `createLabel({projectId, name, color})`, `deleteLabel({labelId})`.
- `src/webview/components/Sidebar.tsx`:
  - Top: **Project switcher** (shadcn `DropdownMenu`) showing the current project's name + color dot; menu lists all projects with "+ New project" at the bottom.
  - Body: repos in the current project, with busy dot + queue count; drag to reorder; right-click for "Move to project / Rename / Remove from Tide".
  - Bottom: **Settings** cog + **Notifications** bell.
- **Add Repo** modal: shadcn `Dialog` with two `Tabs` (Local Path / Git URL); project preselected to current.
- **Labels manager**: opened from Settings or the command palette; shadcn `Dialog` with a list of `Badge`s in label color, plus rename/delete/color-pick.

**Skills / Claude Code tools**
- `frontend-design` — for the Add Repo modal to keep it from looking generic.

**Tests**
- **Unit**: `git/ops.ts#isGitRepo` and `detectBaseBranch` against a tmp repo; project/label CRUD with cascade checks.
- **Integration**: `addRepoClone` against `https://github.com/octocat/Hello-World.git` (network-gated test, can be skipped with `TIDE_SKIP_NETWORK`).
- **Playwright** (`tests/e2e/phase-04-repos.spec.ts`):
  - Open app → assert "Default" project exists in switcher.
  - Create a new project "Work" → switcher updates → empty repo list.
  - Pre-seed a tmp git repo at `data/test-repos/alpha` → "Add Repo" → Local Path tab → submit under "Work" → "alpha" appears in the Work sidebar; switching back to "Default" hides it.
  - "Add Repo" → Git URL tab → paste an already-cloned fixture URL → second repo appears.
  - Create a label "bug" with red color under Work → assert it appears in the Labels manager and is selectable when creating a ticket.
  - Refresh page → projects, repos, and labels persist.

---

## Phase 5 — Ticket UX, Linear-style features, Kanban Board, Editor, Command Palette

**Goal**: a Linear-grade ticket experience: rich editor, priority/labels/estimates, sub-tickets, links, triage inbox, templates, group/sort/filter, saved views, bulk actions, context menus, inline edits, hovercards, command palette, quick switcher, status icons, custom titlebar.

**Build — backend (`handlers.ts`)**
- Ticket CRUD: `createTicket`, `listTickets({view?})`, `updateTicket(patch)`, `assignTicket`, `setPriority`, `setEstimate`, `setLabels`, `setStatus`, `bulkUpdate({ticketIds, patch})`, `deleteTicket`, `duplicateTicket`.
- Hierarchy/links: `setParent({ticketId, parentId})`, `addLink({fromTicketId, toTicketId, kind})`, `removeLink(linkId)`, `getLinks(ticketId)`.
- Triage/snooze: `sendToBacklog(ticketIds)`, `snoozeTicket({ticketId, untilMs})`.
- Templates: `listTemplates({projectId})`, `createTemplate`, `applyTemplate({ticketId, templateId})`.
- Comments: `listComments(ticketId)`, `addComment({ticketId, body})`, `editComment`, `deleteComment`.
- Views: `listSavedViews`, `saveView`, `deleteView`.
- Settings: `getSettings`, `updateSettings(patch)` — theme, preferred editor, default priority, custom editor command.

**Build — editor (`src/webview/components/editor/`)**
- `tiptap.ts`: extensions `StarterKit`, `Placeholder`, `CodeBlockLowlight` (with `lowlight` + grammars for ts/js/py/go/rust/sql/sh), `Mention` configured twice — once for `@repo` (suggestion from `listRepos`), once for `#ticket` (suggestion from `listTickets`). `Typography`. Custom `SlashCommand` extension that opens a shadcn `Command` popover at the caret with: Heading 1/2/3, Bullet/Numbered/Task list, Code block, Quote, Divider, Insert template.
- `TicketEditor.tsx`: full editor for the ticket detail dialog, also used inline in Backlog and for "Change more". Side rail with shadcn controls:
  - **Priority** picker (custom shadcn `Select` showing lucide `AlertCircle` red/orange/yellow/blue/grey icons).
  - **Estimate** picker (`Select`: XS/S/M/L/XL).
  - **Labels** multi-select (shadcn `Command` inside `Popover`).
  - **Repo** picker.
  - **Parent ticket** picker (search by title).
  - **Linked tickets** editor (add by kind, search by title).
- `TicketRenderer.tsx`: readonly TipTap view used in cards (truncated) and the review transcript.
- `InlineTitleEditor.tsx`: tiny TipTap (single-line, no marks) for click-to-edit titles on cards and the detail header.

**Build — board & navigation**
- `Board.tsx`: columns built from shadcn `Card` + `ScrollArea`; HTML5 drag-and-drop. Column headers use lucide status icons (`Circle`, `CircleDashed`, `CircleDot`, `CircleCheck`, `CheckCircle2`, `XCircle`, `Ban`, `AlertCircle`) and a count `Badge`. Drop-targets accept multi-select drags. Empty-state hint per column.
- **Triage column** is the first column, only visible when there's at least one `triage` ticket OR the user pinned it; otherwise hidden behind a "Triage (N)" pill at the top.
- `BoardToolbar.tsx`: shadcn `Select`s for **Group by** (Status / Priority / Repo / Label / None) and **Sort by** (Priority desc, Created, Updated, Estimate). Filter pills: Status, Priority, Repo, Label, Has-Diff, Mine. "+ Save view" persists current configuration.
- `TicketCard.tsx`: status icon, priority icon, title (`InlineTitleEditor` on click), preview line, label pills, repo `Badge`, estimate badge, sub-ticket progress bar (when applicable), shadcn `ContextMenu` for right-click (Change status, Set priority, Change repo, Set labels, Copy branch name, Copy link, Duplicate, Snooze, Delete).
- `BulkActionBar.tsx`: floating footer shown when ≥2 cards selected (shift-click): Assign repo, Set priority, Add label, Snooze, Delete, Send to Backlog (only for triage).
- `Hovercard.tsx`: shadcn `HoverCard` on `@repo`/`#ticket` mentions and on `tide/...` branch names in the transcript — shows title, status, recent activity, jump button.
- `FocusView.tsx`: a special "My in-flight" view (route `/focus`) showing only `in_progress` + `review` tickets across all repos, grouped by repo. Accessed via command palette ("Focus mode") or hotkey `F`.
- `ActivityFeed.tsx`: timeline rendering of `ticket_events` with filters (claude_message, tool_use, git, status_change, error, canceled). Used inside the ticket detail dialog and the review tab's "Activity" sub-tab.

**Build — command palette & shortcuts**
- `CommandPalette.tsx`: shadcn `Command` (cmdk) bound to ⌘K. Groups:
  - **Tickets**: "New ticket (C)", "Jump to ticket…", "My in-flight (F)".
  - **Repos**: "Switch to <repo>", "Add repo", "Open repo in editor".
  - **Project**: "Switch project", "New project".
  - **Actions on current ticket**: "Merge", "Cancel", "Change more", "Discard", "Open in editor".
  - **Saved views**: shown under "Views" with their names.
  - **App**: "Settings", "Toggle theme", "Show keyboard shortcuts".
- `QuickSwitcher.tsx`: ⌘P fuzzy jump to any ticket by title (uses cmdk in modal form, separate from the main palette).
- `hotkeys.ts` (tinykeys, registered globally):
  - `C` → new ticket
  - `⌘K` → command palette · `⌘P` → quick switcher
  - `J` / `K` → next/prev card · `Enter` → open detail
  - `M` → merge focused review ticket · `D` → discard · `X` → cancel · `O` → open in editor · `⌘E` → change more
  - `B` → send focused triage ticket to backlog · `1-5` → set priority 0-4 · `L` → focus label selector
  - `F` → toggle focus view · `T` → toggle theme · `?` → shortcuts cheatsheet (shadcn `Dialog`)
- `store.ts`: Zustand slices for `tickets`, `repos`, `projects`, `labels`, `selection`, `view`, `theme`, `notifications`. Subscribes to all `*Updated` events.

**Build — titlebar & misc**
- Custom titlebar in `main.tsx`: project color dot · project name · `/` · repo name · `/` · current ticket title (when one is focused/open). Right side: notifications bell, theme toggle, settings cog.
- `NotificationCenter.tsx`: shadcn `Popover` triggered by the bell; lists unread first; click jumps to ticket. (Backed by Phase 8's writes; the UI shell lands here.)
- `EmptyState.tsx`: shared component used by every list/column when empty, with hotkey hint and lucide icon.
- `Settings.tsx`: shadcn `Dialog` with Tabs: General (theme, default priority, default project), Editor (detected editors list, custom command), Labels (per project), Shortcuts (read-only cheatsheet).

**Skills / Claude Code tools**
- `frontend-design` — at least two passes: one after the board lands, one after the command palette + hovercards land, to push toward Linear-grade density and restraint.
- `update-config` — add a hook firing `bun lint` and `bunx playwright test --grep @phase-5` on save, so the Linear-feel doesn't regress.

**Tests**
- **Unit**:
  - `editorToMarkdown` round-trip; `SlashCommand` extension state machine; `Mention` suggestion query.
  - `bulkUpdate` atomicity (all-or-nothing).
  - `ticket_links` invariants: blocking cycles rejected.
  - `saved_views` JSON validation.
- **Playwright** (`tests/e2e/phase-05-board.spec.ts`):
  - Press `C` → TicketEditor focuses (`.ProseMirror` focused).
  - Type "Wire up settings page", press `/` → slash menu opens; pick "Bullet list" → bullet appears.
  - Set Priority = High via the side rail → priority icon turns orange on the card.
  - Add label "feature" → pill appears on the card.
  - Open ticket detail dialog → set Parent to an existing ticket → assert sub-ticket appears under parent's expanded view with progress bar updating as child status changes (simulate via debug RPC).
  - Add a `blocked_by` link to a not-yet-done ticket → assert the card shows a lock icon and ⌘K shows it as "Blocked".
  - Triage inbox: a newly created ticket lands in Triage; press `B` → moves to Backlog.
  - Apply template "Fix bug" → editor pre-fills with the template body.
  - Group by Priority → 5 priority groups appear instead of status columns.
  - Sort by Created desc, then change to Priority desc → card order updates.
  - Filter chip "Status: Review" → only review cards visible.
  - Save view "My reviews" → ⌘K shows it under Views → switching loads the filter.
  - Shift-click three cards → BulkActionBar appears → Set priority Medium → all three update.
  - Right-click a card → context menu → "Copy branch name" → assert clipboard contents.
  - Press ⌘P → quick switcher opens → fuzzy "wire" matches the ticket → Enter opens detail.
  - Press `F` → Focus view shows only in-flight tickets.
  - Press `?` → shortcuts cheatsheet opens; press `Esc` → closes.
  - Hover `@alpha` mention in a description → HoverCard shows repo summary.
  - Theme: press `T` → `<html>` class toggles dark↔light → diff2html palette swaps.
  - Reload — saved views, view selection, theme persist.

**Skills / Claude Code tools**
- `frontend-design` — pass on the Board layout once functional; target Linear-style density (smaller cards than default shadcn, monochrome with one accent).

**Tests**
- **Unit**: `ticketsDao` ordering on `(status, position)`; `editorToMarkdown` round-trip (TipTap JSON → markdown → expected string).
- **Playwright** (`tests/e2e/phase-05-board.spec.ts`):
  - Press `C` → assert TicketEditor focuses (TipTap has `ProseMirror` class — `await expect(page.locator('.ProseMirror')).toBeFocused()`).
  - Type "Wire up settings page", press `/` → assert slash menu opens with shadcn `Command` items; pick "Bullet list" → bullet appears.
  - Submit → card appears under Backlog with the title and the bullet visible in `TicketRenderer`.
  - Press ⌘K → command palette opens → type "Wire up" → result list shows the ticket → Enter → ticket detail dialog opens.
  - Drag the card onto a repo in the sidebar → assert it moves to "Queued" and `repo_id` set (verify via debug RPC `getTicket(id)`).
  - Reload — card stays in Queued, TipTap renderer reproduces the bullet from stored JSON.

---

## Phase 6 — Git Operations Module (full)

**Goal**: every git op the worker will need is implemented, tested, and idempotent.

**Build**
- Extend `src/main/git/ops.ts`:
  - `checkoutBase(repo)` → `git -C path checkout <base> && git -C path pull --ff-only` (fail fast on dirty tree).
  - `createBranch(repo, name)` → `git -C path checkout -b <name>` from current HEAD.
  - `commitAll(repo, message)` → `git -C path add -A && git -C path commit -m <message>` (returns `{committed: bool, sha?: string}`; no-op if nothing staged).
  - `diffAgainstBase(repo, branch)` → `git -C path diff <base>...<branch>` returns string.
  - `mergeBranch(repo, branch, strategy: 'merge'|'squash')` and `deleteBranch(repo, branch, force?)`.
- All ops capture stderr; on non-zero exit, throw a typed `GitError` with the command, code, stderr.

**Skills / Claude Code tools**
- `simplify` — review the spawn wrapper once duplicated patterns emerge.

**Tests**
- **Unit** (`tests/unit/git-ops.test.ts`, the densest unit file in the repo):
  - `beforeEach` creates a temp dir, `git init`, commits an initial file, sets `main` as default.
  - Cover every op: branch creation, commitAll happy/no-op paths, diff returns expected hunk, merge produces merge commit, delete fails when branch is current, etc.
  - `checkoutBase` against a "dirty" tree throws `GitError` with code `dirty`.
- **Playwright**: no direct e2e for this phase; integration with the worker comes in Phase 7.

---

## Phase 7 — Claude Runner & Per-Repo Worker Queue

**Goal**: assigning a ticket runs Claude in that repo on a new branch and lands a commit.

**Build**
- `src/main/claude/runner.ts`:
  - `runForTicket(ticket, repo, {resumeSessionId?, extraPrompt?, signal: AbortSignal})` calls SDK `query({prompt, cwd: repo.path, permissionMode:'dontAsk', abortSignal: signal, hooks:{PostToolUse: ...}, ...})`.
  - Stream the async iterator; each `SDKAssistantMessage`/`SDKResultMessage` → write to `ticket_events`, emit `claudeMessage`, capture `session_id` on first `ResultMessage`.
  - On `AbortError`: mark `claude_sessions.status='canceled'`, write `ticket_events {kind:'canceled'}`, return `{sdkSessionId, ok:false, canceled:true}`.
  - Return `{sdkSessionId, ok: boolean, canceled?: boolean, error?: string}`.
- `src/main/claude/stubRunner.ts`: same signature, but performs scripted file writes in `cwd` for deterministic tests; reads the script from `ticket.description` when prefixed with `TEST_SCRIPT:`.
- `src/main/queue/RepoWorker.ts`:
  - `pending: Set<string>` of queued ticket IDs (not a simple array — we re-sort on each pop).
  - `running: boolean`; `currentAbort?: AbortController`; `currentTicketId?: string`.
  - `enqueue(id)`: add to `pending`, set status `queued`, call `tick()`.
  - `tick()`: if running, return; else pick the **next eligible** ticket — `SELECT id FROM tickets t WHERE id IN (pending) AND NOT EXISTS (SELECT 1 FROM ticket_links l JOIN tickets b ON b.id = l.to_ticket WHERE l.from_ticket = t.id AND l.kind = 'blocked_by' AND b.status NOT IN ('done','discarded')) ORDER BY priority DESC, created_at ASC LIMIT 1`. If nothing eligible (all blocked), pause until an event re-runs `tick()`. Build new `AbortController`, run pipeline (checkoutBase → createBranch → runForTicket(signal, maxTurns) → commitAll → status `review` → write `review_ready` notification); clear `currentAbort` and loop.
  - `maxTurns` derived from `estimate`: XS=8, S=15, M=25, L=40, XL=60, null=25.
  - `cancel(ticketId)`: if `currentTicketId === ticketId`, call `currentAbort.abort()`. Worker's pipeline catches `AbortError`, runs `commitAll` for any partial work (so user sees what got done) and sets status `review` with a `kind:'canceled'` ticket event. If no commits exist on the branch, set status `canceled`, delete the branch, write `canceled` notification.
  - `unblockNotify(ticketId)`: when a ticket reaches `done`, the pool calls this on all repo workers; each re-runs `tick()` and writes an `unblocked` notification for any waiting ticket whose blockers are now clear.
  - Pipeline `try/catch` — any non-cancel failure: status `failed`, write error event + `failed` notification, continue loop.
- `src/main/queue/WorkerPool.ts`: lazy-create one `RepoWorker` per repo on first `enqueue`.
- `main/index.ts` boot recovery: `UPDATE tickets SET status='failed' WHERE status='in_progress'` with `ticket_events {kind:'error', reason:'app_restart'}`; re-enqueue every `queued` row.

**Skills / Claude Code tools**
- `claude-api` — ensure prompt caching is configured (long-lived per-ticket sessions benefit from cache).

**Tests**
- **Integration** (`tests/integration/worker.test.ts`, with `TIDE_RUNNER=stub`):
  - Seed a temp repo; enqueue two tickets — assert they run sequentially, each lands a distinct branch with one commit.
  - Enqueue a ticket whose stub script throws — assert status `failed`, branch left as-is, `ticket_events` records the error.
  - Enqueue a long-running stub ticket; call `cancel(id)` mid-run — assert ticket lands in `review` (or `canceled` if no partial commit), branch state is consistent, queue advances to next ticket.
- **Playwright** (`tests/e2e/phase-07-worker.spec.ts`):
  - Pre-seed a tmp repo + two tickets, set `TIDE_RUNNER=stub`.
  - In UI, drag both onto the repo → assert one enters In Progress while the other waits in Queued.
  - Wait for first to reach Review → assert it appears in the Review column; second transitions to In Progress.
  - Verify `workerStatus` badge on the sidebar repo flips busy → idle.
  - Cancel flow: drag a long-stub ticket onto repo, hit **Cancel** on its In Progress card → assert it transitions to Review (or Canceled column) within 2s, queued ticket advances.

---

## Phase 8 — Review Tabs, Diff Viewer, Action Buttons (Code / Cancel / Merge / Change more / Discard)

**Goal**: in-review and in-progress tickets are first-class objects with a full action set.

**Build**
- `src/main/editor/detect.ts`: detect editors on PATH — VS Code (`code`), Cursor (`cursor`), Windsurf (`windsurf`), JetBrains IDEs (`idea`, `webstorm`, `goland`, `pycharm`, `rubymine`, `phpstorm`, `clion`), Sublime (`subl`), Neovim (`nvim`), plus a "Custom command" stored in settings. Returns `{id, label, command}[]`.
- `src/main/editor/launch.ts`: `openInEditor({ticketId, editorId})` — resolves repo path + branch via DB, ensures `git checkout <branch>` is current (no-op if already), then `Bun.spawn([editor.command, repo.path], {detached: true, stdio: 'ignore'})`. Writes `ticket_events {kind:'editor_opened', editor: id}`.
- A new `app_settings` table (small KV) for `preferred_editor`, `custom_editor_command`.
- `handlers.ts` additions: `getDiff(ticketId)`, `mergeTicket(ticketId, strategy)`, `iterateTicket(ticketId, instructions)`, `discardTicket(ticketId)`, **`cancelTicket(ticketId)`**, **`listEditors()`**, **`openInEditor({ticketId, editorId})`**, **`commitLocalEdits({ticketId, message})`** (runs `git add -A && git commit -m` on the ticket's branch so manual edits land cleanly), **`refreshDiff(ticketId)`** (just re-fetches `getDiff`).
- `iterateTicket`: writes `ticket_events {kind:'iterate'}`, re-enqueues. Worker picks it up, calls `runForTicket` with `resumeSessionId` and `extraPrompt`; on completion, `commitAll` lands the next commit on the existing branch.
- `src/webview/components/TopTabs.tsx`: built on shadcn `Tabs`; "Board" always present; one tab per ticket with status `in_progress`, `review`, or `canceled`; closable middle-click or `×` icon; framer-motion fade on mount/unmount.
- `src/webview/components/ReviewPanel.tsx`: shadcn `Resizable` split layout —
  - Header: ticket title, branch name (mono), repo name, status `Badge`, action toolbar on the right.
  - Left pane: scrollable transcript (`ScrollArea`) of `ticket_events kind='claude_message'`, live-updating; each message rendered with TipTap viewer for any rich content; tool-use events render as collapsible cards (lucide icons keyed to tool name).
  - Right pane: `diff2html` rendered to the dark Linear-style palette (override CSS to match shadcn tokens); **Refresh** chip (shadcn `Button` variant ghost) above the diff to re-pull after manual edits.
  - **Code** button (shadcn `DropdownMenu`, always visible): detected editors + a "Configure custom…" item; opens the repo at the ticket's branch in the chosen editor.
  - Footer toolbar (shadcn `Button` row) depends on status:
    - `in_progress`: **Cancel** (destructive variant), **Code**.
    - `review` / `canceled`: **Merge** (`DropdownMenu`: Merge / Squash), **Change more** (opens shadcn `Dialog` with a **TipTap editor** for the new instructions — reuses `TicketEditor` with a "Send" placeholder; submits to `iterateTicket`), **Commit my edits** (`Dialog`: message → `commitLocalEdits`, enabled only when diff shows uncommitted changes), **Code**, **Discard** (destructive `Dialog` confirm).
- On ticket cards in the Board (In Progress column): inline **Cancel** and **Code** buttons (compact `DropdownMenu` triggered by the lucide `MoreHorizontal` icon) so the user doesn't have to open the tab.
- Toasts: shadcn `sonner` for "Merged to main", "Ticket discarded", "Editor not found — set a custom command in Settings".
- **Notifications inbox (backend + UI)**: `notifications` rows are written by the worker (review_ready, failed, canceled, unblocked) and by handlers (merged); `NotificationCenter.tsx` (shell from Phase 5) becomes live — unread badge counts, mark-read on click, "Mark all read", filter by kind. Click jumps to ticket or opens the relevant tab.
- **Comments / Notes**: `CommentsPanel.tsx` lives inside the ticket detail dialog and the Review tab — TipTap editor for new comments, list of past comments grouped by day, edit/delete own comments.
- **Sub-ticket progress in review**: the Review tab shows a small "Sub-tickets" section listing children with their statuses, jump links, and a roll-up progress bar.

**Skills / Claude Code tools**
- `frontend-design` — pass over review tab for polish (typography, syntax highlighting, status badges).
- `update-config` — once preferred editor is in settings, add a hook that runs `git status` on cancel/merge so the UI surfaces any stray uncommitted edits.

**Skills / Claude Code tools**
- `frontend-design` — pass over the review tab for polish (typography, syntax highlighting selection).

**Tests**
- **Unit**:
  - `iterateTicket` writes an `iterate` event and sets status back to `queued`.
  - `editor/detect.ts` returns the expected editors when fake `which` shims are on a fake PATH.
  - `cancelTicket` on a non-running ticket is a no-op (does not crash).
- **Playwright** (`tests/e2e/phase-08-review.spec.ts`):
  - Seed: ticket in `review` status with a stub-generated diff that adds a `README.md`.
  - Open app → top tab for the ticket exists → click it → diff renders showing the new file.
  - Click **Change more** with text "also add LICENSE" → assert ticket leaves the tab (back to In Progress), worker runs, ticket returns to Review with two commits on branch.
  - Click **Merge (merge)** → assert tab closes, ticket appears under Done, `git log` on the repo's base branch shows merge commit (verified via debug RPC `runGit(['log', '--oneline'])`).
  - On a second ticket, click **Discard** → tab closes, branch removed.
  - **Cancel button**: enqueue a long-running stub ticket → from its In Progress card click **Cancel** → assert it lands in Review with a `canceled` event, queue advances.
  - **Code button (mocked editor)**: set `TIDE_EDITOR_STUB=1` so the launcher writes the invoked command + args to `data/test/last-editor-launch.json` instead of spawning. Click **Code** → choose VS Code → assert the recorded command is `["code", "<repoPath>"]` and an `editor_opened` event was logged.
  - **Commit my edits**: pre-create an uncommitted file in the ticket's worktree (via Playwright's filesystem fixture) → click **Refresh** → diff updates → click **Commit my edits** with message "manual tweak" → assert a new commit lands on the branch with that message.

---

## Phase 9 — Resilience, Auth Loop, Edge Cases

**Goal**: app survives ugly conditions.

**Build**
- Boot recovery (already in Phase 7) → write proper UI for it: `failed` tickets show with a "Restart" button that re-enqueues with the same prompt on a fresh branch.
- `gitEvent` surfacing: when `checkoutBase` fails (dirty/diverged), surface an inline banner on the ticket card; mark `failed`.
- "Base moved" detection: when a Review-status ticket's base branch has new commits since the ticket's `created_at`, show a small warning chip on the Review tab.
- Watch `ANTHROPIC_API_KEY` env at runtime (poll every 30s) and update `authStatus`; if a Claude run fails with `401`, immediately re-check.
- Graceful shutdown: `process.on('SIGINT'/'SIGTERM')` flushes the DB and stops accepting new enqueues; running ticket finishes its current SDK turn before exit (best-effort).
- **Snooze tick**: a 60s interval scans `tickets WHERE status='snoozed' AND snooze_until <= now()` → flip to `triage`, write a `snooze_expired` notification, emit `ticketUpdated`.

**Skills / Claude Code tools**
- `security-review` — run against the branch before tagging this phase, since this is the first phase that touches user creds and external commands.

**Tests**
- **Unit**: "base moved" detector against a temp repo with extra commits on `main` after a branch was created.
- **Playwright** (`tests/e2e/phase-09-resilience.spec.ts`):
  - Force-quit the Bun main mid-stub-run (send SIGKILL via fixture) → relaunch → assert in-progress ticket now shows `failed` with "Restart" button; queued ticket has resumed.
  - Make repo dirty (write a file outside the app), then enqueue a ticket → assert ticket lands in `failed` with the dirty-tree reason on its card.
  - Toggle `ANTHROPIC_API_KEY` off mid-session → banner appears within ~30s without restart.
  - Snooze a ticket for 2s with a debug RPC override → after 3s, ticket reappears in Triage with a `snooze_expired` notification.
  - Enqueue ticket B with `blocked_by` → ticket A → A runs, B waits in Queued with lock icon; on A reaching `done`, an `unblocked` notification fires and B starts.

---

## Phase 10 — Packaging, Distribution, Final Smoke

**Goal**: shippable Windows build, plus a packaged-app smoke test.

**Build**
- `bunx electrobun build --target=win32-x64` → produces a `Setup.exe` and the unpacked app.
- Set up GitHub Releases pipeline (manual for MVP — just `gh release create` script).
- Bundle splash + icon (`assets/icon.ico`).
- Add `--version` flag handling in `main/index.ts` for log/debug.
- Auto-update path: stubbed for MVP — note in README.

**Skills / Claude Code tools**
- `review` — run on the full branch before cutting the release.
- `security-review` — final pass on the shippable build.

**Tests**
- **Manual smoke (scripted, captured in `tests/smoke/win-package.md`)**:
  - Install the produced `Setup.exe` on a clean Windows 11 VM (or fresh user profile).
  - Launch from Start menu — window opens, AuthBanner reflects env.
  - Attach a small public repo via Git URL, create a ticket "Add a banner to the README", assign, watch it run end-to-end, merge, verify the commit on `main`.
- **Playwright on packaged app**: Electrobun's WebView2 isn't drivable, so we **do not** run Playwright against the packaged app. Instead, the final Playwright run is on the dev-bridge build using the same source tree at the release commit (`tests/e2e/phase-10-final.spec.ts` — runs every prior phase's spec in sequence as a regression gate).

---

## RPC surface (final)

**Methods (main → webview-callable)**:
- Projects/Repos/Labels: `listProjects`, `createProject`, `renameProject`, `deleteProject`, `listRepos({projectId?})`, `addRepoLocal({path, projectId})`, `addRepoClone({url, name, projectId})`, `moveRepoToProject`, `listLabels({projectId})`, `createLabel`, `deleteLabel`.
- Tickets: `listTickets({view?})`, `createTicket`, `updateTicket(patch)`, `assignTicket`, `setPriority`, `setEstimate`, `setLabels`, `setStatus`, `bulkUpdate({ticketIds, patch})`, `deleteTicket`, `duplicateTicket`, `getTicket(id)` (debug), `getTicketEvents(ticketId)`, `sendToBacklog(ids)`, `snoozeTicket({ticketId, untilMs})`.
- Hierarchy/Links: `setParent`, `addLink`, `removeLink`, `getLinks(ticketId)`.
- Templates: `listTemplates({projectId})`, `createTemplate`, `applyTemplate`.
- Comments: `listComments(ticketId)`, `addComment`, `editComment`, `deleteComment`.
- Views: `listSavedViews`, `saveView`, `deleteView`.
- Notifications: `listNotifications({unreadOnly?})`, `markNotificationRead(id)`, `markAllNotificationsRead`.
- Review actions: `getDiff(ticketId)`, `refreshDiff(ticketId)`, `mergeTicket({ticketId, strategy})`, `iterateTicket({ticketId, instructions})`, `discardTicket(ticketId)`, `cancelTicket(ticketId)`, `commitLocalEdits({ticketId, message})`.
- Editor: `listEditors`, `openInEditor`.
- App: `getSettings`, `updateSettings(patch)`, `getAuthStatus`, `runGit(args[])` (debug-only, dev bridge only).

**Events (main → webview):** `ticketUpdated(ticket)`, `ticketsBulkUpdated(ids)`, `repoUpdated(repo)`, `projectUpdated(project)`, `labelUpdated(label)`, `workerStatus({repoId, busy, queueLength, currentTicketId?})`, `claudeMessage({ticketId, message})`, `gitEvent({ticketId, kind, detail})`, `notificationCreated(notification)`, `authStatus({ok, reason})`.

## UI layout (final, Linear-style)

- **Theme**: dark default, near-black `#0E0E10`, single accent `#5E6AD2`, Inter font, 12-13px base, tight tracking, 6px radii, hairline borders (`hsl(var(--border)/0.6)`).
- **Window**: single, ~1400×900, custom titlebar (Electrobun supports — show repo/ticket breadcrumb).
- **Left sidebar** (shadcn `ScrollArea`, ~220px): "Tide" wordmark; repo rows with busy dot + queue count (`Badge`); "Add repo" → `Dialog` with two `Tabs` (Local Path / Git URL); Settings cog at the bottom.
- **Top bar** (shadcn `Tabs`): "Board" tab + closable tab per `status IN ('in_progress','review','canceled')` ticket. ⌘K opens the command palette anywhere.
- **Main area**:
  - **Board tab**: 5 columns Backlog | Queued | In Progress | Review | Done. Linear-style: column headers monochrome with count badges; cards compact (title 13px medium, 1-line preview, repo + status dot row). New-ticket inline form is a small TipTap editor pinned to the Backlog column header.
  - **Review tab**: `Resizable` split — left transcript, right diff. Footer action toolbar.
- **Command palette** (⌘K, shadcn `Command`): create ticket, jump to ticket, switch repo, merge/cancel current ticket, toggle theme, open settings.
- **AuthBanner**: above everything when `authStatus.ok === false` — `Alert` variant destructive with a "Run `claude login`" hint.

## Critical files to create (cross-cutting)

- `C:\Users\krish\projects\tide\src\main\index.ts` — boot, DB init, restore workers, register RPC, open window.
- `C:\Users\krish\projects\tide\src\main\devbridge.ts` — Playwright/browser dev bridge.
- `C:\Users\krish\projects\tide\src\main\queue\RepoWorker.ts` — the heart of the app.
- `C:\Users\krish\projects\tide\src\main\claude\runner.ts` + `stubRunner.ts` — Agent SDK wrapper and its deterministic twin.
- `C:\Users\krish\projects\tide\src\main\git\ops.ts` — every git op.
- `C:\Users\krish\projects\tide\src\main\editor\detect.ts` + `launch.ts` — Code-button machinery (detect editors, spawn).
- `C:\Users\krish\projects\tide\src\main\db\schema.sql` + `db\repos.ts` — schema + DAOs.
- `C:\Users\krish\projects\tide\src\shared\types.ts` — RPC contract.
- `C:\Users\krish\projects\tide\src\webview\components\Board.tsx` + `ReviewPanel.tsx` — primary UI surfaces.
- `C:\Users\krish\projects\tide\src\webview\components\BoardToolbar.tsx` — group / sort / filter / saved views.
- `C:\Users\krish\projects\tide\src\webview\components\CommandPalette.tsx` + `QuickSwitcher.tsx` — ⌘K / ⌘P.
- `C:\Users\krish\projects\tide\src\webview\components\editor\TicketEditor.tsx` + `tiptap.ts` + custom `SlashCommand` extension.
- `C:\Users\krish\projects\tide\src\webview\components\NotificationCenter.tsx` + `CommentsPanel.tsx` + `ActivityFeed.tsx` + `Hovercard.tsx` + `BulkActionBar.tsx`.
- `C:\Users\krish\projects\tide\tests\e2e\fixtures\tideApp.ts` — Playwright fixture spawning the backend.

## Risks / open questions

- **`bun:sqlite` on Windows**: supported on Bun ≥ 1.1.30 on x64. Verify; fallback is `better-sqlite3`.
- **Electrobun on Windows**: WebView2 (Win11 default). Verify scaffold produces Windows target; may need version pin.
- **Claude Agent SDK on Windows**: Bash tool calls inside Claude may fail unless Git Bash is on PATH — document for MVP.
- **Playwright vs native webview**: documented above; we test through the dev HTTP/WS bridge, not against the packaged WebView2 instance. Final phase compensates with a scripted manual smoke.
- **Reviews on app close**: durable in DB; tabs reconstruct from `SELECT * FROM tickets WHERE status='review'`.
- **`git pull --ff-only` failure**: surface as `gitEvent`, mark `failed`, no auto-resolve.
- **Concurrent merges on same repo**: stale-diff banner only in MVP; auto-rebase is v2.
- **Branch name collisions**: `tide/<slug>-<ulidSuffix>`.
- **Cancel mid-tool-call**: SDK's `AbortSignal` interrupts between tool calls, not in the middle of a long-running Bash invocation. Worst-case lag ≈ longest single tool call. Document; OK for MVP.
- **Manual edits during In Progress**: opening the editor while Claude is running is allowed but risky — Claude may overwrite the user's edits on the next tool call. UI shows a yellow banner on the Code button while `status='in_progress'`.
- **Editor detection on Windows**: `code`/`cursor` are shims (`code.cmd`); `Bun.spawn` on Windows resolves `.cmd` only via `shell: true` or full path. Detect must probe with the resolved path; document.
- **Secrets in diffs**: raw rendering for MVP; flag for redaction later.
- **Bundle size with React + shadcn + TipTap**: ~250–400 KB gzipped. Electrobun's webview is local, so size matters less than for web. Lazy-load `diff2html` and `lowlight` to keep first paint snappy.
- **TipTap JSON migrations**: storing TipTap docs means schema changes in TipTap (extension updates) can break older docs. Mitigation: version `description` rows with `description_schema_version`, run a migration on load if needed. Defer the column until first migration is needed (v2).
- **shadcn dark-mode in WebView2**: Tailwind v4 + `prefers-color-scheme` works in WebView2; we force `class="dark"` on `<html>` to remove dependence on OS preference for MVP.
