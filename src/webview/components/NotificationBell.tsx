import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { rpc } from "../rpc";
import { useUiStore } from "../uistore";
import { useStore } from "../store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { Button } from "./ui/button";
import type { Notification } from "@shared/types";

export function NotificationBell() {
  const initial = useStore((s) => s.notifications);
  const [list, setList] = useState<Notification[]>(initial);
  const [open, setOpen] = useState(false);
  const openTicket = useUiStore((s) => s.openTicket);

  useEffect(() => {
    setList(initial);
  }, [initial]);

  const unread = list.filter((n) => !n.readAt).length;

  async function markRead(id: string) {
    await rpc.markNotificationRead(id);
    setList((l) =>
      l.map((n) => (n.id === id ? { ...n, readAt: Date.now() } : n)),
    );
  }
  async function markAllRead() {
    await rpc.markAllNotificationsRead();
    setList((l) =>
      l.map((n) => (n.readAt ? n : { ...n, readAt: Date.now() })),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded p-1 hover:bg-secondary text-muted-foreground"
          aria-label="notifications"
          data-testid="notification-bell"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              data-testid="notification-unread-count"
              className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-destructive text-[9px] text-destructive-foreground font-medium flex items-center justify-center px-0.5"
            >
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[320px]"
        data-testid="notification-popover"
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-medium">Notifications</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              data-testid="notifications-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {list.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">No notifications.</p>
          )}
          {list.map((n) => (
            <div
              key={n.id}
              data-testid={`notification-${n.kind}`}
              onClick={() => {
                if (n.ticketId) openTicket(n.ticketId);
                void markRead(n.id);
                setOpen(false);
              }}
              className={`rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-secondary ${
                n.readAt ? "opacity-60" : ""
              }`}
            >
              <div className="font-medium text-foreground">{n.title}</div>
              {n.body && (
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {n.body}
                </div>
              )}
              <div className="text-[10px] opacity-50 mt-0.5">
                {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
