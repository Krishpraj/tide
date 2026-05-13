// RPC actions for the review-tab lifecycle: cancel, merge, change-more,
// discard, commit-local-edits, refreshDiff. Diff fetching also lives here so
// it's grouped with the review flow.

import { register } from "../rpc/handlers";
import { ticketsDao, reposDao, eventsDao, sessionsDao, linksDao } from "../db/dao";
import { emit } from "../rpc/events";
import { cancelTicket as poolCancel, getWorker, notifyAllUnblocked } from "./WorkerPool";
import { setIterateOverride } from "./iterateBus";
import {
  checkoutBase,
  commitAll,
  deleteBranch,
  diffAgainstBase,
  GitError,
  mergeBranch,
} from "../git/ops";

register("cancelTicket", async (ticketId) => {
  poolCancel(ticketId as string);
});

register("getDiff", async (ticketId) => {
  const t = ticketsDao.get(ticketId as string);
  if (!t || !t.repoId || !t.branchName || !t.baseBranch) return "";
  const r = reposDao.get(t.repoId);
  if (!r) return "";
  try {
    return await diffAgainstBase(r.path, t.baseBranch, t.branchName);
  } catch {
    return "";
  }
});

register("refreshDiff", async (ticketId) => {
  return await (
    await import("../rpc/handlers")
  ).callHandler("getDiff", ticketId);
});

register("mergeTicket", async (input) => {
  const i = input as { ticketId: string; strategy: "merge" | "squash" };
  const t = ticketsDao.get(i.ticketId);
  if (!t || !t.repoId || !t.branchName || !t.baseBranch) {
    throw new Error("ticket has no branch");
  }
  const r = reposDao.get(t.repoId);
  if (!r) throw new Error("repo missing");
  await checkoutBase(r.path, t.baseBranch);
  await mergeBranch(r.path, t.branchName, i.strategy, t.title);
  await deleteBranch(r.path, t.branchName, true).catch(() => {
    // ignore — branch may already be gone
  });
  const updated = ticketsDao.update(t.id, { status: "done" });
  emit("ticketUpdated", { ticket: ticketsDao.withLabels(updated) });
  eventsDao.insert({
    ticketId: t.id,
    kind: "merged",
    payload: { strategy: i.strategy },
  });
  notifyAllUnblocked();
  return ticketsDao.withLabels(updated);
});

register("discardTicket", async (ticketId) => {
  const t = ticketsDao.get(ticketId as string);
  if (!t || !t.repoId || !t.branchName) {
    const updated = ticketsDao.update(ticketId as string, {
      status: "discarded",
    });
    emit("ticketUpdated", { ticket: ticketsDao.withLabels(updated) });
    return ticketsDao.withLabels(updated);
  }
  const r = reposDao.get(t.repoId);
  if (r && t.baseBranch) {
    await checkoutBase(r.path, t.baseBranch).catch(() => {});
    await deleteBranch(r.path, t.branchName, true).catch(() => {});
  }
  const updated = ticketsDao.update(t.id, { status: "discarded" });
  emit("ticketUpdated", { ticket: ticketsDao.withLabels(updated) });
  eventsDao.insert({
    ticketId: t.id,
    kind: "discarded",
    payload: {},
  });
  notifyAllUnblocked();
  return ticketsDao.withLabels(updated);
});

register("iterateTicket", async (input) => {
  const i = input as {
    ticketId: string;
    instructions: string;
    instructionsMd?: string;
  };
  const t = ticketsDao.get(i.ticketId);
  if (!t || !t.repoId) throw new Error("ticket has no repo");
  const session = sessionsDao.latestForTicket(t.id);
  eventsDao.insert({
    ticketId: t.id,
    kind: "iterate",
    payload: { instructionsMd: i.instructionsMd ?? "" },
  });
  setIterateOverride(t.id, {
    extra: i.instructionsMd ?? i.instructions,
    resumeSessionId: session?.sdkSessionId ?? null,
  });
  ticketsDao.update(t.id, { status: "queued" });
  getWorker(t.repoId).enqueue(t.id);
});

register("restartTicket", async (ticketId) => {
  const t = ticketsDao.get(ticketId as string);
  if (!t || !t.repoId) throw new Error("ticket has no repo");
  // Reset branch info; the worker will create a fresh branch.
  const updated = ticketsDao.update(t.id, {
    status: "queued",
    branchName: null,
  });
  emit("ticketUpdated", { ticket: ticketsDao.withLabels(updated) });
  getWorker(t.repoId).enqueue(t.id);
});

register("commitLocalEdits", async (input) => {
  const i = input as { ticketId: string; message: string };
  const t = ticketsDao.get(i.ticketId);
  if (!t || !t.repoId) throw new Error("ticket has no repo");
  const r = reposDao.get(t.repoId);
  if (!r) throw new Error("repo missing");
  const result = await commitAll(r.path, i.message);
  if (result.committed) {
    eventsDao.insert({
      ticketId: t.id,
      kind: "manual_commit",
      payload: { sha: result.sha, message: i.message },
    });
  }
  return result;
});

// Keep references so unused-imports rule doesn't complain.
void GitError;
void linksDao;
