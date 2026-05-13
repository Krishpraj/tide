import { register } from "../rpc/handlers";
import { ticketsDao, labelsDao } from "./dao";
import { emit } from "../rpc/events";
import { enqueueTicket, notifyAllUnblocked } from "../queue/WorkerPool";
import type {
  Estimate,
  Priority,
  Ticket,
  TicketStatus,
} from "@shared/types";

function attachLabels(t: Ticket): Ticket {
  return ticketsDao.withLabels(t);
}

register("listTickets", async (input) => {
  const i = (input ?? {}) as {
    status?: TicketStatus;
    repoId?: string | null;
  };
  return ticketsDao.list(i).map(attachLabels);
});

register("getTicket", async (id) => {
  const t = ticketsDao.get(id as string);
  return t ? attachLabels(t) : null;
});

register("createTicket", async (input) => {
  const i = input as {
    title: string;
    description?: string;
    descriptionMd?: string;
    repoId?: string | null;
    parentId?: string | null;
    priority?: Priority;
    estimate?: Estimate;
    labelIds?: string[];
    status?: TicketStatus;
  };
  const t = ticketsDao.insert({
    title: i.title.trim() || "Untitled",
    description: i.description ?? "{}",
    descriptionMd: i.descriptionMd ?? "",
    repoId: i.repoId ?? null,
    parentId: i.parentId ?? null,
    priority: i.priority ?? 0,
    estimate: i.estimate ?? null,
    status: i.status ?? "triage",
  });
  if (i.labelIds && i.labelIds.length > 0) {
    labelsDao.setForTicket(t.id, i.labelIds);
  }
  const full = attachLabels(t);
  emit("ticketUpdated", { ticket: full });
  return full;
});

register("updateTicket", async (input) => {
  const i = input as { id: string; patch: Partial<Ticket> };
  const t = ticketsDao.update(i.id, i.patch);
  const full = attachLabels(t);
  emit("ticketUpdated", { ticket: full });
  return full;
});

register("assignTicket", async (input) => {
  const i = input as { ticketId: string; repoId: string | null };
  const t = ticketsDao.update(i.ticketId, { repoId: i.repoId });
  const full = attachLabels(t);
  emit("ticketUpdated", { ticket: full });
  if (i.repoId) {
    // Tickets default to backlog state; bump to queued and enqueue.
    if (full.status === "triage" || full.status === "backlog") {
      enqueueTicket(i.repoId, full.id);
    }
  }
  return full;
});

register("setStatus", async (input) => {
  const i = input as { ticketId: string; status: TicketStatus };
  const t = ticketsDao.update(i.ticketId, { status: i.status });
  const full = attachLabels(t);
  emit("ticketUpdated", { ticket: full });
  if (i.status === "done" || i.status === "discarded") notifyAllUnblocked();
  return full;
});

register("setPriority", async (input) => {
  const i = input as { ticketId: string; priority: Priority };
  const t = ticketsDao.update(i.ticketId, { priority: i.priority });
  const full = attachLabels(t);
  emit("ticketUpdated", { ticket: full });
  return full;
});

register("setEstimate", async (input) => {
  const i = input as { ticketId: string; estimate: Estimate };
  const t = ticketsDao.update(i.ticketId, { estimate: i.estimate });
  const full = attachLabels(t);
  emit("ticketUpdated", { ticket: full });
  return full;
});

register("setLabels", async (input) => {
  const i = input as { ticketId: string; labelIds: string[] };
  labelsDao.setForTicket(i.ticketId, i.labelIds);
  const t = ticketsDao.get(i.ticketId);
  if (t) emit("ticketUpdated", { ticket: attachLabels(t) });
});

register("setParent", async (input) => {
  const i = input as { ticketId: string; parentId: string | null };
  const t = ticketsDao.update(i.ticketId, { parentId: i.parentId });
  const full = attachLabels(t);
  emit("ticketUpdated", { ticket: full });
  return full;
});

register("deleteTicket", async (id) => {
  ticketsDao.delete(id as string);
  emit("ticketsBulkUpdated", { ids: [id as string] });
});

register("duplicateTicket", async (id) => {
  const t = ticketsDao.get(id as string);
  if (!t) throw new Error("ticket not found");
  const copy = ticketsDao.insert({
    title: t.title + " (copy)",
    description: t.description,
    descriptionMd: t.descriptionMd,
    repoId: t.repoId,
    priority: t.priority,
    estimate: t.estimate,
    status: "backlog",
  });
  const full = attachLabels(copy);
  emit("ticketUpdated", { ticket: full });
  return full;
});

register("bulkUpdate", async (input) => {
  const i = input as { ticketIds: string[]; patch: Partial<Ticket> };
  ticketsDao.bulkUpdate(i.ticketIds, i.patch);
  emit("ticketsBulkUpdated", { ids: i.ticketIds });
});

register("sendToBacklog", async (input) => {
  const ids = input as string[];
  ticketsDao.bulkUpdate(ids, { status: "backlog" });
  emit("ticketsBulkUpdated", { ids });
});

register("snoozeTicket", async (input) => {
  const i = input as { ticketId: string; untilMs: number };
  const t = ticketsDao.update(i.ticketId, {
    status: "snoozed",
    snoozeUntil: i.untilMs,
  });
  const full = attachLabels(t);
  emit("ticketUpdated", { ticket: full });
  return full;
});
