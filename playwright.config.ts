import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const BRIDGE_PORT = Number(process.env.TIDE_PORT ?? 5734);

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
      port: BRIDGE_PORT,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: {
        TIDE_DATA_DIR: "./data/test",
        TIDE_DEBUG_RPC: "1",
        TIDE_RUNNER: "stub",
        TIDE_PORT: String(BRIDGE_PORT),
      },
    },
    {
      command: "bun run dev:vite",
      port: PORT,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
      env: { TIDE_PORT: String(BRIDGE_PORT) },
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
