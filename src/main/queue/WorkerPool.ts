import { RepoWorker } from "./RepoWorker";
import { eventsDao, reposDao, ticketsDao } from "../db/dao";
import { emit } from "../rpc/events";

const workers = new Map<string, RepoWorker>();

export function getWorker(repoId: string): RepoWorker {
  let w = workers.get(repoId);
  if (!w) {
    w = new RepoWorker(repoId);
    workers.set(repoId, w);
  }
  return w;
}

export function enqueueTicket(repoId: string, ticketId: string) {
  getWorker(repoId).enqueue(ticketId);
}

export function cancelTicket(ticketId: string) {
  const t = ticketsDao.get(ticketId);
  if (!t || !t.repoId) return;
  const w = workers.get(t.repoId);
  w?.cancel(ticketId);
}

/** Called when a ticket transitions to `done` — wake every worker so any
 *  blocked tickets can proceed. */
export function notifyAllUnblocked() {
  for (const w of workers.values()) w.onSomeTicketUnblocked();
}

/** App-boot recovery: previously in_progress tickets get marked failed
 *  (their Bun process is gone). Queued tickets get re-enqueued. */
export function startWorkers() {
  const inProgress = ticketsDao.list({ status: "in_progress" });
  for (const t of inProgress) {
    ticketsDao.update(t.id, { status: "failed" });
    eventsDao.insert({
      ticketId: t.id,
      kind: "error",
      payload: { reason: "app_restart" },
    });
    emit("ticketUpdated", {
      ticket: ticketsDao.withLabels(ticketsDao.get(t.id)!),
    });
  }
  const queued = ticketsDao.list({ status: "queued" });
  for (const t of queued) {
    if (t.repoId) enqueueTicket(t.repoId, t.id);
  }
  // Pre-create a worker per repo so workerStatus events fire on UI mount.
  for (const r of reposDao.list()) getWorker(r.id);
}
