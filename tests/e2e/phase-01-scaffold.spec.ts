import { test, expect } from "@playwright/test";

test("phase 1: app loads and RPC bridge responds", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await expect(page.getByTestId("tide-brand")).toBeVisible();
  const health = await page.request.post("/rpc/health", {
    data: {},
    headers: { "content-type": "application/json" },
  });
  expect(health.ok()).toBe(true);
  const body = await health.json();
  expect(body.ok).toBe(true);
  expect(body.result?.ok).toBe(true);
});
