import { useEffect, useState } from "react";
import {
  Ban,
  ChevronDown,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { rpc } from "../rpc";
import { useStore } from "../store";
import { useUiStore } from "../uistore";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { PromptHarness } from "./PromptHarness";
import { DiffView } from "./DiffView";
import { LiveStream } from "./LiveStream";
import { CommentsPanel } from "./CommentsPanel";
import { StatusIcon, statusLabel } from "../lib/status";
import type { Editor, Ticket, TicketEvent } from "@shared/types";

export function ReviewPanel({ ticketId }: { ticketId: string }) {
  const ticket = useStore((s) => s.tickets.find((t) => t.id === ticketId));
  const repos = useStore((s) => s.repos);
  const repo = ticket?.repoId
    ? repos.find((r) => r.id === ticket.repoId) ?? null
    : null;
  const openTicket = useUiStore((s) => s.openTicket);

  const [diff, setDiff] = useState("");
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [editors, setEditors] = useState<
    { id: string; label: string; command: string }[]
  >([]);
  const [changeMoreOpen, setChangeMoreOpen] = useState(false);
  const [changeMoreSubmitting, setChangeMoreSubmitting] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  useEffect(() => {
    void rpc.getDiff(ticketId).then(setDiff);
    void rpc.getTicketEvents(ticketId).then((es) => setEvents(es));
    void rpc.listEditors().then(setEditors);
    const off = rpc.on("claudeMessage", (m) => {
      if (m.ticketId === ticketId) {
        void rpc.getTicketEvents(ticketId).then((es) => setEvents(es));
        void rpc.getDiff(ticketId).then(setDiff);
      }
    });
    return off;
  }, [ticketId]);

  if (!ticket) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Ticket not found.
      </div>
    );
  }

  async function onMerge(strategy: "merge" | "squash") {
    await rpc.mergeTicket({ ticketId, strategy });
    openTicket(null);
  }

  async function onDiscard() {
    await rpc.discardTicket(ticketId);
    openTicket(null);
  }

  async function onCancel() {
    await rpc.cancelTicket(ticketId);
  }

  async function onChangeMore(md: string) {
    if (!md.trim()) return;
    await rpc.iterateTicket({
      ticketId,
      instructions: md,
      instructionsMd: md,
    });
    setChangeMoreOpen(false);
  }

  async function onRefresh() {
    setDiff(await rpc.refreshDiff(ticketId));
    setEvents(await rpc.getTicketEvents(ticketId));
  }

  async function onCommitEdits() {
    if (!commitMessage.trim()) return;
    const r = await rpc.commitLocalEdits({
      ticketId,
      message: commitMessage.trim(),
    });
    setCommitOpen(false);
    setCommitMessage("");
    if (r.committed) await onRefresh();
  }

  async function onOpenInEditor(editorId: string) {
    await rpc.openInEditor({ ticketId, editorId });
  }

  const isInProgress = ticket.status === "in_progress";

  return (
    <div
      data-testid="review-panel"
      className="flex-1 flex flex-col min-h-0 min-w-0"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <StatusIcon status={ticket.status} />
        <span className="text-sm font-medium">{ticket.title}</span>
        {ticket.branchName && (
          <code className="text-[11px] font-mono text-muted-foreground">
            {ticket.branchName}
          </code>
        )}
        {repo && <Badge variant="default">{repo.name}</Badge>}
        <Badge variant="outline">{statusLabel(ticket.status)}</Badge>

        <div className="ml-auto flex items-center gap-1">
          <CodeButton
            editors={editors}
            onSelect={onOpenInEditor}
            inProgress={isInProgress}
          />
          {isInProgress ? (
            <Button
              size="sm"
              variant="destructive"
              data-testid="review-cancel"
              onClick={onCancel}
            >
              <Ban className="h-3.5 w-3.5" /> Cancel
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                data-testid="review-refresh"
                onClick={onRefresh}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="review-merge">
                    <GitMerge className="h-3.5 w-3.5" /> Merge
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => onMerge("merge")}
                    data-testid="review-merge-merge"
                  >
                    Merge
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onMerge("squash")}
                    data-testid="review-merge-squash"
                  >
                    Squash & merge
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="outline"
                data-testid="review-change-more"
                onClick={() => setChangeMoreOpen(true)}
              >
                <GitPullRequest className="h-3.5 w-3.5" /> Change more
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid="review-commit-edits"
                onClick={() => setCommitOpen(true)}
              >
                Commit edits
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid="review-discard"
                onClick={onDiscard}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Discard
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[360px] shrink-0 border-r border-border min-h-0 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Activity
              </div>
              {events.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No activity yet.
                </p>
              )}
              {events.map((e) => (
                <ActivityRow key={e.id} event={e} />
              ))}
            </div>
            <div className="px-3 pb-4">
              <CommentsPanel ticketId={ticketId} />
            </div>
          </ScrollArea>
        </div>
        <div className="flex-1 min-w-0">
          {isInProgress ? (
            <LiveStream ticketId={ticketId} />
          ) : (
            <ScrollArea className="h-full">
              <div className="p-3">
                <DiffView unifiedDiff={diff} />
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Change more */}
      <PromptHarness
        open={changeMoreOpen}
        onOpenChange={setChangeMoreOpen}
        mode="iterate"
        initialRepoId={ticket.repoId}
        ticketId={ticket.id}
        submitting={changeMoreSubmitting}
        onSubmit={async ({ markdown }) => {
          setChangeMoreSubmitting(true);
          try {
            await onChangeMore(markdown);
          } finally {
            setChangeMoreSubmitting(false);
          }
        }}
      />

      {/* Commit my edits */}
      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogContent data-testid="commit-edits-dialog">
          <DialogHeader>
            <DialogTitle>Commit local edits</DialogTitle>
          </DialogHeader>
          <input
            data-testid="commit-edits-message"
            placeholder="manual tweak"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitEdits();
            }}
            className="w-full bg-transparent border border-input rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommitOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="commit-edits-submit"
              onClick={onCommitEdits}
              disabled={!commitMessage.trim()}
            >
              Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CodeButton({
  editors,
  onSelect,
  inProgress,
}: {
  editors: Editor[];
  onSelect: (id: string) => void;
  inProgress: boolean;
}) {
  if (editors.length === 0) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        data-testid="review-code-disabled"
        title="No editor detected on PATH"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Code
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          data-testid="review-code"
          title={
            inProgress
              ? "Claude is editing — your changes may be overwritten"
              : "Open in your editor"
          }
        >
          <ExternalLink className="h-3.5 w-3.5" /> Code
          {inProgress && (
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-yellow-400" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {editors.map((e) => (
          <DropdownMenuItem
            key={e.id}
            onSelect={() => onSelect(e.id)}
            data-testid={`code-editor-${e.id}`}
          >
            {e.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActivityRow({ event }: { event: TicketEvent }) {
  const payload = event.payload as { name?: string; message?: string } | null;
  const summary = (() => {
    switch (event.kind) {
      case "status_change":
        return `→ ${(payload as { status?: string })?.status ?? "?"}`;
      case "tool_use":
        return `tool: ${payload?.name ?? "?"}`;
      case "merged":
        return "merged into base";
      case "iterate":
        return "iterate requested";
      case "canceled":
        return "canceled";
      case "discarded":
        return "discarded";
      case "manual_commit":
        return "manual commit";
      case "editor_opened":
        return "editor opened";
      case "error":
        return `error: ${(payload as { message?: string })?.message ?? ""}`;
      default:
        return event.kind;
    }
  })();
  return (
    <div className="text-xs text-muted-foreground">
      <span className="opacity-50 font-mono mr-2">
        {new Date(event.ts).toLocaleTimeString()}
      </span>
      {summary}
    </div>
  );
}
