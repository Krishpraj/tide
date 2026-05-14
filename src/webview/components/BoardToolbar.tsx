import { useState } from "react";
import { Filter, GroupIcon, SortAsc, Save, X } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Badge } from "./ui/badge";
import { useStore } from "../store";
import { rpc } from "../rpc";

export type GroupBy = "status" | "priority" | "repo" | "label" | "none";
export type SortBy = "priority" | "created" | "updated" | "estimate";

export interface BoardFilters {
  status?: string | null;
  priority?: number | null;
  repoId?: string | null;
  labelId?: string | null;
}

export function BoardToolbar({
  groupBy,
  sortBy,
  filters,
  onGroup,
  onSort,
  onFilter,
}: {
  groupBy: GroupBy;
  sortBy: SortBy;
  filters: BoardFilters;
  onGroup: (g: GroupBy) => void;
  onSort: (s: SortBy) => void;
  onFilter: (f: BoardFilters) => void;
}) {
  const allRepos = useStore((s) => s.repos);
  const allLabels = useStore((s) => s.labels);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const repos = currentProjectId
    ? allRepos.filter((r) => r.projectId === currentProjectId)
    : allRepos;
  const labels = currentProjectId
    ? allLabels.filter(
        (l) => l.projectId === currentProjectId || l.projectId === null,
      )
    : allLabels;
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  async function saveView() {
    if (!viewName.trim()) return;
    await rpc.saveView({
      name: viewName.trim(),
      groupBy,
      sortBy,
      filtersJson: JSON.stringify(filters),
    });
    setViewName("");
    setSaveOpen(false);
  }

  return (
    <div
      data-testid="board-toolbar"
      className="flex items-center gap-2 border-b border-border px-3 py-2"
    >
      {/* Group */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-testid="board-group-trigger"
            className="gap-1"
          >
            <GroupIcon className="h-3.5 w-3.5" /> Group: {groupBy}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Group by</DropdownMenuLabel>
          {(["status", "priority", "repo", "label", "none"] as GroupBy[]).map(
            (g) => (
              <DropdownMenuItem
                key={g}
                onSelect={() => onGroup(g)}
                data-testid={`board-group-${g}`}
              >
                {g}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-testid="board-sort-trigger"
            className="gap-1"
          >
            <SortAsc className="h-3.5 w-3.5" /> Sort: {sortBy}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          {(["priority", "created", "updated", "estimate"] as SortBy[]).map(
            (s) => (
              <DropdownMenuItem
                key={s}
                onSelect={() => onSort(s)}
                data-testid={`board-sort-${s}`}
              >
                {s}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-testid="board-filter-trigger"
            className="gap-1"
          >
            <Filter className="h-3.5 w-3.5" /> Filter
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {["backlog", "queued", "in_progress", "review", "done"].map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => onFilter({ ...filters, status: s })}
              data-testid={`board-filter-status-${s}`}
            >
              {s}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          {[4, 3, 2, 1, 0].map((p) => (
            <DropdownMenuItem
              key={p}
              onSelect={() => onFilter({ ...filters, priority: p })}
              data-testid={`board-filter-priority-${p}`}
            >
              P{p}
            </DropdownMenuItem>
          ))}
          {repos.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Repository</DropdownMenuLabel>
              {repos.map((r) => (
                <DropdownMenuItem
                  key={r.id}
                  onSelect={() => onFilter({ ...filters, repoId: r.id })}
                  data-testid={`board-filter-repo-${r.name}`}
                >
                  {r.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {labels.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Label</DropdownMenuLabel>
              {labels.map((l) => (
                <DropdownMenuItem
                  key={l.id}
                  onSelect={() => onFilter({ ...filters, labelId: l.id })}
                  data-testid={`board-filter-label-${l.name}`}
                >
                  {l.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Active filter chips */}
      <div className="flex items-center gap-1.5" data-testid="filter-chips">
        {filters.status && (
          <Chip
            label={`Status: ${filters.status}`}
            onClear={() => onFilter({ ...filters, status: null })}
            testid="chip-status"
          />
        )}
        {filters.priority !== undefined && filters.priority !== null && (
          <Chip
            label={`Priority: P${filters.priority}`}
            onClear={() => onFilter({ ...filters, priority: null })}
            testid="chip-priority"
          />
        )}
        {filters.repoId && (
          <Chip
            label={`Repo: ${
              repos.find((r) => r.id === filters.repoId)?.name ?? "?"
            }`}
            onClear={() => onFilter({ ...filters, repoId: null })}
            testid="chip-repo"
          />
        )}
        {filters.labelId && (
          <Chip
            label={`Label: ${
              labels.find((l) => l.id === filters.labelId)?.name ?? "?"
            }`}
            onClear={() => onFilter({ ...filters, labelId: null })}
            testid="chip-label"
          />
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu open={saveOpen} onOpenChange={setSaveOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              data-testid="board-save-view"
              className="gap-1"
            >
              <Save className="h-3.5 w-3.5" /> Save view
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="p-2 space-y-2 w-[220px]">
              <input
                className="w-full bg-transparent border border-input rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="My reviews"
                value={viewName}
                data-testid="save-view-name"
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveView();
                }}
              />
              <Button
                size="sm"
                className="w-full"
                onClick={saveView}
                data-testid="save-view-submit"
                disabled={!viewName.trim()}
              >
                Save
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function Chip({
  label,
  onClear,
  testid,
}: {
  label: string;
  onClear: () => void;
  testid?: string;
}) {
  return (
    <Badge variant="accent" data-testid={testid} className="gap-1 px-2 py-0.5">
      {label}
      <button onClick={onClear} aria-label="clear">
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
