import { rpc } from "../rpc";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useStore } from "../store";
import { PriorityIcon } from "../lib/status";
import type { Priority, TicketStatus } from "@shared/types";

export function BulkActionBar({
  selected,
  onClear,
}: {
  selected: string[];
  onClear: () => void;
}) {
  const repos = useStore((s) => s.repos);
  if (selected.length === 0) return null;

  async function setPriority(p: Priority) {
    await rpc.bulkUpdate({ ticketIds: selected, patch: { priority: p } });
  }
  async function setStatus(s: TicketStatus) {
    await rpc.bulkUpdate({ ticketIds: selected, patch: { status: s } });
  }
  async function setRepo(repoId: string | null) {
    await rpc.bulkUpdate({ ticketIds: selected, patch: { repoId } });
  }

  return (
    <div
      data-testid="bulk-action-bar"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1.5 shadow-lg"
    >
      <Badge variant="accent">
        {selected.length} selected
      </Badge>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" data-testid="bulk-priority">
            Set priority
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {[0, 1, 2, 3, 4].map((p) => (
            <DropdownMenuItem
              key={p}
              onSelect={() => setPriority(p as Priority)}
              data-testid={`bulk-priority-${p}`}
            >
              <PriorityIcon value={p as Priority} /> P{p}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" data-testid="bulk-status">
            Set status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {(
            [
              "backlog",
              "queued",
              "in_progress",
              "review",
              "done",
              "discarded",
            ] as TicketStatus[]
          ).map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => setStatus(s)}
              data-testid={`bulk-status-${s}`}
            >
              {s}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" data-testid="bulk-repo">
            Set repo
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setRepo(null)}>
            (none)
          </DropdownMenuItem>
          {repos.map((r) => (
            <DropdownMenuItem key={r.id} onSelect={() => setRepo(r.id)}>
              {r.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        data-testid="bulk-clear"
      >
        Clear
      </Button>
    </div>
  );
}
