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

  // Simulate an app restart for tests: replays the boot-recovery logic
  // (marks in_progress → failed and re-enqueues queued tickets).
  register("__simulateRestart", async () => {
    const { startWorkers } = await import("../queue/WorkerPool");
    startWorkers();
  });

  // Fire one snooze tick on demand (test fast-forward).
  register("__tickSnooze", async () => {
    const { notificationsDao, ticketsDao } = await import("../db/dao");
    const { emit } = await import("../rpc/events");
    const { getDb } = await import("../db/client");
    const now = Date.now();
    const due = getDb()
      .query<{ id: string }, [number]>(
        "SELECT id FROM tickets WHERE status = 'snoozed' AND snooze_until IS NOT NULL AND snooze_until <= ?",
      )
      .all(now);
    for (const row of due) {
      const t = ticketsDao.update(row.id, {
        status: "triage",
        snoozeUntil: null,
      });
      emit("ticketUpdated", { ticket: ticketsDao.withLabels(t) });
      const n = notificationsDao.insert({
        ticketId: row.id,
        kind: "snooze_expired",
        title: `Snooze expired: ${t.title}`,
      });
      emit("notificationCreated", { notification: n });
    }
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
