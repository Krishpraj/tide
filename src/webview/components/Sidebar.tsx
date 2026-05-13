import { useMemo, useState } from "react";
import { ChevronDown, Folder, GitBranch, Plus, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { useStore } from "../store";
import { AddRepoDialog } from "./AddRepoDialog";
import { NewProjectDialog } from "./NewProjectDialog";

export function Sidebar() {
  const projects = useStore((s) => s.projects);
  const current = useStore((s) =>
    s.projects.find((p) => p.id === s.currentProjectId),
  );
  const setCurrent = useStore((s) => s.setCurrentProject);
  const repos = useStore((s) => s.repos);
  const workers = useStore((s) => s.workers);

  const visibleRepos = useMemo(
    () => repos.filter((r) => r.projectId === (current?.id ?? null)),
    [repos, current],
  );

  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  return (
    <aside
      data-testid="sidebar"
      className="w-[220px] shrink-0 border-r border-border bg-card flex flex-col"
    >
      <div className="px-3 py-3 border-b border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between"
              data-testid="project-switcher"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: current?.color ?? "#5E6AD2" }}
                />
                <span className="truncate text-sm">
                  {current?.name ?? "No project"}
                </span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[200px]"
            data-testid="project-menu"
          >
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => setCurrent(p.id)}
                data-testid={`project-menu-item-${p.name}`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setNewProjectOpen(true)}
              data-testid="new-project-menu-item"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Repos</span>
        <button
          onClick={() => setAddRepoOpen(true)}
          className="rounded p-0.5 hover:bg-secondary"
          aria-label="add repo"
          data-testid="add-repo-button"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1 px-1.5">
        <div className="space-y-0.5">
          {visibleRepos.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No repos yet. Click + to add one.
            </p>
          )}
          {visibleRepos.map((r) => {
            const w = workers[r.id];
            return (
              <div
                key={r.id}
                data-testid={`sidebar-repo-${r.name}`}
                className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary cursor-default"
              >
                <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate text-xs">{r.name}</span>
                {w?.busy && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                    aria-label="busy"
                  />
                )}
                {w && w.queueLength > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {w.queueLength}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-border px-2 py-2 flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <GitBranch className="h-3 w-3" />
          tide
        </span>
        <button
          className="rounded p-1 hover:bg-secondary text-muted-foreground"
          aria-label="settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      <AddRepoDialog open={addRepoOpen} onOpenChange={setAddRepoOpen} />
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
      />
    </aside>
  );
}
