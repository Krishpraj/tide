import { register } from "../rpc/handlers";
import { notificationsDao } from "./dao";

register("listNotifications", async (input) => {
  const i = (input ?? {}) as { unreadOnly?: boolean };
  return notificationsDao.list(i);
});

register("markNotificationRead", async (id) => {
  notificationsDao.markRead(id as string);
});

register("markAllNotificationsRead", async () => {
  notificationsDao.markAllRead();
});
