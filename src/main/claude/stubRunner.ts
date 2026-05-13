// Deterministic stub for the Claude runner. Used in tests; selected via
// TIDE_RUNNER=stub.
//
// Recognized directives in `ticket.descriptionMd`:
//   TEST_HANG               — sleep until aborted (used to test cancel)
//   TEST_THROW: <message>   — throw the given error
//   TEST_FILE: <name>: <content>  (one per line) — write each file
//
// Falls back to writing `tide-output.md` with the description as content.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ulid } from "ulid";
import type { Ticket, Repo } from "@shared/types";
import { emit } from "../rpc/events";
import { eventsDao, sessionsDao } from "../db/dao";
import type { RunForTicketResult, RunForTicketOpts } from "./runner-types";

export async function runForTicketStub(
  ticket: Ticket,
  repo: Repo,
  opts: RunForTicketOpts,
): Promise<RunForTicketResult> {
  const sessionRow = sessionsDao.start(ticket.id);
  const sdkSessionId = opts.resumeSessionId ?? `stub-${ulid()}`;
  sessionsDao.setSdkId(sessionRow.id, sdkSessionId);

  const directives = parseDirectives(opts.extraPrompt ?? ticket.descriptionMd);

  try {
    for (const d of directives) {
      if (d.kind === "hang") {
        await waitForAbort(opts.signal);
      } else if (d.kind === "throw") {
        throw new Error(d.message);
      } else if (d.kind === "file") {
        const dest = join(repo.path, d.name);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, d.content);
        const msg = {
          type: "tool_use",
          name: "Write",
          input: { file_path: dest },
        };
        eventsDao.insert({
          ticketId: ticket.id,
          kind: "tool_use",
          payload: msg,
        });
        emit("claudeMessage", { ticketId: ticket.id, message: msg });
      }
    }
    // Default file if no directives matched.
    if (directives.length === 0) {
      const dest = join(repo.path, "tide-output.md");
      await writeFile(dest, ticket.descriptionMd || ticket.title);
      const msg = {
        type: "tool_use",
        name: "Write",
        input: { file_path: dest },
      };
      eventsDao.insert({
        ticketId: ticket.id,
        kind: "tool_use",
        payload: msg,
      });
      emit("claudeMessage", { ticketId: ticket.id, message: msg });
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

type Directive =
  | { kind: "hang" }
  | { kind: "throw"; message: string }
  | { kind: "file"; name: string; content: string };

function parseDirectives(src: string): Directive[] {
  const out: Directive[] = [];
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "TEST_HANG") out.push({ kind: "hang" });
    else if (line.startsWith("TEST_THROW:")) {
      out.push({ kind: "throw", message: line.slice("TEST_THROW:".length).trim() });
    } else if (line.startsWith("TEST_FILE:")) {
      const rest = line.slice("TEST_FILE:".length);
      const idx = rest.indexOf(":");
      if (idx > 0) {
        const name = rest.slice(0, idx).trim();
        const content = rest.slice(idx + 1);
        out.push({ kind: "file", name, content });
      }
    }
  }
  return out;
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    signal.addEventListener("abort", () => {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  });
}
