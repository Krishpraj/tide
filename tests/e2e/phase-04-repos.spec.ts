import { test, expect } from "@playwright/test";
import { makeTestRepo, removeTestRepo } from "./helpers/testRepo";
import { resetServerState } from "./helpers/reset";

test.beforeEach(async ({ page }) => {
  await resetServerState(page);
});

test("phase 4: Default project exists in switcher", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("project-switcher")).toContainText("Default");
});

test("phase 4: create new project and switch to it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("project-switcher").click();
  await page.getByTestId("new-project-menu-item").click();
  await page.getByTestId("project-name-input").fill("Work");
  await page.getByTestId("project-create-submit").click();
  await expect(page.getByTestId("project-switcher")).toContainText("Work");
});

test("phase 4: attach a local git repo via Add Repo dialog", async ({
  page,
}) => {
  const repoPath = makeTestRepo("alpha");
  try {
    await page.goto("/");
    await page.getByTestId("add-repo-button").click();
    await expect(page.getByTestId("add-repo-dialog")).toBeVisible();
    // Local path tab is the default.
    await page.getByTestId("repo-path-input").fill(repoPath);
    await page.getByTestId("repo-add-local-submit").click();
    await expect(page.getByTestId("sidebar-repo-alpha")).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    removeTestRepo(repoPath);
  }
});

test("phase 4: clone a repo via Git URL tab", async ({ page }) => {
  // Use a local file:// URL pointing at a tmp repo so the test runs offline.
  const sourceRepo = makeTestRepo("upstream");
  try {
    await page.goto("/");
    await page.getByTestId("add-repo-button").click();
    await page.getByRole("tab", { name: "Git URL" }).click();
    // file:// URL works for git clone on Windows.
    const fileUrl = "file:///" + sourceRepo.replace(/\\/g, "/");
    await page.getByTestId("repo-url-input").fill(fileUrl);
    await page.getByTestId("repo-add-clone-submit").click();
    await expect(page.getByTestId("sidebar-repo-upstream")).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    removeTestRepo(sourceRepo);
  }
});

test("phase 4: repo not visible after switching project", async ({ page }) => {
  const repoPath = makeTestRepo("alpha");
  try {
    await page.goto("/");
    // Add to Default project.
    await page.getByTestId("add-repo-button").click();
    await page.getByTestId("repo-path-input").fill(repoPath);
    await page.getByTestId("repo-add-local-submit").click();
    await expect(page.getByTestId("sidebar-repo-alpha")).toBeVisible();
    // Create a new project and switch.
    await page.getByTestId("project-switcher").click();
    await page.getByTestId("new-project-menu-item").click();
    await page.getByTestId("project-name-input").fill("Other");
    await page.getByTestId("project-create-submit").click();
    await expect(page.getByTestId("project-switcher")).toContainText("Other");
    await expect(page.getByTestId("sidebar-repo-alpha")).toHaveCount(0);
    // Switch back.
    await page.getByTestId("project-switcher").click();
    await page.getByTestId("project-menu-item-Default").click();
    await expect(page.getByTestId("sidebar-repo-alpha")).toBeVisible();
  } finally {
    removeTestRepo(repoPath);
  }
});
