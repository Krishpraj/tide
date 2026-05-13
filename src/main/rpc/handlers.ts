// Central handler registry. Each handler receives a parsed JSON input and
// returns a JSON-serializable result. Phases beyond 1 will register more
// handlers via registerHandlers() — keeping a single registration point lets
// the devbridge stay agnostic of features.

type Handler = (input: unknown) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

export function register(name: string, fn: Handler) {
  handlers.set(name, fn);
}

export function hasHandler(name: string): boolean {
  return handlers.has(name);
}

export async function callHandler(name: string, input: unknown): Promise<unknown> {
  const fn = handlers.get(name);
  if (!fn) throw new Error(`unknown rpc method: ${name}`);
  return await fn(input);
}

export async function registerHandlers() {
  // Always-on baseline handler used for the dev-bridge readiness probe.
  register("health", async () => ({ ok: true, version: "0.1.0" }));

  // Feature handlers are registered by their owning modules to avoid a
  // monolithic file.
  await import("../auth/check.handlers");
  await import("../db/projects.handlers");
  await import("../db/labels.handlers");
  await import("../db/repos.handlers");
  await import("../db/tickets.handlers");
  await import("../db/links.handlers");
  await import("../db/templates.handlers");
  await import("../db/comments.handlers");
  await import("../db/views.handlers");
  await import("../db/notifications.handlers");
  await import("../db/settings.handlers");
  await import("../db/events.handlers");
  await import("../queue/review.handlers");
  await import("../editor/editor.handlers");
  await import("../debug/debug.handlers");
}
