// Production Claude runner using @anthropic-ai/claude-agent-sdk.
//
// In tests we swap this for `stubRunner.ts` via the TIDE_RUNNER env var.
// The dispatcher `runForTicket` below picks the right implementation.

import type { Ticket, Repo } from "@shared/types";
import { emit } from "../rpc/events";
import { eventsDao, sessionsDao } from "../db/dao";
import type {
  RunForTicketOpts,
  RunForTicketResult,
} from "./runner-types";
import { runForTicketStub } from "./stubRunner";

const useStub = Bun.env.TIDE_RUNNER === "stub";

export async function runForTicket(
  ticket: Ticket,
  repo: Repo,
  opts: RunForTicketOpts,
): Promise<RunForTicketResult> {
  if (useStub) return runForTicketStub(ticket, repo, opts);
  return runForTicketProd(ticket, repo, opts);
}

async function runForTicketProd(
  ticket: Ticket,
  repo: Repo,
  opts: RunForTicketOpts,
): Promise<RunForTicketResult> {
  // Lazy-import so test runs don't pull in the SDK (and so its CLI download is
  // deferred). The SDK isn't required for the stub-driven Phase 7 tests.
  const sdk = await import("@anthropic-ai/claude-agent-sdk").catch(() => null);
  if (!sdk) {
    throw new Error(
      "@anthropic-ai/claude-agent-sdk not available — install dependencies or set TIDE_RUNNER=stub",
    );
  }

  const sessionRow = sessionsDao.start(ticket.id);
  let sdkSessionId: string = opts.resumeSessionId ?? "";

  const prompt = buildPrompt(ticket, opts.extraPrompt);

  try {
    const queryArgs: Record<string, unknown> = {
      prompt,
      options: {
        cwd: repo.path,
        permissionMode: "bypassPermissions",
        maxTurns: opts.maxTurns ?? 25,
        abortSignal: opts.signal,
      },
    };
    if (opts.resumeSessionId) {
      (queryArgs.options as Record<string, unknown>).resume =
        opts.resumeSessionId;
    }
    const iterator = (sdk as unknown as {
      query: (args: unknown) => AsyncIterable<unknown>;
    }).query(queryArgs);

    for await (const message of iterator) {
      // Log every message into ticket_events and forward to webview.
      eventsDao.insert({
        ticketId: ticket.id,
        kind: "claude_message",
        payload: message,
      });
      emit("claudeMessage", { ticketId: ticket.id, message });
      const m = message as { type?: string; session_id?: string };
      if (m.type === "result" && m.session_id) {
        sdkSessionId = m.session_id;
        sessionsDao.setSdkId(sessionRow.id, sdkSessionId);
      }
    }
    sessionsDao.finish(sessionRow.id, "completed");
    return { sdkSessionId, ok: true };
  } catch (err) {
    const aborted = (err as { name?: string }).name === "AbortError";
    if (aborted) {
      sessionsDao.finish(sessionRow.id, "canceled");
      return { sdkSessionId, ok: false, canceled: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    sessionsDao.finish(sessionRow.id, "errored", message);
    return { sdkSessionId, ok: false, error: message };
  }
}

function buildPrompt(ticket: Ticket, extra?: string): string {
  const base = `# ${ticket.title}\n\n${ticket.descriptionMd}`;
  if (!extra) return base;
  return `${base}\n\n---\n\nAdditional instructions:\n\n${extra}`;
}
