import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { rpc } from "../rpc";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import type { AuthStatus } from "@shared/types";

export function AuthBanner() {
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    rpc.getAuthStatus().then(setStatus);
    const off = rpc.on("authStatus", (s) => setStatus(s));
    return off;
  }, []);

  if (!status || status.ok) return null;

  return (
    <Alert
      variant="destructive"
      role="banner"
      aria-label="not authenticated"
      data-testid="auth-banner"
      className="rounded-none border-x-0 border-t-0"
    >
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Not authenticated with Claude</AlertTitle>
      <AlertDescription>
        Run <code className="font-mono">claude login</code> in your terminal or
        set <code className="font-mono">ANTHROPIC_API_KEY</code> to enable
        ticket execution.
      </AlertDescription>
    </Alert>
  );
}
