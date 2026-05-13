import { useEffect, useState } from "react";
import { rpc } from "./rpc";
import { AuthBanner } from "./components/AuthBanner";

export function App() {
  const [rpcOk, setRpcOk] = useState<"pending" | "ok" | "fail">("pending");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    rpc
      .health()
      .then((r) => {
        if (!cancelled) {
          setRpcOk("ok");
          setVersion(r.version);
        }
      })
      .catch(() => {
        if (!cancelled) setRpcOk("fail");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <AuthBanner />
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">Tide</h1>
          <p
            className="text-sm text-muted-foreground"
            data-testid="rpc-status"
          >
            {rpcOk === "pending"
              ? "RPC: connecting…"
              : rpcOk === "ok"
                ? `RPC: ok · v${version}`
                : "RPC: failed"}
          </p>
        </div>
      </div>
    </div>
  );
}
