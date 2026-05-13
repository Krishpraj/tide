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

  // 1) Explicit env vars.
  if (Bun.env.ANTHROPIC_API_KEY && Bun.env.ANTHROPIC_API_KEY.length > 0) {
    return { ok: true };
  }
  if (
    Bun.env.CLAUDE_CODE_OAUTH_TOKEN &&
    Bun.env.CLAUDE_CODE_OAUTH_TOKEN.length > 0
  ) {
    return { ok: true };
  }

  // 2) Known credential file locations (varies by Claude Code version + OS).
  const home = homedir();
  const candidates = [
    join(home, ".claude", ".credentials.json"),
    join(home, ".claude", "credentials.json"),
    join(home, ".claude.json"),
  ];
  if (Bun.env.APPDATA) {
    candidates.push(
      join(Bun.env.APPDATA, "Claude", "credentials.json"),
      join(Bun.env.APPDATA, "Claude", ".credentials.json"),
    );
  }
  for (const p of candidates) {
    if (existsSync(p)) return { ok: true };
  }

  // 3) If the `claude` binary is on PATH, trust the user — they ran
  //    `claude login`, and Claude Code may store creds in the OS keychain
  //    (which is invisible to us from here on Windows / macOS).
  if (Bun.which("claude")) return { ok: true };

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
