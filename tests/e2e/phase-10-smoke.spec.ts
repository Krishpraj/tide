import { test, expect } from "@playwright/test";
import { resetServerState } from "./helpers/reset";
import { makeTestRepo, removeTestRepo } from "./helpers/testRepo";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

test.beforeEach(async ({ page }) => {
  await resetServerState(page);
});

// One end-to-end happy path that touches every prior phase's surface — the
// shippable smoke. If this passes, every fundamental feature in Tide works.
test("phase 10: full lifecycle — add repo, create ticket, run, review, merge", async ({
  page,
}) => {
  const repoPath = makeTestRepo("smoke");
  try {
    await page.goto("/");
    // Auth banner reflects no creds in test env.
    await expect(page.getByTestId("auth-banner")).toBeVisible();

    // Add the repo via the dialog.
    await page.getByTestId("add-repo-button").click();
    await page.getByTestId("repo-path-input").fill(repoPath);
    await page.getByTestId("repo-add-local-submit").click();
    await expect(page.getByTestId("sidebar-repo-smoke")).toBeVisible();

    // Create a ticket via the inline composer (C).
    await page.keyboard.press("c");
    await page.getByTestId("new-ticket-title").fill("Add LICENSE");
    const editor = page.locator(
      '[data-testid="new-ticket-editor"] .ProseMirror',
    );
    await editor.click();
    await editor.type("TEST_FILE: LICENSE: MIT");
    await page.getByTestId("new-ticket-submit").click();
    await expect(page.getByTestId("ticket-card-Add-LICENSE")).toBeVisible();

    // Assign via the card menu.
    await page.getByTestId("ticket-card-Add-LICENSE").hover();
    await page
      .getByTestId("ticket-card-Add-LICENSE")
      .getByTestId("ticket-actions-trigger")
      .click();
    const repoMenuItem = page.getByTestId("ticket-menu-repo-smoke");
    await repoMenuItem.scrollIntoViewIfNeeded();
    await repoMenuItem.click({ force: true });

    // Wait for the ticket to reach `review` (not just `in_progress`).
    await expect
      .poll(
        async () => {
          const r = await page.request.post("/rpc/listTickets", {
            data: null,
            headers: { "content-type": "application/json" },
          });
          const j = (await r.json()) as { result: { title: string; status: string }[] };
          return j.result.find((t) => t.title === "Add LICENSE")?.status;
        },
        { timeout: 15_000 },
      )
      .toBe("review");
    await page.getByTestId("tab-Add-LICENSE").click();
    await expect(page.getByTestId("diff-view")).toContainText("LICENSE");

    // Merge.
    await page.getByTestId("review-merge").click();
    await page.getByTestId("review-merge-merge").click();

    // Tab closes, ticket lives in done.
    await expect(page.getByTestId("tab-Add-LICENSE")).toHaveCount(0);
    await expect(
      page.getByTestId("column-done").getByTestId("ticket-card-Add-LICENSE"),
    ).toBeVisible();

    // The notification bell shows we had at least one notification.
    await page.getByTestId("notification-bell").click();
    await expect(page.getByTestId("notification-popover")).toBeVisible();

    // Verify the merged LICENSE file exists on main.
    execSync("git checkout main", { cwd: repoPath });
    expect(existsSync(join(repoPath, "LICENSE"))).toBe(true);
  } finally {
    removeTestRepo(repoPath);
  }
});

test("phase 10: Vite webview build produces a dist", async () => {
  execSync("bun run build:webview", { cwd: process.cwd(), stdio: "ignore" });
  expect(existsSync("dist/webview/index.html")).toBe(true);
});
