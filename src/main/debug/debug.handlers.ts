// Debug-only RPC. Only registered when TIDE_DEBUG_RPC=1 (dev/test).
import { register } from "../rpc/handlers";

if (Bun.env.TIDE_DEBUG_RPC === "1") {
  register("__noop", async () => ({ ok: true }));
}
