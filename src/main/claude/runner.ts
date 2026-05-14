// Production Claude runner. Spawns the `claude` CLI as a subprocess and
// streams its stream-json output. We previously used the Agent SDK; in this
// environment the SDK iterator stalled with no observable signal. The CLI
// has the same auth + capabilities and gives us a real, killable process
// with live stdout/stderr we can pipe into the LiveStream.
//
// In tests we swap this for `stubRunner.ts` via the TIDE_RUNNER env var.

import type { Ticket, Repo } from "@shared/types";
import { emit } from "../rpc/events";
import { eventsDao, sessionsDao } from "../db/dao";
import type {
  RunForTicketOpts,
  RunForTicketResult,
} from "./runner-types";
import { runForTicketStub } from "./stubRunner";
import { surface } from "./surface";

const useStub = Bun.env.TIDE_RUNNER === "stub";

// Appended to Claude's default system prompt. Tide runs Claude as a
// background worker behind a queue — there's no human attached, so any
// clarifying question stalls the ticket. This instructs the model to make
// reasonable assumptions and proceed, and to record those assumptions in
// the final summary so the reviewer can verify them.
const AUTONOMOUS_SYSTEM_PROMPT = [
  "You are running in autonomous background mode inside the Tide ticket runner.",
  "No human is available to answer questions during this run.",
  "If the request is ambiguous, pick the most reasonable interpretation, proceed, and document the assumption in your final summary. Do not ask clarifying questions.",
  "The AskUserQuestion, EnterPlanMode, and ExitPlanMode tools are unavailable — do not attempt to use them.",
  "Complete the work end-to-end (edits, fixes, tests as needed) within the available turns. Stop only when the task is done or genuinely blocked; if blocked, explain what's needed in your final message.",
].join(" ");

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
  const tag = `[claude ${ticket.id.slice(-6)}]`;
  const log = (...args: unknown[]) => console.log(tag, ...args);

  // Resolve the claude binary up front so we fail loud if it's not on PATH.
  const claudeBin = Bun.which("claude");
  if (!claudeBin) {
    const msg =
      "`claude` CLI not found on PATH. Install Claude Code or set TIDE_RUNNER=stub.";
    log(msg);
    surface(ticket.id, "claude CLI not found", msg, "error");
    return { sdkSessionId: "", ok: false, error: msg };
  }

  const sessionRow = sessionsDao.start(ticket.id);
  let sdkSessionId: string = opts.resumeSessionId ?? "";

  const prompt = buildPrompt(ticket, opts.extraPrompt);
  const maxTurns = opts.maxTurns ?? 25;

  const cmd: string[] = [
    claudeBin,
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "bypassPermissions",
    "--max-turns",
    String(maxTurns),
    // Tide runs Claude in a background queue with no user attached. Block
    // tools that wait for human input — they would hang the run.
    "--disallowed-tools",
    "AskUserQuestion ExitPlanMode EnterPlanMode",
    // And tell the model not to ask in prose either; just decide and act.
    "--append-system-prompt",
    AUTONOMOUS_SYSTEM_PROMPT,
  ];
  if (opts.resumeSessionId) {
    cmd.push("--resume", opts.resumeSessionId);
  }

  log(
    `spawning claude cwd=${repo.path} maxTurns=${maxTurns}` +
      (opts.resumeSessionId ? ` resume=${opts.resumeSessionId}` : ""),
  );
  surface(
    ticket.id,
    "spawning claude CLI",
    `${claudeBin} -p … --max-turns ${maxTurns}`,
  );
  log(`prompt (${prompt.length} chars): ${oneLine(prompt, 160)}`);

  let proc: ReturnType<typeof Bun.spawn> | null = null;
  let onAbort: (() => void) | null = null;

  try {
    proc = Bun.spawn({
      cmd,
      cwd: repo.path,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...Bun.env },
    });

    // Hook AbortSignal → kill the subprocess.
    if (opts.signal) {
      if (opts.signal.aborted) {
        proc.kill();
      } else {
        onAbort = () => {
          try {
            proc?.kill();
          } catch {
            /* ignore */
          }
        };
        opts.signal.addEventListener("abort", onAbort);
      }
    }

    surface(ticket.id, "CLI started", `pid=${proc.pid}`);

    const startedAt = Date.now();
    let lastMessageAt = startedAt;
    let messageCount = 0;
    let stderrBuf = "";

    const watchdog = setInterval(() => {
      const idle = Math.round((Date.now() - lastMessageAt) / 1000);
      if (idle >= 30) {
        log(`…still waiting (idle=${idle}s, messages=${messageCount})`);
        surface(
          ticket.id,
          `still waiting (idle=${idle}s)`,
          `messages=${messageCount}`,
          "warn",
        );
      }
    }, 15000);

    // Consume stderr in parallel so the pipe doesn't fill.
    const stderrPromise = (async () => {
      const reader = (proc!.stderr as ReadableStream<Uint8Array>).getReader();
      const dec = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          stderrBuf += chunk;
          for (const line of splitLines(chunk)) {
            if (!line.trim()) continue;
            log(`stderr: ${line}`);
            surface(ticket.id, "stderr", line, "warn");
          }
        }
      } catch {
        /* stream closed */
      }
    })();

    // Parse stdout as one JSON object per line.
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let message: unknown;
          try {
            message = JSON.parse(line);
          } catch (e) {
            log("non-JSON stdout:", oneLine(line, 200));
            surface(ticket.id, "non-JSON stdout", oneLine(line, 200), "warn");
            continue;
          }
          lastMessageAt = Date.now();
          messageCount += 1;
          logClaudeMessage(log, message);
          eventsDao.insert({
            ticketId: ticket.id,
            kind: "claude_message",
            payload: message,
          });
          emit("claudeMessage", { ticketId: ticket.id, message });
          const m = message as { type?: string; session_id?: string };
          if (m.session_id && !sdkSessionId) {
            sdkSessionId = m.session_id;
            sessionsDao.setSdkId(sessionRow.id, sdkSessionId);
          }
          if (m.type === "result" && m.session_id) {
            sdkSessionId = m.session_id;
            sessionsDao.setSdkId(sessionRow.id, sdkSessionId);
          }
        }
      }
    } finally {
      clearInterval(watchdog);
    }

    // Flush any trailing partial line.
    if (buf.trim()) {
      try {
        const message = JSON.parse(buf);
        eventsDao.insert({
          ticketId: ticket.id,
          kind: "claude_message",
          payload: message,
        });
        emit("claudeMessage", { ticketId: ticket.id, message });
      } catch {
        /* not JSON, ignore */
      }
    }

    const exitCode = await proc.exited;
    await stderrPromise;

    if (opts.signal?.aborted) {
      log("aborted");
      surface(ticket.id, "aborted", undefined, "warn");
      sessionsDao.finish(sessionRow.id, "canceled");
      return { sdkSessionId, ok: false, canceled: true };
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (exitCode !== 0) {
      const errMsg =
        stderrBuf.trim().split(/\r?\n/).pop() ||
        `claude CLI exited with code ${exitCode}`;
      log(`exit=${exitCode} after ${elapsed}s (${messageCount} messages)`);
      surface(
        ticket.id,
        `CLI exited with code ${exitCode}`,
        errMsg,
        "error",
      );
      sessionsDao.finish(sessionRow.id, "errored", errMsg);
      return { sdkSessionId, ok: false, error: errMsg };
    }

    log(`completed in ${elapsed}s (${messageCount} messages)`);
    surface(
      ticket.id,
      `completed in ${elapsed}s`,
      `${messageCount} messages`,
    );
    sessionsDao.finish(sessionRow.id, "completed");
    return { sdkSessionId, ok: true };
  } catch (err) {
    const aborted = (err as { name?: string }).name === "AbortError";
    if (aborted || opts.signal?.aborted) {
      log("aborted (exception)");
      surface(ticket.id, "aborted", undefined, "warn");
      sessionsDao.finish(sessionRow.id, "canceled");
      return { sdkSessionId, ok: false, canceled: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    log("errored:", message);
    surface(ticket.id, "runner errored", message, "error");
    sessionsDao.finish(sessionRow.id, "errored", message);
    return { sdkSessionId, ok: false, error: message };
  } finally {
    if (onAbort && opts.signal) {
      opts.signal.removeEventListener("abort", onAbort);
    }
  }
}

function splitLines(s: string): string[] {
  return s.split(/\r?\n/);
}

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

function logClaudeMessage(
  log: (...a: unknown[]) => void,
  message: unknown,
): void {
  const m = message as {
    type?: string;
    subtype?: string;
    message?: {
      content?: Array<{
        type?: string;
        text?: string;
        name?: string;
        input?: unknown;
        content?: unknown;
        tool_use_id?: string;
        is_error?: boolean;
      }>;
    };
    result?: string;
    num_turns?: number;
    duration_ms?: number;
    total_cost_usd?: number;
  };
  const t = m.type ?? "?";
  if (t === "system") {
    log(`system${m.subtype ? `/${m.subtype}` : ""}`);
    return;
  }
  if (t === "assistant" || t === "user") {
    const parts = m.message?.content ?? [];
    if (parts.length === 0) {
      log(`${t} (empty)`);
      return;
    }
    for (const p of parts) {
      if (p.type === "text" && p.text) {
        log(`${t} text:`, oneLine(p.text, 240));
      } else if (p.type === "tool_use") {
        log(`${t} tool_use:`, p.name, oneLine(JSON.stringify(p.input ?? {}), 200));
      } else if (p.type === "tool_result") {
        const body = typeof p.content === "string"
          ? p.content
          : JSON.stringify(p.content ?? "");
        log(
          `${t} tool_result${p.is_error ? " (error)" : ""}:`,
          oneLine(body, 200),
        );
      } else {
        log(`${t} ${p.type}`);
      }
    }
    return;
  }
  if (t === "result") {
    const dur = m.duration_ms != null ? `${(m.duration_ms / 1000).toFixed(1)}s` : "?";
    const cost = m.total_cost_usd != null ? `$${m.total_cost_usd.toFixed(4)}` : "?";
    log(
      `result${m.subtype ? `/${m.subtype}` : ""} turns=${m.num_turns ?? "?"} dur=${dur} cost=${cost}`,
      m.result ? oneLine(m.result, 200) : "",
    );
    return;
  }
  log(t, oneLine(JSON.stringify(m), 200));
}

function buildPrompt(ticket: Ticket, extra?: string): string {
  const base = `# ${ticket.title}\n\n${ticket.descriptionMd}`;
  if (!extra) return base;
  return `${base}\n\n---\n\nAdditional instructions:\n\n${extra}`;
}
