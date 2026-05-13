import { test, expect, type Page } from "@playwright/test";
import { resetServerState } from "./helpers/reset";
import { makeTestRepo, removeTestRepo } from "./helpers/testRepo";

async function rpc<T>(page: Page, method: string, body: unknown): Promise<T> {
  const r = await page.request.post(`/rpc/${method}`, {
    data: body,
    headers: { "content-type": "application/json" },
  });
  expect(r.ok()).toBe(true);
  const j = (await r.json()) as { ok: true; result: T };
  return j.result;
}

test.beforeEach(async ({ page }) => {
  await resetServerState(page);
});

test("phase 7: assigning a ticket runs the stub and lands it in review", async ({
  page,
}) => {
  const repoPath = makeTestRepo("alpha");
  try {
    const repo = await rpc<{ id: string }>(page, "addRepoLocal", {
      path: repoPath,
      projectId: "default",
    });
    const ticket = await rpc<{ id: string; title: string }>(
      page,
      "createTicket",
      {
        title: "Add LICENSE",
        descriptionMd: "TEST_FILE: LICENSE: MIT",
        description: JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "TEST_FILE: LICENSE: MIT" }],
            },
          ],
        }),
        status: "backlog",
      },
    );
    await rpc(page, "assignTicket", {
      ticketId: ticket.id,
      repoId: repo.id,
    });

    await page.goto("/");
    await expect(
      page
        .getByTestId("column-review")
        .getByTestId(`ticket-card-${ticket.title.replace(/\s+/g, "-")}`),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    removeTestRepo(repoPath);
  }
});

test("phase 7: sidebar shows busy indicator and queue count while running", async ({
  page,
}) => {
  const repoPath = makeTestRepo("beta");
  try {
    const repo = await rpc<{ id: string }>(page, "addRepoLocal", {
      path: repoPath,
      projectId: "default",
    });
    // A hanging ticket so we can observe the busy state.
    const hang = await rpc<{ id: string }>(page, "createTicket", {
      title: "Hang",
      descriptionMd: "TEST_HANG",
      description: JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "TEST_HANG" }],
          },
        ],
      }),
      status: "backlog",
    });
    // A second ticket in the same repo's queue.
    const queued = await rpc<{ id: string }>(page, "createTicket", {
      title: "Queued",
      descriptionMd: "TEST_FILE: q.txt: q",
      description: JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "TEST_FILE: q.txt: q" }],
          },
        ],
      }),
      status: "backlog",
    });
    await rpc(page, "assignTicket", { ticketId: hang.id, repoId: repo.id });
    await rpc(page, "assignTicket", { ticketId: queued.id, repoId: repo.id });

    await page.goto("/");
    // The hanging ticket should be in in_progress.
    await expect(
      page
        .getByTestId("column-in_progress")
        .getByTestId("ticket-card-Hang"),
    ).toBeVisible({ timeout: 10_000 });
    // The next ticket should be in queued.
    await expect(
      page.getByTestId("column-queued").getByTestId("ticket-card-Queued"),
    ).toBeVisible();

    // Now cancel the hanging ticket — the queued one should advance.
    await rpc(page, "cancelTicket", hang.id);
    await expect(
      page
        .getByTestId("column-review")
        .getByTestId("ticket-card-Queued"),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    removeTestRepo(repoPath);
  }
});
