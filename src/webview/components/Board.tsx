import { useEffect, useMemo, useRef, useState } from "react";
import { rpc } from "../rpc";
import { useStore, ticketInProject } from "../store";
import {
  PRIORITY_LABELS,
  STATUS_COLUMNS,
  StatusIcon,
  statusLabel,
} from "../lib/status";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { TicketCard } from "./TicketCard";
import { PromptHarness } from "./PromptHarness";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import {
  BoardToolbar,
  type BoardFilters,
  type GroupBy,
  type SortBy,
} from "./BoardToolbar";
import { BulkActionBar } from "./BulkActionBar";
import { useUiStore } from "../uistore";
import type { Priority, Ticket, TicketStatus } from "@shared/types";

const PRIORITY_GROUPS: Priority[] = [4, 3, 2, 1, 0];

export function Board() {
  const tickets = useStore((s) => s.tickets);
  const allRepos = useStore((s) => s.repos);
  const labels = useStore((s) => s.labels);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const focusTicketComposerToken = useUiStore(
    (s) => s.focusTicketComposerToken,
  );
  // The legacy hotkey/menu fires this token to open the composer. Forward
  // it to the modal. Track the last-seen value with a ref so re-mounting
  // Board (e.g. after closing a review tab) doesn't replay an old token
  // and re-open the modal spuriously.
  const seenComposerToken = useRef(focusTicketComposerToken);
  useEffect(() => {
    if (focusTicketComposerToken > seenComposerToken.current) {
      seenComposerToken.current = focusTicketComposerToken;
      setNewOpen(true);
    }
  }, [focusTicketComposerToken]);
  const selected = useUiStore((s) => s.selectedTickets);
  const setSelected = useUiStore((s) => s.setSelectedTickets);

  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [sortBy, setSortBy] = useState<SortBy>("priority");
  const [filters, setFilters] = useState<BoardFilters>({});
  const [newOpen, setNewOpen] = useState(false);
  const [newSubmitting, setNewSubmitting] = useState(false);

  // Scope the repo list shown in toolbar/grouping to the current project.
  const repos = useMemo(
    () =>
      currentProjectId
        ? allRepos.filter((r) => r.projectId === currentProjectId)
        : allRepos,
    [allRepos, currentProjectId],
  );

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (!ticketInProject(t, allRepos, currentProjectId)) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (
        filters.priority !== undefined &&
        filters.priority !== null &&
        t.priority !== filters.priority
      )
        return false;
      if (filters.repoId && t.repoId !== filters.repoId) return false;
      if (
        filters.labelId &&
        !t.labels?.some((l) => l.id === filters.labelId)
      )
        return false;
      return true;
    });
  }, [tickets, filters, allRepos, currentProjectId]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortBy) {
        case "priority":
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.createdAt - b.createdAt;
        case "created":
          return b.createdAt - a.createdAt;
        case "updated":
          return b.updatedAt - a.updatedAt;
        case "estimate": {
          const order = { XS: 1, S: 2, M: 3, L: 4, XL: 5 } as Record<
            string,
            number
          >;
          return (order[a.estimate ?? ""] ?? 0) - (order[b.estimate ?? ""] ?? 0);
        }
      }
    });
    return arr;
  }, [filtered, sortBy]);

  const groups = useMemo(() => buildGroups(sorted, groupBy, repos, labels), [
    sorted,
    groupBy,
    repos,
    labels,
  ]);

  function onCardClick(id: string, e: React.MouseEvent) {
    if (e.shiftKey) {
      setSelected(
        selected.includes(id)
          ? selected.filter((x) => x !== id)
          : [...selected, id],
      );
    }
  }

  async function onDrop(targetStatus: TicketStatus, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/x-tide-ticket");
    if (!id) return;
    const t = tickets.find((x) => x.id === id);
    if (!t || t.status === targetStatus) return;
    await rpc.setStatus({ ticketId: id, status: targetStatus });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <BoardToolbar
        groupBy={groupBy}
        sortBy={sortBy}
        filters={filters}
        onGroup={setGroupBy}
        onSort={setSortBy}
        onFilter={setFilters}
      />

      <ScrollArea className="flex-1">
        <div
          data-testid="board"
          data-group-by={groupBy}
          className="flex gap-3 p-3 min-w-max"
        >
          {groups.map((group) => (
            <div
              key={group.key}
              data-testid={`column-${group.key}`}
              onDragOver={(e) => {
                if (groupBy === "status") e.preventDefault();
              }}
              onDrop={(e) =>
                groupBy === "status" &&
                onDrop(group.key as TicketStatus, e)
              }
              className="w-[260px] shrink-0 flex flex-col"
            >
              <div className="flex items-center justify-between px-1.5 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  {group.icon}
                  <span data-testid={`column-${group.key}-label`}>
                    {group.label}
                  </span>
                  <Badge
                    variant="outline"
                    data-testid={`column-${group.key}-count`}
                  >
                    {group.tickets.length}
                  </Badge>
                </div>
              </div>
              {group.key === "triage" && (
                <div className="px-0.5 pb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-1.5"
                    data-testid="board-new-ticket"
                    onClick={() => setNewOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="text-xs">New ticket</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      C
                    </span>
                  </Button>
                </div>
              )}
              <div className="space-y-1.5 px-0.5">
                {group.tickets.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    selected={selected.includes(t.id)}
                    onSelectClick={(e) => onCardClick(t.id, e)}
                    onOpen={(id) => useUiStore.getState().openTicket(id)}
                    showStatusIcon={groupBy !== "status"}
                  />
                ))}
                {group.tickets.length === 0 && group.key !== "triage" && (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    Empty
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <BulkActionBar
        selected={selected}
        onClear={() => setSelected([])}
      />

      <PromptHarness
        open={newOpen}
        onOpenChange={setNewOpen}
        mode="new"
        submitting={newSubmitting}
        onSubmit={async ({ title, docJson, markdown, repoId: r }) => {
          setNewSubmitting(true);
          try {
            await rpc.createTicket({
              title,
              description: JSON.stringify(docJson),
              descriptionMd: markdown,
              repoId: r,
            });
          } finally {
            setNewSubmitting(false);
            setNewOpen(false);
          }
        }}
      />
    </div>
  );
}

interface Group {
  key: string;
  label: string;
  icon: React.ReactNode;
  tickets: Ticket[];
}

function buildGroups(
  tickets: Ticket[],
  groupBy: GroupBy,
  repos: { id: string; name: string }[],
  labels: { id: string; name: string; color: string }[],
): Group[] {
  if (groupBy === "status") {
    return STATUS_COLUMNS.map((s) => ({
      key: s,
      label: statusLabel(s),
      icon: <StatusIcon status={s} />,
      tickets: tickets.filter((t) => t.status === s),
    }));
  }
  if (groupBy === "priority") {
    return PRIORITY_GROUPS.map((p) => ({
      key: `priority-${p}`,
      label: PRIORITY_LABELS[p],
      icon: null,
      tickets: tickets.filter((t) => t.priority === p),
    }));
  }
  if (groupBy === "repo") {
    const out: Group[] = [
      {
        key: "no-repo",
        label: "No repo",
        icon: null,
        tickets: tickets.filter((t) => !t.repoId),
      },
    ];
    for (const r of repos) {
      out.push({
        key: `repo-${r.name}`,
        label: r.name,
        icon: null,
        tickets: tickets.filter((t) => t.repoId === r.id),
      });
    }
    return out;
  }
  if (groupBy === "label") {
    const out: Group[] = [
      {
        key: "no-label",
        label: "No label",
        icon: null,
        tickets: tickets.filter((t) => !t.labels || t.labels.length === 0),
      },
    ];
    for (const l of labels) {
      out.push({
        key: `label-${l.name}`,
        label: l.name,
        icon: (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: l.color }}
          />
        ),
        tickets: tickets.filter((t) => t.labels?.some((x) => x.id === l.id)),
      });
    }
    return out;
  }
  // none
  return [
    {
      key: "all",
      label: "All tickets",
      icon: null,
      tickets,
    },
  ];
}
