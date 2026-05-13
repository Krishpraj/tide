// Typed RPC client. In dev/test we go over HTTP+WebSocket via the Vite proxy.
// In an Electrobun build we'd swap the transport for the native bridge; the
// surface is identical so callers don't change.

import type {
  RpcEventName,
  RpcEvents,
  RpcMethodName,
  RpcMethods,
} from "@shared/types";

export type RpcClient = {
  [K in RpcMethodName]: (
    ...args: Parameters<RpcMethods[K]>
  ) => ReturnType<RpcMethods[K]>;
} & {
  on<N extends RpcEventName>(
    event: N,
    handler: (payload: RpcEvents[N]) => void,
  ): () => void;
  ready: Promise<void>;
};

function makeClient(): RpcClient {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();

  let ws: WebSocket | null = null;
  let readyResolve: () => void = () => {};
  const ready = new Promise<void>((r) => (readyResolve = r));

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/events`);
    ws.addEventListener("open", () => readyResolve());
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg && typeof msg.event === "string") {
          const set = handlers.get(msg.event);
          if (set) for (const fn of set) fn(msg.payload);
        }
      } catch {
        // ignore malformed frames
      }
    });
    ws.addEventListener("close", () => {
      ws = null;
      // light reconnect; production transport would coordinate differently
      setTimeout(connect, 750);
    });
  }
  connect();

  const target = {
    on(event: string, handler: (payload: unknown) => void) {
      let set = handlers.get(event);
      if (!set) handlers.set(event, (set = new Set()));
      set.add(handler);
      return () => set?.delete(handler);
    },
    ready,
  };

  return new Proxy(target as unknown as RpcClient, {
    get(t, prop) {
      if (prop === "on" || prop === "ready") {
        return (t as any)[prop];
      }
      const method = String(prop);
      return async (input?: unknown) => {
        const res = await fetch(`/rpc/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input ?? null),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`rpc ${method} failed: ${res.status} ${txt}`);
        }
        const data = (await res.json()) as
          | { ok: true; result: unknown }
          | { ok: false; error: string };
        if (!data.ok) throw new Error(`rpc ${method}: ${data.error}`);
        return data.result;
      };
    },
  });
}

export const rpc: RpcClient = makeClient();
