import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: [
    {
      command: "bun run src/main/devbridge.ts",
      port: 5733,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: {
        TIDE_DATA_DIR: "./data/test",
        TIDE_DEBUG_RPC: "1",
      },
    },
    {
      command: "bun run dev:vite",
      port: PORT,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
