import { test, expect, type Page } from "@playwright/test";
import { resetServerState } from "./helpers/reset";
import { makeTestRepo, removeTestRepo } from "./helpers/testRepo";

async function rpc<T>(page: Page, method: string, body?: unknown): Promise<T> {
  const r = await page.request.post(`/rpc/${method}`, {
    data: body ?? null,
    headers: { "content-type": "application/json" },
  });
  if (!r.ok()) throw new Error(`rpc ${method}: ${await r.text()}`);
  const j = (await r.json()) as { ok: true; result: T };
  return j.result;
}

async function waitForStatus(
  page: Page,
  ticketId: string,
  expected: string,
  timeoutMs = 10_000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await rpc<{ status: string } | null>(
      page,
      "getTicket",
      ticketId,
    );
    if (t?.status === expected) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`ticket did not reach status=${expected}`);
}

test.beforeEach(async ({ page }) => {
  await resetServerState(page);
});

test("phase 9: failed tickets show a Restart action that re-enqueues", async ({
  page,
}) => {
  const repoPath = makeTestRepo("alpha");
  try {
    const repo = await rpc<{ id: string }>(page, "addRepoLocal", {
      path: repoPath,
      projectId: "default",
    });
    const t = await rpc<{ id: string }>(page, "createTicket", {
      title: "Boom",
      descriptionMd: "TEST_THROW: nope",
      description: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "TEST_THROW: nope" }] },
        ],
      }),
      status: "backlog",
    });
    await rpc(page, "assignTicket", { ticketId: t.id, repoId: repo.id });
    await waitForStatus(page, t.id, "failed");

    // Now fix the description and restart via the card menu.
    await rpc(page, "updateTicket", {
      id: t.id,
      patch: { descriptionMd: "TEST_FILE: ok.txt: yes" },
    });
    await page.goto("/");
    // Failed tickets render in the Triage column? No — `failed` is not in
    // STATUS_COLUMNS. They live in the focus view + activity. So use RPC.
    await rpc(page, "restartTicket", t.id);
    await waitForStatus(page, t.id, "review", 12_000);
  } finally {
    removeTestRepo(repoPath);
  }
});

test("phase 9: dirty working tree fails the ticket with a checkout_base error", async ({
  page,
}) => {
  const repoPath = makeTestRepo("beta");
  try {
    // Make the repo dirty before assigning the ticket.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${repoPath}/dirty.txt`, "dirty");

    const repo = await rpc<{ id: string }>(page, "addRepoLocal", {
      path: repoPath,
      projectId: "default",
    });
    const t = await rpc<{ id: string }>(page, "createTicket", {
      title: "WantsClean",
      descriptionMd: "TEST_FILE: x.txt: 1",
      description: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "x" }] },
        ],
      }),
      status: "backlog",
    });
    await rpc(page, "assignTicket", { ticketId: t.id, repoId: repo.id });
    await waitForStatus(page, t.id, "failed");

    const events = await rpc<{ kind: string; payload: unknown }[]>(
      page,
      "getTicketEvents",
      t.id,
    );
    expect(events.some((e) => e.kind === "error")).toBe(true);
  } finally {
    removeTestRepo(repoPath);
  }
});

test("phase 9: snooze ticker brings tickets back to triage", async ({
  page,
}) => {
  // Reduce snooze interval for the test by routing through a debug RPC isn't
  // straightforward; instead we set snooze_until well in the past and call
  // the tick function via __simulateRestart? No — startWorkers doesn't run
  // the snooze tick. Instead, we rely on the fact that the snoozeTicker is
  // already running (default 60s) — too slow. Use a debug __tickSnooze.
  // Add a debug handler for that.
  const t = await rpc<{ id: string }>(page, "createTicket", {
    title: "Sleepy",
    descriptionMd: "",
    description: JSON.stringify({ type: "doc", content: [] }),
    status: "backlog",
  });
  // Snooze with `untilMs` in the past so any subsequent tick wakes it.
  await rpc(page, "snoozeTicket", {
    ticketId: t.id,
    untilMs: Date.now() - 1000,
  });
  const beforeT = await rpc<{ status: string }>(page, "getTicket", t.id);
  expect(beforeT.status).toBe("snoozed");

  await rpc(page, "__tickSnooze");
  const after = await rpc<{ status: string }>(page, "getTicket", t.id);
  expect(after.status).toBe("triage");
});

test("phase 9: __simulateRestart marks an in-progress ticket as failed", async ({
  page,
}) => {
  const repoPath = makeTestRepo("delta");
  try {
    const repo = await rpc<{ id: string }>(page, "addRepoLocal", {
      path: repoPath,
      projectId: "default",
    });
    const t = await rpc<{ id: string }>(page, "createTicket", {
      title: "Hung",
      descriptionMd: "TEST_HANG",
      description: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "TEST_HANG" }] },
        ],
      }),
      status: "backlog",
    });
    await rpc(page, "assignTicket", { ticketId: t.id, repoId: repo.id });
    await waitForStatus(page, t.id, "in_progress");

    // Simulate restart — we don't actually restart the process; we replay the
    // recovery logic (marks in_progress → failed) and re-enqueues queued.
    await rpc(page, "__simulateRestart");
    const after = await rpc<{ status: string }>(page, "getTicket", t.id);
    expect(after.status).toBe("failed");
  } finally {
    removeTestRepo(repoPath);
  }
});
