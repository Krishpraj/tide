import { Command } from "cmdk";
import { useUiStore } from "../uistore";
import { useStore } from "../store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function QuickSwitcher() {
  const open = useUiStore((s) => s.quickSwitcherOpen);
  const setOpen = useUiStore((s) => s.setQuickSwitcherOpen);
  const openTicket = useUiStore((s) => s.openTicket);
  const tickets = useStore((s) => s.tickets);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        data-testid="quick-switcher"
        className="max-w-lg p-0 overflow-hidden"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Jump to ticket</DialogTitle>
        </DialogHeader>
        <Command className="bg-popover">
          <Command.Input
            placeholder="Jump to ticket…"
            className="w-full bg-transparent border-0 border-b border-border px-3 py-2.5 text-sm focus:outline-none"
            data-testid="quick-switcher-input"
          />
          <Command.List className="max-h-[300px] overflow-y-auto py-1">
            <Command.Empty className="px-3 py-6 text-center text-xs text-muted-foreground">
              No matching tickets.
            </Command.Empty>
            {tickets.map((t) => (
              <Command.Item
                key={t.id}
                value={t.title}
                onSelect={() => {
                  openTicket(t.id);
                  setOpen(false);
                }}
                data-testid={`qs-ticket-${t.title.replace(/\s+/g, "-")}`}
                className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer data-[selected=true]:bg-secondary"
              >
                {t.title}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
