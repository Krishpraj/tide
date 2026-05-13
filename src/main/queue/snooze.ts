import {
  notificationsDao,
  ticketsDao,
} from "../db/dao";
import { emit } from "../rpc/events";
import { getDb } from "../db/client";

let handle: ReturnType<typeof setInterval> | null = null;

function tick() {
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
}

export function startSnoozeTicker() {
  if (handle) return;
  const interval = Number(Bun.env.TIDE_SNOOZE_INTERVAL_MS ?? 60_000);
  handle = setInterval(tick, interval);
}
