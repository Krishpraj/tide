// Surface phase/stage events into the per-ticket activity stream so the
// webview's LiveStream shows progress even before (or after) Claude itself
// has anything to say.
//
// Writes a `claude_message`-shaped payload into ticket_events AND emits a
// live `claudeMessage` event so the UI lights up in real time.

import { eventsDao } from "../db/dao";
import { emit } from "../rpc/events";

export function surface(
  ticketId: string,
  label: string,
  detail?: string,
  level: "info" | "warn" | "error" = "info",
): void {
  const message = {
    type: "tide_stage" as const,
    label,
    detail,
    level,
    ts: Date.now(),
  };
  eventsDao.insert({ ticketId, kind: "stage", payload: message });
  emit("claudeMessage", { ticketId, message });
}
