import { test, expect, type Page } from "@playwright/test";
import { resetServerState } from "./helpers/reset";

test.beforeEach(async ({ page }) => {
  await resetServerState(page);
});

async function createTicket(page: Page, title: string, opts: {
  priority?: number;
  status?: string;
  description?: string;
} = {}) {
  const res = await page.request.post("/rpc/createTicket", {
    data: {
      title,
      description: JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: opts.description ?? title }],
          },
        ],
      }),
      descriptionMd: opts.description ?? title,
      priority: opts.priority ?? 0,
      status: opts.status ?? "backlog",
    },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok()).toBe(true);
}

test("phase 5: press C to focus the new ticket composer", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="board"]');
  await page.keyboard.press("c");
  await expect(page.getByTestId("new-ticket-title")).toBeFocused();
});

test("phase 5: create a ticket via the inline composer", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("c");
  await page.getByTestId("new-ticket-title").fill("Wire up settings page");
  await page.getByTestId("new-ticket-submit").click();
  await expect(
    page.getByTestId("ticket-card-Wire-up-settings-page"),
  ).toBeVisible();
});

test("phase 5: TipTap markdown shortcut creates a bullet list", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("c");
  await page.getByTestId("new-ticket-title").fill("With a list");
  const editor = page.locator('[data-testid="new-ticket-editor"] .ProseMirror');
  await editor.click();
  await editor.type("- first item");
  // After pressing space after "-", TipTap converts to a bullet list.
  await expect(editor.locator("ul li")).toContainText("first item");
});

test("phase 5: status icon and priority icon render on card", async ({
  page,
}) => {
  await createTicket(page, "Hello", { priority: 3, status: "backlog" });
  await page.goto("/");
  const card = page.getByTestId("ticket-card-Hello");
  await expect(card).toBeVisible();
  await expect(card.locator("svg[data-priority='3']")).toBeVisible();
});

test("phase 5: status change via card menu moves it across columns", async ({
  page,
}) => {
  await createTicket(page, "Movey", { status: "backlog" });
  await page.goto("/");
  await page.getByTestId("ticket-card-Movey").hover();
  await page.getByTestId("ticket-card-Movey").getByTestId("ticket-actions-trigger").click();
  await page.getByTestId("ticket-menu-status-in_progress").click();
  // It should now appear inside the in_progress column.
  await expect(
    page.getByTestId("column-in_progress").getByTestId("ticket-card-Movey"),
  ).toBeVisible();
});

test("phase 5: Group by priority rebuilds columns", async ({ page }) => {
  await createTicket(page, "A", { priority: 4, status: "backlog" });
  await createTicket(page, "B", { priority: 1, status: "backlog" });
  await page.goto("/");
  await page.getByTestId("board-group-trigger").click();
  await page.getByTestId("board-group-priority").click();
  await expect(page.locator("[data-testid='board']")).toHaveAttribute(
    "data-group-by",
    "priority",
  );
  await expect(
    page.getByTestId("column-priority-4").getByTestId("ticket-card-A"),
  ).toBeVisible();
  await expect(
    page.getByTestId("column-priority-1").getByTestId("ticket-card-B"),
  ).toBeVisible();
});

test("phase 5: filter by status to a single column's worth of cards", async ({
  page,
}) => {
  await createTicket(page, "Open", { status: "backlog" });
  await createTicket(page, "Reviewing", { status: "review" });
  await page.goto("/");
  await page.getByTestId("board-filter-trigger").click();
  await page.getByTestId("board-filter-status-review").click();
  await expect(page.getByTestId("chip-status")).toBeVisible();
  await expect(page.getByTestId("ticket-card-Reviewing")).toBeVisible();
  await expect(page.getByTestId("ticket-card-Open")).toHaveCount(0);
});

test("phase 5: save view appears in command palette", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("board-save-view").click();
  await page.getByTestId("save-view-name").fill("My reviews");
  await page.getByTestId("save-view-submit").click();
  // Open command palette with ⌘K.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
  await expect(page.getByTestId("cmd-view-My-reviews")).toBeVisible();
});

test("phase 5: T toggles theme", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="board"]');
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.keyboard.press("t");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.keyboard.press("t");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("phase 5: ? opens the shortcuts cheatsheet", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('[data-testid="board"]');
  await page.keyboard.press("?");
  await expect(page.getByTestId("cheatsheet")).toBeVisible();
  await expect(
    page.getByTestId("cheatsheet").getByText("Create a new ticket"),
  ).toBeVisible();
});

test("phase 5: ⌘P opens the quick switcher and jumps to a ticket", async ({
  page,
}) => {
  await createTicket(page, "Wire up the dashboard");
  await page.goto("/");
  await page.waitForSelector('[data-testid="board"]');
  await page.keyboard.press("ControlOrMeta+p");
  await expect(page.getByTestId("quick-switcher")).toBeVisible();
  await page.getByTestId("quick-switcher-input").fill("dashb");
  await expect(
    page.getByTestId("qs-ticket-Wire-up-the-dashboard"),
  ).toBeVisible();
});

test("phase 5: F opens the focus view", async ({ page }) => {
  await createTicket(page, "Active", { status: "in_progress" });
  await page.goto("/");
  await page.waitForSelector('[data-testid="board"]');
  await page.keyboard.press("f");
  await expect(page.getByTestId("focus-view")).toBeVisible();
});

test("phase 5: bulk action bar appears with shift-click", async ({ page }) => {
  await createTicket(page, "A");
  await createTicket(page, "B");
  await createTicket(page, "C");
  await page.goto("/");
  await page.getByTestId("ticket-card-A").click({ modifiers: ["Shift"] });
  await page.getByTestId("ticket-card-B").click({ modifiers: ["Shift"] });
  await page.getByTestId("ticket-card-C").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("bulk-action-bar")).toBeVisible();
  await page.getByTestId("bulk-priority").click();
  await page.getByTestId("bulk-priority-2").click();
  // After bulk update, every card should now show priority 2 icon.
  await expect(
    page.getByTestId("ticket-card-A").locator("svg[data-priority='2']"),
  ).toBeVisible();
  await expect(
    page.getByTestId("ticket-card-B").locator("svg[data-priority='2']"),
  ).toBeVisible();
  await expect(
    page.getByTestId("ticket-card-C").locator("svg[data-priority='2']"),
  ).toBeVisible();
});

test("phase 5: triage→backlog via card status menu", async ({ page }) => {
  await createTicket(page, "Inboxed", { status: "triage" });
  await page.goto("/");
  await expect(
    page.getByTestId("column-triage").getByTestId("ticket-card-Inboxed"),
  ).toBeVisible();
  await page.getByTestId("ticket-card-Inboxed").hover();
  await page
    .getByTestId("ticket-card-Inboxed")
    .getByTestId("ticket-actions-trigger")
    .click();
  await page.getByTestId("ticket-menu-status-backlog").click();
  await expect(
    page.getByTestId("column-backlog").getByTestId("ticket-card-Inboxed"),
  ).toBeVisible();
});
