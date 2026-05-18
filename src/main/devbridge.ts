// Dev/test HTTP+WebSocket bridge for the Tide webview.
//
// Architecture: the webview talks to main over a typed RPC bridge. In an
// Electrobun production build the bridge is native; in dev/test we serve the
// same contract over HTTP (`/rpc/<method>`) and a WebSocket (`/events`).
// Playwright drives a real Chromium against the Vite dev server, which proxies
// /rpc and /events here.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { registerHandlers, callHandler, hasHandler } from "./rpc/handlers";
import { registerEventsTransport } from "./rpc/events";
import { initDb } from "./db/client";
import { startWorkers } from "./queue/WorkerPool";
import { startAuthPolling } from "./auth/check";
import { startSnoozeTicker } from "./queue/snooze";

const PORT = Number(Bun.env.TIDE_PORT ?? 5733);

// Resolve the prebuilt webview directory. In a `bun --compile` binary the
// exe is shipped alongside a `webview/` folder; in dev/test the bundle lives
// at <repo>/dist/webview.
function resolveWebviewDir(): string | null {
  const candidates = [
    Bun.env.TIDE_WEBVIEW_DIR,
    join(dirname(process.execPath), "webview"),
    resolve(import.meta.dir, "../../dist/webview"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  for (const p of candidates) {
    if (existsSync(join(p, "index.html"))) return p;
  }
  return null;
}
const webviewDir = resolveWebviewDir();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};
function mimeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : "";
  return MIME[ext] ?? "application/octet-stream";
}

async function serveStatic(pathname: string): Promise<Response | null> {
  if (!webviewDir) return null;
  // Map "/" → "/index.html"; resolve and reject any path that escapes webviewDir.
  const rel = pathname === "/" ? "/index.html" : pathname;
  const full = resolve(webviewDir, "." + rel);
  if (!full.startsWith(resolve(webviewDir))) return null;
  const file = Bun.file(full);
  if (!(await file.exists())) {
    // SPA fallback: serve index.html for routes without a file extension so
    // client-side routing still works after a deep-link refresh.
    if (!/\.[a-z0-9]+$/i.test(rel)) {
      const idx = Bun.file(join(webviewDir, "index.html"));
      if (await idx.exists()) {
        return new Response(idx, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    }
    return null;
  }
  return new Response(file, {
    headers: { "content-type": mimeFor(full) },
  });
}

function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      // `start` is a cmd builtin, hence the empty title argument.
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // Best-effort — user can always paste the URL manually.
  }
}

// Mutable set of WS clients.
const wsClients = new Set<ServerWebSocket>();

type ServerWebSocket = {
  send(data: string): void;
  close(): void;
};

function broadcast(event: string, payload: unknown) {
  const data = JSON.stringify({ event, payload });
  for (const ws of wsClients) {
    try {
      ws.send(data);
    } catch {
      // best-effort; will be cleaned up on close
    }
  }
}

registerEventsTransport(broadcast);

await initDb();
await registerHandlers();

// Long-running background services.
startWorkers();
startSnoozeTicker();
startAuthPolling();

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req, srv) {
    const url = new URL(req.url);

    // CORS preflight (Vite dev server proxies, but allow direct access too).
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/health") {
      return Response.json(
        { ok: true, version: "0.1.0" },
        { headers: corsHeaders() },
      );
    }

    if (url.pathname === "/events") {
      const upgraded = srv.upgrade(req);
      if (upgraded) return; // hijacked
      return new Response("expected ws upgrade", { status: 426 });
    }

    if (url.pathname.startsWith("/rpc/")) {
      const method = url.pathname.slice("/rpc/".length);
      if (!hasHandler(method)) {
        return new Response(`unknown rpc method: ${method}`, {
          status: 404,
          headers: corsHeaders(),
        });
      }
      let input: unknown = undefined;
      if (req.method !== "GET") {
        try {
          const txt = await req.text();
          input = txt ? JSON.parse(txt) : undefined;
        } catch {
          return new Response("invalid json", {
            status: 400,
            headers: corsHeaders(),
          });
        }
      }
      try {
        const result = await callHandler(method, input);
        return new Response(JSON.stringify({ ok: true, result }), {
          headers: {
            "content-type": "application/json",
            ...corsHeaders(),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ ok: false, error: message }), {
          status: 500,
          headers: {
            "content-type": "application/json",
            ...corsHeaders(),
          },
        });
      }
    }

    // Static file serving from the prebuilt webview (production binary).
    if (req.method === "GET" || req.method === "HEAD") {
      const r = await serveStatic(url.pathname);
      if (r) return r;
    }

    return new Response("not found", { status: 404, headers: corsHeaders() });
  },
  websocket: {
    open(ws) {
      wsClients.add(ws as unknown as ServerWebSocket);
    },
    close(ws) {
      wsClients.delete(ws as unknown as ServerWebSocket);
    },
    message() {
      // no-op: the webview only listens for server-sent events
    },
  },
});

const url = `http://${server.hostname}:${server.port}`;
console.log(`tide devbridge listening on ${url}`);
if (webviewDir) console.log(`tide serving webview from ${webviewDir}`);
if (Bun.env.TIDE_OPEN_BROWSER === "1") openBrowser(url);

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
