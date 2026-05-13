// Helpers shared across e2e specs to reset server-side state between tests.

import type { Page } from "@playwright/test";

const TABLES = [
  "ticket_events",
  "claude_sessions",
  "ticket_comments",
  "ticket_links",
  "ticket_labels",
  "tickets",
  "ticket_templates",
  "labels",
  "notifications",
  "saved_views",
  "app_settings",
  "repos",
  "projects",
];

export async function resetServerState(page: Page) {
  await page.request.post("/rpc/__resetDb");
  await page.request.post("/rpc/__setAuthOverride", { data: null });
}
