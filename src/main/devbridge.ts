// Dev/test HTTP+WebSocket bridge for the Tide webview.
//
// Architecture: the webview talks to main over a typed RPC bridge. In an
// Electrobun production build the bridge is native; in dev/test we serve the
// same contract over HTTP (`/rpc/<method>`) and a WebSocket (`/events`).
// Playwright drives a real Chromium against the Vite dev server, which proxies
// /rpc and /events here.

import { registerHandlers, callHandler, hasHandler } from "./rpc/handlers";
import { registerEventsTransport } from "./rpc/events";
import { initDb } from "./db/client";
import { startWorkers } from "./queue/WorkerPool";
import { startAuthPolling } from "./auth/check";
import { startSnoozeTicker } from "./queue/snooze";

const PORT = Number(Bun.env.TIDE_PORT ?? 5733);

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

console.log(`tide devbridge listening on http://${server.hostname}:${server.port}`);

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
