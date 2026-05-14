import { useMemo } from "react";
import { useStore, ticketInProject } from "../store";
import { useUiStore } from "../uistore";
import { TicketCard } from "./TicketCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function FocusView() {
  const open = useUiStore((s) => s.focusViewOpen);
  const setOpen = useUiStore((s) => s.setFocusViewOpen);
  const allTickets = useStore((s) => s.tickets);
  const repos = useStore((s) => s.repos);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const tickets = useMemo(
    () =>
      allTickets.filter(
        (t) =>
          (t.status === "in_progress" || t.status === "review") &&
          ticketInProject(t, repos, currentProjectId),
      ),
    [allTickets, repos, currentProjectId],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        data-testid="focus-view"
        className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>Focus mode · in-flight tickets</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2">
          {tickets.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              Nothing in progress yet.
            </p>
          )}
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              draggable={false}
              showStatusIcon
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
