import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { rpc } from "../rpc";
import type { TicketEvent } from "@shared/types";

type ClaudeMsg = {
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
  session_id?: string;
  // tide_stage shape
  label?: string;
  detail?: string;
  level?: "info" | "warn" | "error";
};

type Entry = { ts: number; key: string; msg: ClaudeMsg };

export function LiveStream({ ticketId }: { ticketId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    void rpc.getTicketEvents(ticketId).then((events: TicketEvent[]) => {
      if (!mounted) return;
      const seeded: Entry[] = events
        .filter(
          (e) =>
            e.kind === "claude_message" ||
            e.kind === "tool_use" ||
            e.kind === "stage" ||
            e.kind === "error",
        )
        .map((e) => ({
          ts: e.ts,
          key: `seed-${e.id}`,
          msg: eventToMsg(e),
        }));
      setEntries(seeded);
    });
    const off = rpc.on("claudeMessage", (m) => {
      if (m.ticketId !== ticketId) return;
      setEntries((prev) => [
        ...prev,
        {
          ts: Date.now(),
          key: `live-${prev.length}-${Date.now()}`,
          msg: m.message as ClaudeMsg,
        },
      ]);
    });
    return () => {
      mounted = false;
      off();
    };
  }, [ticketId]);

  useLayoutEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoScroll(atBottom);
  }

  return (
    <div
      data-testid="live-stream"
      className="flex flex-col h-full min-h-0 bg-zinc-950 text-zinc-200"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Claude stream · {entries.length} msg
        </div>
        <button
          onClick={() => {
            setAutoScroll(true);
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className={`px-1.5 py-0.5 rounded text-[10px] ${
            autoScroll
              ? "text-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {autoScroll ? "follow ▼" : "jump to end"}
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {entries.length === 0 && (
          <div className="text-zinc-500 italic">
            waiting for Claude to start…
          </div>
        )}
        {entries.map((e) => (
          <StreamRow key={e.key} entry={e} />
        ))}
      </div>
    </div>
  );
}

function StreamRow({ entry }: { entry: Entry }) {
  const { msg, ts } = entry;
  const t = msg.type ?? "?";
  const time = new Date(ts).toLocaleTimeString();
  const stamp = (
    <span className="text-zinc-600 mr-2 select-none">{time}</span>
  );

  if (t === "tide_stage") {
    const color =
      msg.level === "error"
        ? "text-rose-300"
        : msg.level === "warn"
          ? "text-amber-300"
          : "text-cyan-300";
    const dot =
      msg.level === "error"
        ? "bg-rose-400"
        : msg.level === "warn"
          ? "bg-amber-400"
          : "bg-cyan-400";
    return (
      <div className="flex items-baseline gap-2">
        {stamp}
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${dot} self-center`}
        />
        <span className={color}>{msg.label}</span>
        {msg.detail && (
          <span className="text-zinc-500 truncate">{msg.detail}</span>
        )}
      </div>
    );
  }

  if (t === "system") {
    return (
      <div className="text-zinc-500">
        {stamp}
        <span className="text-zinc-400">system</span>
        {msg.subtype ? ` · ${msg.subtype}` : ""}
      </div>
    );
  }

  if (t === "result") {
    const dur = msg.duration_ms != null ? `${(msg.duration_ms / 1000).toFixed(1)}s` : "?";
    const cost = msg.total_cost_usd != null ? `$${msg.total_cost_usd.toFixed(4)}` : "?";
    return (
      <div className="mt-2 border-t border-zinc-800 pt-1.5">
        {stamp}
        <span className="text-amber-300">result</span>
        <span className="text-zinc-500">
          {msg.subtype ? ` · ${msg.subtype}` : ""} · turns={msg.num_turns ?? "?"} · {dur} · {cost}
        </span>
        {msg.result && (
          <div className="mt-1 whitespace-pre-wrap text-zinc-300">
            {msg.result}
          </div>
        )}
      </div>
    );
  }

  const parts = msg.message?.content;
  if ((t === "assistant" || t === "user") && parts && parts.length > 0) {
    return (
      <div className="mb-1">
        {parts.map((p, i) => (
          <Part key={i} part={p} role={t} stamp={i === 0 ? stamp : null} />
        ))}
      </div>
    );
  }

  // Legacy stub shape: { type: "tool_use", name, input }
  const flat = msg as unknown as {
    type?: string;
    name?: string;
    input?: unknown;
  };
  if (flat.type === "tool_use" && flat.name) {
    return (
      <div>
        {stamp}
        <ToolUseChip name={flat.name} input={flat.input} />
      </div>
    );
  }

  return (
    <div className="text-zinc-500">
      {stamp}
      {t}
    </div>
  );
}

function Part({
  part,
  role,
  stamp,
}: {
  part: NonNullable<NonNullable<ClaudeMsg["message"]>["content"]>[number];
  role: string;
  stamp: React.ReactNode;
}) {
  if (part.type === "text" && part.text) {
    return (
      <div className="whitespace-pre-wrap">
        {stamp}
        <span
          className={
            role === "assistant" ? "text-sky-300" : "text-zinc-500"
          }
        >
          {role === "assistant" ? "▸ " : "· "}
        </span>
        <span className="text-zinc-100">{part.text}</span>
      </div>
    );
  }
  if (part.type === "tool_use") {
    return (
      <div>
        {stamp}
        <ToolUseChip name={part.name ?? "?"} input={part.input} />
      </div>
    );
  }
  if (part.type === "tool_result") {
    const body =
      typeof part.content === "string"
        ? part.content
        : JSON.stringify(part.content ?? "", null, 2);
    return (
      <div className="ml-3 my-0.5">
        {stamp}
        <span
          className={
            part.is_error ? "text-rose-400" : "text-zinc-500"
          }
        >
          {part.is_error ? "✕ result" : "← result"}
        </span>
        <pre
          className={`mt-0.5 pl-3 border-l-2 ${
            part.is_error ? "border-rose-700" : "border-zinc-700"
          } whitespace-pre-wrap break-words text-zinc-400`}
        >
          {clip(body, 2000)}
        </pre>
      </div>
    );
  }
  return (
    <div className="text-zinc-500">
      {stamp}
      {part.type}
    </div>
  );
}

function ToolUseChip({ name, input }: { name: string; input: unknown }) {
  const summary = summarizeInput(name, input);
  return (
    <span>
      <span className="text-violet-300">⚙ {name}</span>
      {summary && <span className="text-zinc-400"> {summary}</span>}
    </span>
  );
}

function summarizeInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  // Common shapes — surface the most useful field inline.
  if (typeof o.file_path === "string") return String(o.file_path);
  if (typeof o.path === "string") return String(o.path);
  if (typeof o.command === "string") return clip(String(o.command), 200);
  if (typeof o.pattern === "string") return `/${o.pattern}/`;
  if (typeof o.url === "string") return String(o.url);
  if (name === "Edit" && typeof o.old_string === "string") {
    return clip(String(o.old_string).split("\n")[0] ?? "", 80);
  }
  return clip(JSON.stringify(o), 160);
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function eventToMsg(e: TicketEvent): ClaudeMsg {
  if (e.kind === "error") {
    const p = (e.payload as { reason?: string; message?: string }) ?? {};
    return {
      type: "tide_stage",
      label: `error: ${p.reason ?? "unknown"}`,
      detail: p.message,
      level: "error",
    };
  }
  return e.payload as ClaudeMsg;
}
