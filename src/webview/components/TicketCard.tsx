import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { rpc } from "../rpc";
import { useStore } from "../store";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { PriorityIcon, StatusIcon, statusLabel } from "../lib/status";
import type { Priority, Ticket, TicketStatus } from "@shared/types";

const STATUS_CHOICES: TicketStatus[] = [
  "backlog",
  "queued",
  "in_progress",
  "review",
  "done",
  "discarded",
  "canceled",
];

export function TicketCard({
  ticket,
  onOpen,
  selected,
  onSelectClick,
  draggable = true,
}: {
  ticket: Ticket;
  onOpen?: (id: string) => void;
  selected?: boolean;
  onSelectClick?: (e: React.MouseEvent) => void;
  draggable?: boolean;
}) {
  const repo = useStore((s) =>
    ticket.repoId ? s.repos.find((r) => r.id === ticket.repoId) : null,
  );

  return (
    <div
      data-testid={`ticket-card-${ticket.title.replace(/\s+/g, "-")}`}
      data-ticket-id={ticket.id}
      data-selected={selected ? "true" : "false"}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-tide-ticket", ticket.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onSelectClick}
      onDoubleClick={() => onOpen?.(ticket.id)}
      className={`group rounded-md border border-border bg-card p-2.5 hover:border-border/80 transition-colors cursor-pointer ${
        selected ? "ring-1 ring-primary" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <PriorityIcon value={ticket.priority} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <StatusIcon status={ticket.status} />
            <span className="text-[13px] font-medium text-foreground truncate">
              {ticket.title}
            </span>
          </div>
          {ticket.descriptionMd && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {ticket.descriptionMd}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {ticket.labels?.map((l) => (
              <Badge
                key={l.id}
                variant="outline"
                data-testid={`ticket-label-${l.name}`}
                style={{ color: l.color, borderColor: l.color + "55" }}
              >
                {l.name}
              </Badge>
            ))}
            {repo && (
              <Badge variant="default" data-testid="ticket-repo-badge">
                {repo.name}
              </Badge>
            )}
            {ticket.estimate && (
              <Badge variant="outline" data-testid="ticket-estimate-badge">
                {ticket.estimate}
              </Badge>
            )}
          </div>
        </div>
        <CardActions ticket={ticket} />
      </div>
    </div>
  );
}

function CardActions({ ticket }: { ticket: Ticket }) {
  const repos = useStore((s) => s.repos);
  const labels = useStore((s) => s.labels);
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          aria-label="ticket actions"
          data-testid="ticket-actions-trigger"
          className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-secondary"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
        data-testid="ticket-context-menu"
      >
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        {STATUS_CHOICES.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() =>
              rpc.setStatus({ ticketId: ticket.id, status: s })
            }
            data-testid={`ticket-menu-status-${s}`}
          >
            <StatusIcon status={s} /> {statusLabel(s)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Priority</DropdownMenuLabel>
        {[0, 1, 2, 3, 4].map((p) => (
          <DropdownMenuItem
            key={p}
            onSelect={() =>
              rpc.setPriority({
                ticketId: ticket.id,
                priority: p as Priority,
              })
            }
            data-testid={`ticket-menu-priority-${p}`}
          >
            <PriorityIcon value={p as Priority} /> P{p}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Repository</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() =>
            rpc.assignTicket({ ticketId: ticket.id, repoId: null })
          }
        >
          <span className="text-muted-foreground">No repo</span>
        </DropdownMenuItem>
        {repos.map((r) => (
          <DropdownMenuItem
            key={r.id}
            onSelect={() =>
              rpc.assignTicket({ ticketId: ticket.id, repoId: r.id })
            }
            data-testid={`ticket-menu-repo-${r.name}`}
          >
            {r.name}
          </DropdownMenuItem>
        ))}
        {labels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Labels</DropdownMenuLabel>
            {labels.map((l) => {
              const active = ticket.labels?.some((x) => x.id === l.id);
              return (
                <DropdownMenuItem
                  key={l.id}
                  onSelect={() => {
                    const current = ticket.labels?.map((x) => x.id) ?? [];
                    const next = active
                      ? current.filter((id) => id !== l.id)
                      : [...current, l.id];
                    rpc.setLabels({ ticketId: ticket.id, labelIds: next });
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  {l.name} {active ? "✓" : ""}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="ticket-menu-copy-branch"
          onSelect={() => {
            const branch =
              ticket.branchName ?? `tide/${slugify(ticket.title)}`;
            navigator.clipboard?.writeText(branch);
          }}
        >
          Copy branch name
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="ticket-menu-duplicate"
          onSelect={() => rpc.duplicateTicket(ticket.id)}
        >
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="ticket-menu-delete"
          onSelect={() => rpc.deleteTicket(ticket.id)}
          className="text-destructive focus:text-destructive"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
