import { test, expect } from "@playwright/test";

async function setAuth(
  page: import("@playwright/test").Page,
  state: { ok: boolean; reason?: string } | null,
) {
  const res = await page.request.post("/rpc/__setAuthOverride", {
    data: state,
    headers: { "content-type": "application/json" },
  });
  expect(res.ok()).toBe(true);
}

test.beforeEach(async ({ page }) => {
  // Make sure we start clean.
  await page.request.post("/rpc/__setAuthOverride", { data: null });
});

test("phase 3: AuthBanner reflects not-authenticated state", async ({
  page,
}) => {
  await setAuth(page, { ok: false, reason: "no-credentials" });
  await page.goto("/");
  await expect(page.getByTestId("auth-banner")).toBeVisible();
  await expect(page.getByTestId("auth-banner")).toContainText(
    /Not authenticated/i,
  );
});

test("phase 3: AuthBanner hides when authenticated", async ({ page }) => {
  await setAuth(page, { ok: true });
  await page.goto("/");
  await expect(page.getByTestId("rpc-status")).toContainText("RPC: ok");
  await expect(page.getByTestId("auth-banner")).toHaveCount(0);
});

test("phase 3: authStatus event updates banner live", async ({ page }) => {
  await setAuth(page, { ok: true });
  await page.goto("/");
  await expect(page.getByTestId("auth-banner")).toHaveCount(0);
  await setAuth(page, { ok: false, reason: "no-credentials" });
  await expect(page.getByTestId("auth-banner")).toBeVisible();
});
