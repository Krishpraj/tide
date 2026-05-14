import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Moon,
  Plus,
  Sun,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { useStore } from "../store";
import { useUiStore } from "../uistore";
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
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const visibleRepos = useMemo(
    () => repos.filter((r) => r.projectId === (current?.id ?? null)),
    [repos, current],
  );

  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      data-testid="sidebar"
      className="w-[220px] shrink-0 border-r border-border bg-card flex flex-col"
    >
      <div className="px-3 pt-3 pb-2 flex items-center gap-2 text-foreground">
        <TideLogo className="h-5 w-5" />
        <span
          data-testid="tide-brand"
          className="text-sm font-semibold tracking-[0.16em] uppercase"
        >
          Tide
        </span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-2 pt-1">
        <div className="group/proj flex items-center gap-0.5 rounded-md pr-1 hover:bg-secondary/60">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "expand project" : "collapse project"}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="project-switcher"
                className="flex-1 min-w-0 flex items-center gap-2 px-1 h-7 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      current?.color ?? "hsl(var(--muted-foreground))",
                  }}
                />
                <span className="truncate font-medium">
                  {current?.name ?? "No project"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[204px]"
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
          <button
            type="button"
            onClick={() => setAddRepoOpen(true)}
            aria-label="add repo"
            data-testid="add-repo-button"
            className="rounded p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover/proj:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {!collapsed && (
          <ScrollArea className="flex-1 mt-0.5">
            <div className="pl-5 pr-1 space-y-px">
              {visibleRepos.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  No repos. Click + to add one.
                </p>
              )}
              {visibleRepos.map((r) => {
                const w = workers[r.id];
                return (
                  <div
                    key={r.id}
                    data-testid={`sidebar-repo-${r.name}`}
                    className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-secondary cursor-default"
                  >
                    <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
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
        )}
      </div>

      <div className="border-t border-border px-2 py-2 flex items-center justify-end">
        <button
          onClick={toggleTheme}
          className="rounded p-1.5 hover:bg-secondary text-muted-foreground"
          aria-label="toggle theme"
          data-testid="theme-toggle"
        >
          {theme === "dark" ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
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

function TideLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3 12 Q 8 7, 13 12 T 23 12 T 29 12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M3 20 Q 8 15, 13 20 T 23 20 T 29 20"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeOpacity="0.55"
        fill="none"
      />
    </svg>
  );
}
