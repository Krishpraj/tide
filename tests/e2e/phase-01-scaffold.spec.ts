import { test, expect } from "@playwright/test";

test("phase 1: app loads and RPC bridge responds", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tide" })).toBeVisible();
  await expect(page.getByTestId("rpc-status")).toContainText("RPC: ok");
});
