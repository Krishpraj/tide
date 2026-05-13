import type { Ticket, Repo } from "@shared/types";

export interface RunForTicketOpts {
  signal: AbortSignal;
  resumeSessionId?: string | null;
  extraPrompt?: string;
  maxTurns?: number;
}

export interface RunForTicketResult {
  sdkSessionId: string;
  ok: boolean;
  canceled?: boolean;
  error?: string;
}

export type RunForTicket = (
  ticket: Ticket,
  repo: Repo,
  opts: RunForTicketOpts,
) => Promise<RunForTicketResult>;
