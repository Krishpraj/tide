import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { emit } from "../rpc/events";
import type { AuthStatus } from "@shared/types";

// In tests we sometimes want to force the auth state regardless of environment.
// Only honored when TIDE_DEBUG_RPC=1.
let override: AuthStatus | null = null;
export function setAuthOverride(value: AuthStatus | null) {
  if (Bun.env.TIDE_DEBUG_RPC !== "1") return;
  override = value;
  emit("authStatus", getAuthStatus());
}

export function getAuthStatus(): AuthStatus {
  if (override) return override;
  if (Bun.env.ANTHROPIC_API_KEY && Bun.env.ANTHROPIC_API_KEY.length > 0) {
    return { ok: true };
  }
  const credsPath = join(homedir(), ".claude", "credentials.json");
  if (existsSync(credsPath)) return { ok: true };
  return { ok: false, reason: "no-credentials" };
}

let lastStatus: AuthStatus | null = null;
let stopHandle: ReturnType<typeof setInterval> | null = null;

export function startAuthPolling() {
  if (stopHandle) return;
  const tick = () => {
    const status = getAuthStatus();
    if (
      !lastStatus ||
      lastStatus.ok !== status.ok ||
      lastStatus.reason !== status.reason
    ) {
      lastStatus = status;
      emit("authStatus", status);
    }
  };
  tick();
  stopHandle = setInterval(tick, 30_000);
}
