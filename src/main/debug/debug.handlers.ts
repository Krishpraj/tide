// Debug-only RPC. Only registered when TIDE_DEBUG_RPC=1 (dev/test).
import { register } from "../rpc/handlers";
import { setAuthOverride } from "../auth/check";
import type { AuthStatus } from "@shared/types";

if (Bun.env.TIDE_DEBUG_RPC === "1") {
  register("__noop", async () => ({ ok: true }));

  // Force auth state for e2e tests. Pass null to clear.
  register("__setAuthOverride", async (input) => {
    const v = input as AuthStatus | null;
    setAuthOverride(v ?? null);
  });
}
