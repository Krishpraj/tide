// Debug-only RPC. Only registered when TIDE_DEBUG_RPC=1 (dev/test).
import { register } from "../rpc/handlers";
import { setAuthOverride } from "../auth/check";
import { getDb } from "../db/client";
import type { AuthStatus } from "@shared/types";

if (Bun.env.TIDE_DEBUG_RPC === "1") {
  register("__noop", async () => ({ ok: true }));

  // Force auth state for e2e tests. Pass null to clear.
  register("__setAuthOverride", async (input) => {
    const v = input as AuthStatus | null;
    setAuthOverride(v ?? null);
  });

  // Wipe all rows (keeps schema). Reseeds the default project.
  register("__resetDb", async () => {
    const db = getDb();
    db.exec(`
      DELETE FROM ticket_events;
      DELETE FROM claude_sessions;
      DELETE FROM ticket_comments;
      DELETE FROM ticket_links;
      DELETE FROM ticket_labels;
      DELETE FROM tickets;
      DELETE FROM ticket_templates;
      DELETE FROM labels;
      DELETE FROM notifications;
      DELETE FROM saved_views;
      DELETE FROM app_settings;
      DELETE FROM repos;
      DELETE FROM projects;
    `);
    db.run(
      "INSERT INTO projects (id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)",
      ["default", "Default", "#5E6AD2", 0, Date.now()],
    );
  });
}
