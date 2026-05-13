import { useEffect } from "react";
import { useStore } from "./store";
import { AuthBanner } from "./components/AuthBanner";
import { Sidebar } from "./components/Sidebar";

export function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const bootstrapped = useStore((s) => s.bootstrapped);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <AuthBanner />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">Tide</h1>
              <p
                className="text-xs text-muted-foreground"
                data-testid="rpc-status"
              >
                {bootstrapped
                  ? "RPC: ok · v0.1.0"
                  : "RPC: connecting…"}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
