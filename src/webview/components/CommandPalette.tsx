import { Command } from "cmdk";
import { useUiStore } from "../uistore";
import { useStore } from "../store";
import { rpc } from "../rpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useEffect, useState } from "react";

export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const triggerComposer = useUiStore((s) => s.triggerFocusComposer);
  const setCs = useUiStore((s) => s.setCheatsheetOpen);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const setFv = useUiStore((s) => s.setFocusViewOpen);
  const setQs = useUiStore((s) => s.setQuickSwitcherOpen);

  const projects = useStore((s) => s.projects);
  const repos = useStore((s) => s.repos);
  const tickets = useStore((s) => s.tickets);
  const setProject = useStore((s) => s.setCurrentProject);

  const [views, setViews] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (open) {
      rpc.listSavedViews().then(setViews).catch(() => setViews([]));
    }
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        data-testid="command-palette"
        className="max-w-xl p-0 overflow-hidden"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
        </DialogHeader>
        <Command className="bg-popover">
          <Command.Input
            placeholder="Search commands, tickets, repos…"
            className="w-full bg-transparent border-0 border-b border-border px-3 py-2.5 text-sm focus:outline-none"
            data-testid="command-input"
          />
          <Command.List className="max-h-[360px] overflow-y-auto py-1">
            <Command.Empty className="px-3 py-6 text-center text-xs text-muted-foreground">
              No results.
            </Command.Empty>

            <Command.Group heading="Tickets">
              <CmdItem
                onSelect={() => {
                  triggerComposer();
                  close();
                }}
                testid="cmd-new-ticket"
              >
                New ticket
                <kbd className="ml-auto text-[10px] opacity-60">C</kbd>
              </CmdItem>
              <CmdItem
                onSelect={() => {
                  setFv(true);
                  close();
                }}
                testid="cmd-focus-view"
              >
                Focus mode
                <kbd className="ml-auto text-[10px] opacity-60">F</kbd>
              </CmdItem>
              <CmdItem
                onSelect={() => {
                  setQs(true);
                  close();
                }}
                testid="cmd-quick-switcher"
              >
                Jump to ticket…
                <kbd className="ml-auto text-[10px] opacity-60">⌘P</kbd>
              </CmdItem>
            </Command.Group>

            <Command.Group heading="Recent tickets">
              {tickets.slice(0, 8).map((t) => (
                <CmdItem
                  key={t.id}
                  onSelect={() => {
                    useUiStore.getState().openTicket(t.id);
                    close();
                  }}
                  testid={`cmd-ticket-${t.title.replace(/\s+/g, "-")}`}
                >
                  {t.title}
                </CmdItem>
              ))}
            </Command.Group>

            <Command.Group heading="Projects">
              {projects.map((p) => (
                <CmdItem
                  key={p.id}
                  onSelect={() => {
                    setProject(p.id);
                    close();
                  }}
                  testid={`cmd-project-${p.name}`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  Switch to {p.name}
                </CmdItem>
              ))}
            </Command.Group>

            <Command.Group heading="Repos">
              {repos.map((r) => (
                <CmdItem
                  key={r.id}
                  onSelect={() => close()}
                  testid={`cmd-repo-${r.name}`}
                >
                  Open repo {r.name}
                </CmdItem>
              ))}
            </Command.Group>

            {views.length > 0 && (
              <Command.Group heading="Views">
                {views.map((v) => (
                  <CmdItem
                    key={v.id}
                    onSelect={() => close()}
                    testid={`cmd-view-${v.name.replace(/\s+/g, "-")}`}
                  >
                    {v.name}
                  </CmdItem>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="App">
              <CmdItem
                onSelect={() => {
                  toggleTheme();
                  close();
                }}
                testid="cmd-toggle-theme"
              >
                Toggle theme
                <kbd className="ml-auto text-[10px] opacity-60">T</kbd>
              </CmdItem>
              <CmdItem
                onSelect={() => {
                  setCs(true);
                  close();
                }}
                testid="cmd-shortcuts"
              >
                Keyboard shortcuts
                <kbd className="ml-auto text-[10px] opacity-60">?</kbd>
              </CmdItem>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CmdItem({
  children,
  onSelect,
  testid,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  testid?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      data-testid={testid}
      className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer data-[selected=true]:bg-secondary"
    >
      {children}
    </Command.Item>
  );
}
