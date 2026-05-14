# Tide

A Linear-style Kanban desktop app where **Claude Code does the implementation**. File a ticket, assign it to a tracked git repo, and Tide spawns Claude Code in that repo on a fresh branch. Tickets flow **Backlog → Queued → In Progress → Review → Done**, with a per-repo sequential queue and multiple repos running in parallel.

Each ticket in Review opens its own tab so several reviews can be open at once — **Merge**, **Change more** (resume the Claude session with new instructions), or **Discard**.

---

## Requirements

Before you start, make sure you have the following installed:

| Tool | Version | Notes |
|---|---|---|
| **[Bun](https://bun.sh)** | ≥ 1.1 | Runtime for both the main process and the test runner. Install on Windows with `powershell -c "irm bun.sh/install.ps1 \| iex"`. |
| **Git** | any recent | Tide shells out to `git` for branch/diff/merge operations. Must be on `PATH`. |
| **Claude Code authentication** | — | Tide does **not** store API keys. It uses your existing Claude credentials. Either: <br>• Run `claude login` once (writes `~/.claude/credentials.json`), **or**<br>• Set `ANTHROPIC_API_KEY` in your environment. |
| **OS** | Windows 11 (primary), macOS/Linux (dev-bridge mode works) | The packaged desktop app targets Windows 11 (WebView2). The dev/test target runs anywhere Bun + Chromium run. |

> If neither credential source is present when Tide starts, you'll see a red auth banner in the UI with setup instructions. No tickets will run until auth is resolved.

---

## Install

```sh
git clone <this-repo> tide
cd tide
bun install
```

That's it — no separate native build step is needed for development.

---

## Run (development)

Tide has two runnable surfaces during development:

1. **Vite dev server** — serves the React webview at `http://localhost:5173` with HMR.
2. **Dev bridge** — a Bun HTTP/WebSocket server on `http://localhost:5733` that runs the real backend (SQLite, the worker pool, the Claude Agent SDK, git ops). Vite proxies `/rpc`, `/events`, and `/health` to it.

### One command (recommended)

```sh
bun run dev
```

This uses `concurrently` to start both processes. Once both are up, open **http://localhost:5173** in any Chromium-based browser. You should see the Tide board with a green "RPC: ok" indicator in the corner.

### Or run them separately

Useful when debugging one side or the other:

```sh
# Terminal 1 — backend (Bun, SQLite, workers, Claude SDK)
bun run dev:web

# Terminal 2 — frontend (Vite + React + Tailwind)
bun run dev:vite
```

### First-run flow

1. Open the app in your browser.
2. If the auth banner is red, fix auth (see Requirements above) and refresh.
3. Click **+ Add repo** in the sidebar to attach a local git repo (or clone one from a URL into `data/repos/<slug>/`).
4. Press **C** to create your first ticket. Fill in the title and a clear description — that's what Claude Code receives as the prompt.
5. Move the ticket to **Queued**; the worker picks it up, creates a branch, and starts Claude.
6. When the ticket lands in **Review**, click into the tab to see the diff. Choose **Merge**, **Change more**, or **Discard**.

---

## Useful keyboard shortcuts

Linear-style, powered by `tinykeys`:

| Key | Action |
|---|---|
| `C` | Create ticket |
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘P` / `Ctrl+P` | Quick switcher (jump to ticket) |
| `J` / `K` | Navigate cards |
| `M` | Merge |
| `D` | Discard |
| `X` | Cancel running ticket |
| `O` | Open in editor (VS Code / Cursor / JetBrains / etc.) |
| `⌘E` / `Ctrl+E` | "Change more" — resume Claude with new instructions |

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Alternative to `claude login`. If set, used directly by the Claude Agent SDK. |
| `TIDE_DATA_DIR` | `./data` | Where the SQLite DB and cloned repos live. |
| `TIDE_PORT` | `5733` | Dev-bridge HTTP/WS port. |
| `TIDE_RUNNER` | `real` | Set to `stub` to use a scripted fake runner instead of real Claude (used by the test suite). |
| `TIDE_DEBUG_RPC` | unset | Set to `1` to log every RPC call to stderr. |

You can drop these into a `.env` file (gitignored) or export them in your shell.

---

## Build (production webview bundle)

```sh
bun run build:webview
```

Outputs to `dist/webview/`. The packaged Electrobun desktop build wraps this same bundle inside WebView2; see `PLAN.md` for the desktop packaging story.

---

## Tests

```sh
bun run typecheck        # tsc --noEmit
bun run test:unit        # bun test tests/unit
bun run test:integration # bun test tests/integration (uses the stub Claude runner)
bun run test:e2e         # playwright test (drives a real Chromium against the dev bridge)
bun run test             # unit + e2e
```

Playwright spins up the dev bridge and Vite automatically; you don't need to start them yourself.

---

## Project layout

```
src/
├── main/          # Bun-side: SQLite, worker pool, Claude Agent SDK, git ops, RPC
│   ├── devbridge.ts        # HTTP/WS bridge for browser + Playwright
│   ├── db/                 # bun:sqlite client + DAOs
│   ├── queue/              # RepoWorker, WorkerPool, snooze ticker
│   ├── claude/             # Agent SDK runner + deterministic stub
│   ├── git/                # checkout, branch, commit, diff, merge
│   └── rpc/                # typed RPC handlers + event emitter
├── shared/        # Shared types (RPC contract, domain types)
└── webview/       # React + Tailwind + shadcn/ui + TipTap
    ├── main.tsx
    ├── rpc.ts              # auto-detects Electrobun vs dev-bridge transport
    ├── store.ts            # Zustand
    └── components/         # Sidebar, Board, TicketCard, ReviewPanel, …

tests/
├── unit/          # bun test — pure modules
├── integration/   # bun test — worker pipeline against stub Claude + temp repos
└── e2e/           # playwright — real Chromium against the full UI + backend

data/              # runtime, gitignored — SQLite DB + cloned repos
```

See [`PLAN.md`](./PLAN.md) for the full design doc, phase plan, and database schema.

---

## Troubleshooting

- **"RPC: error" or blank board**: the dev bridge isn't running. Make sure `bun run dev:web` (or `bun run dev`) is up and listening on `5733`.
- **Auth banner stays red after `claude login`**: confirm `~/.claude/credentials.json` exists and is readable, or set `ANTHROPIC_API_KEY` and restart the dev bridge.
- **Ticket stuck in Queued**: check the worker pool logs in the `dev:web` terminal — usually a git problem (dirty working tree, unknown base branch).
- **Playwright tests time out**: kill any stale Bun processes on port `5734` (test bridge) and `5173` (Vite).
- **Port conflicts**: override with `TIDE_PORT=5800 bun run dev:web` and the matching Vite proxy will follow via `TIDE_PORT`.

---

## License

Private project, not yet licensed for redistribution.
