import { useMemo } from "react";
import { Layout, X } from "lucide-react";
import { useStore } from "../store";
import { useUiStore } from "../uistore";
import { StatusIcon } from "../lib/status";

export function TopTabs() {
  const tickets = useStore((s) => s.tickets);
  const openTicketId = useUiStore((s) => s.openTicketId);
  const openTicket = useUiStore((s) => s.openTicket);

  const tabbedTickets = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.status === "in_progress" ||
          t.status === "review" ||
          t.status === "canceled",
      ),
    [tickets],
  );

  return (
    <div
      data-testid="top-tabs"
      className="flex items-center gap-px border-b border-border bg-card px-2 h-9"
    >
      <TabButton
        active={openTicketId === null}
        onClick={() => openTicket(null)}
        testid="tab-board"
      >
        <Layout className="h-3.5 w-3.5" /> Board
      </TabButton>
      {tabbedTickets.map((t) => (
        <TabButton
          key={t.id}
          active={openTicketId === t.id}
          onClick={() => openTicket(t.id)}
          testid={`tab-${t.title.replace(/\s+/g, "-")}`}
          onClose={
            openTicketId === t.id ? () => openTicket(null) : undefined
          }
        >
          <StatusIcon status={t.status} />
          <span className="max-w-[180px] truncate">{t.title}</span>
        </TabButton>
      ))}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  onClose,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  onClose?: () => void;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      data-active={active ? "true" : "false"}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs cursor-pointer transition-colors ${
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
      }`}
      onClick={onClick}
    >
      {children}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="close tab"
          className="rounded p-0.5 hover:bg-background/50"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
