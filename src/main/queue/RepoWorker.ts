// Per-repo FIFO worker. Honors priority and blocked-by links: the next ticket
// dequeued is the one with highest priority whose blockers are all done.

import {
  eventsDao,
  linksDao,
  notificationsDao,
  reposDao,
  ticketsDao,
} from "../db/dao";
import { emit } from "../rpc/events";
import { runForTicket } from "../claude/runner";
import { takeIterateOverride } from "./iterateBus";
import {
  checkoutBase,
  commitAll,
  createBranch,
  GitError,
} from "../git/ops";
import { ulid } from "ulid";
import type { Estimate, Repo, Ticket, TicketStatus } from "@shared/types";

function maxTurnsFor(estimate: Estimate): number {
  switch (estimate) {
    case "XS":
      return 8;
    case "S":
      return 15;
    case "M":
      return 25;
    case "L":
      return 40;
    case "XL":
      return 60;
    default:
      return 25;
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export class RepoWorker {
  private pending = new Set<string>();
  private running = false;
  private currentAbort: AbortController | null = null;
  currentTicketId: string | null = null;

  constructor(public readonly repoId: string) {}

  enqueue(ticketId: string) {
    this.pending.add(ticketId);
    const t = ticketsDao.get(ticketId);
    if (t && t.status !== "in_progress") {
      const updated = ticketsDao.update(ticketId, { status: "queued" });
      emit("ticketUpdated", {
        ticket: ticketsDao.withLabels(updated),
      });
    }
    this.emitStatus();
    void this.tick();
  }

  cancel(ticketId: string) {
    if (this.currentTicketId === ticketId && this.currentAbort) {
      this.currentAbort.abort();
    } else {
      this.pending.delete(ticketId);
    }
  }

  /** Called by the pool when a ticket reaches `done`, in case a blocked
   *  ticket waiting in this worker's queue is now eligible. */
  onSomeTicketUnblocked() {
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const id = this.pickNext();
        if (!id) break;
        this.pending.delete(id);
        await this.runOne(id);
      }
    } finally {
      this.running = false;
      this.currentTicketId = null;
      this.currentAbort = null;
      this.emitStatus();
    }
  }

  private pickNext(): string | null {
    if (this.pending.size === 0) return null;
    const tickets: Ticket[] = [];
    for (const id of this.pending) {
      const t = ticketsDao.get(id);
      if (!t) continue;
      // Skip if any blocker is not done/discarded.
      const blockers = linksDao.blockersOf(t.id);
      const blocked = blockers.some((l) => {
        const b = ticketsDao.get(l.toTicket);
        return !!b && b.status !== "done" && b.status !== "discarded";
      });
      if (blocked) continue;
      tickets.push(t);
    }
    if (tickets.length === 0) return null;
    tickets.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });
    return tickets[0]!.id;
  }

  private async runOne(ticketId: string): Promise<void> {
    const t = ticketsDao.get(ticketId);
    const repo = reposDao.get(this.repoId);
    if (!t || !repo) return;

    const abort = new AbortController();
    this.currentAbort = abort;
    this.currentTicketId = t.id;

    const isIterate = !!t.branchName;
    const override = takeIterateOverride(t.id);
    const branchName = isIterate
      ? t.branchName!
      : `tide/${slugify(t.title)}-${ulid().slice(-6).toLowerCase()}`;

    // status → in_progress
    let updated = ticketsDao.update(t.id, {
      status: "in_progress",
      branchName,
      baseBranch: t.baseBranch ?? repo.baseBranch,
    });
    emit("ticketUpdated", { ticket: ticketsDao.withLabels(updated) });
    eventsDao.insert({
      ticketId: t.id,
      kind: "status_change",
      payload: { status: "in_progress" },
    });
    this.emitStatus();

    try {
      if (!isIterate) {
        // If the working tree is dirty, auto-stash so we don't lose the user's
        // WIP. They can recover it later with `git stash pop` on the original
        // branch; we notify them so it's not surprising.
        const { isDirty, runGit } = await import("../git/ops");
        if (await isDirty(repo.path)) {
          const stashLabel = `tide:${t.id}`;
          try {
            await runGit(
              ["stash", "push", "--include-untracked", "-m", stashLabel],
              { cwd: repo.path },
            );
            eventsDao.insert({
              ticketId: t.id,
              kind: "git",
              payload: { action: "auto_stash", label: stashLabel },
            });
            const n = notificationsDao.insert({
              ticketId: t.id,
              kind: "auto_stashed",
              title: `Auto-stashed WIP in ${repo.name}`,
              body: `Run \`git stash pop\` in the repo to restore (label: ${stashLabel}).`,
            });
            emit("notificationCreated", { notification: n });
          } catch (err) {
            return this.markFailed(t, "auto_stash", err);
          }
        }
        try {
          await checkoutBase(repo.path, repo.baseBranch);
        } catch (err) {
          return this.markFailed(t, "checkout_base", err);
        }
        try {
          await createBranch(repo.path, branchName);
        } catch (err) {
          return this.markFailed(t, "create_branch", err);
        }
      } else {
        // Iteration: ensure we're on the existing branch.
        try {
          await (await import("../git/ops")).runGit(["checkout", branchName], {
            cwd: repo.path,
          });
        } catch (err) {
          return this.markFailed(t, "checkout_branch", err);
        }
      }

      const result = await runForTicket(t, repo, {
        signal: abort.signal,
        resumeSessionId: override?.resumeSessionId ?? null,
        extraPrompt: override?.extra,
        maxTurns: maxTurnsFor(t.estimate),
      });

      const commit = await commitAll(repo.path, t.title).catch(() => ({
        committed: false,
      }));

      if (result.canceled) {
        // If nothing committed, treat as canceled; otherwise drop into review.
        const next: TicketStatus = commit.committed ? "review" : "canceled";
        updated = ticketsDao.update(t.id, { status: next });
        emit("ticketUpdated", { ticket: ticketsDao.withLabels(updated) });
        eventsDao.insert({
          ticketId: t.id,
          kind: "canceled",
          payload: { committedPartial: commit.committed },
        });
        notificationsDao.insert({
          ticketId: t.id,
          kind: "canceled",
          title: `Canceled: ${t.title}`,
        });
        emit("notificationCreated", {
          notification: notificationsDao.list().find(
            (n) =>
              n.kind === "canceled" &&
              n.ticketId === t.id &&
              n.readAt === null,
          )!,
        });
        return;
      }

      if (!result.ok) {
        return this.markFailed(t, "runner_error", result.error ?? "unknown");
      }

      const next: TicketStatus = commit.committed ? "review" : "done";
      updated = ticketsDao.update(t.id, { status: next });
      emit("ticketUpdated", { ticket: ticketsDao.withLabels(updated) });
      eventsDao.insert({
        ticketId: t.id,
        kind: "status_change",
        payload: { status: next, branch: branchName },
      });
      const notif = notificationsDao.insert({
        ticketId: t.id,
        kind: next === "review" ? "review_ready" : "done_no_changes",
        title:
          next === "review"
            ? `Review ready: ${t.title}`
            : `Completed (no changes): ${t.title}`,
      });
      emit("notificationCreated", { notification: notif });
    } catch (err) {
      this.markFailed(t, "uncaught", err);
    }
  }

  private markFailed(t: Ticket, reason: string, err: unknown): void {
    const message = err instanceof GitError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
    const updated = ticketsDao.update(t.id, { status: "failed" });
    emit("ticketUpdated", { ticket: ticketsDao.withLabels(updated) });
    eventsDao.insert({
      ticketId: t.id,
      kind: "error",
      payload: { reason, message },
    });
    const notif = notificationsDao.insert({
      ticketId: t.id,
      kind: "failed",
      title: `Failed: ${t.title}`,
      body: message,
    });
    emit("notificationCreated", { notification: notif });
  }

  private emitStatus() {
    emit("workerStatus", {
      repoId: this.repoId,
      busy: this.running,
      queueLength: this.pending.size,
      currentTicketId: this.currentTicketId,
    });
  }
}
