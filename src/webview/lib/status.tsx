import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Moon,
  XCircle,
  Inbox,
} from "lucide-react";
import type { Priority, TicketStatus } from "@shared/types";

export const STATUS_COLUMNS: TicketStatus[] = [
  "triage",
  "backlog",
  "queued",
  "in_progress",
  "review",
  "done",
];

export function statusLabel(s: TicketStatus): string {
  switch (s) {
    case "triage":
      return "Triage";
    case "backlog":
      return "Backlog";
    case "queued":
      return "Queued";
    case "in_progress":
      return "In Progress";
    case "review":
      return "Review";
    case "done":
      return "Done";
    case "discarded":
      return "Discarded";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    case "snoozed":
      return "Snoozed";
  }
}

export function StatusIcon({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  const cls = className ?? "h-3.5 w-3.5";
  switch (status) {
    case "triage":
      return <Inbox className={cls} />;
    case "backlog":
      return <Circle className={cls + " text-muted-foreground"} />;
    case "queued":
      return <CircleDashed className={cls + " text-muted-foreground"} />;
    case "in_progress":
      return <CircleDot className={cls + " text-primary"} />;
    case "review":
      return <CircleCheck className={cls + " text-yellow-500"} />;
    case "done":
      return <CheckCircle2 className={cls + " text-emerald-500"} />;
    case "discarded":
      return <XCircle className={cls + " text-muted-foreground"} />;
    case "canceled":
      return <Ban className={cls + " text-muted-foreground"} />;
    case "failed":
      return <AlertCircle className={cls + " text-destructive"} />;
    case "snoozed":
      return <Moon className={cls + " text-muted-foreground"} />;
  }
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: "No priority",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export function PriorityIcon({
  value,
  className,
}: {
  value: Priority;
  className?: string;
}) {
  const cls = "h-3.5 w-3.5 " + (className ?? "");
  // Each priority is rendered as a stack of bars (Linear-style).
  return (
    <svg
      viewBox="0 0 16 16"
      className={cls}
      fill="currentColor"
      data-priority={value}
    >
      {value === 0 ? (
        <g opacity={0.5}>
          <circle cx="3" cy="8" r="1" />
          <circle cx="8" cy="8" r="1" />
          <circle cx="13" cy="8" r="1" />
        </g>
      ) : value === 4 ? (
        <g className="text-priority-urgent">
          <rect x="1" y="2" width="14" height="12" rx="2" />
          <rect x="7" y="4" width="2" height="6" fill="white" />
          <rect x="7" y="11" width="2" height="2" fill="white" />
        </g>
      ) : (
        <g
          className={
            value === 3
              ? "text-priority-high"
              : value === 2
                ? "text-priority-medium"
                : "text-priority-low"
          }
        >
          <rect
            x="1"
            y="11"
            width="3"
            height="4"
            opacity={value >= 1 ? 1 : 0.25}
          />
          <rect
            x="6"
            y="7"
            width="3"
            height="8"
            opacity={value >= 2 ? 1 : 0.25}
          />
          <rect
            x="11"
            y="3"
            width="3"
            height="12"
            opacity={value >= 3 ? 1 : 0.25}
          />
        </g>
      )}
    </svg>
  );
}

export function priorityColorClass(value: Priority): string {
  switch (value) {
    case 4:
      return "text-priority-urgent";
    case 3:
      return "text-priority-high";
    case 2:
      return "text-priority-medium";
    case 1:
      return "text-priority-low";
    default:
      return "text-priority-none";
  }
}
