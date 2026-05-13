import { register } from "../rpc/handlers";
import { commentsDao } from "./dao";

register("listComments", async (ticketId) => {
  return commentsDao.forTicket(ticketId as string);
});

register("addComment", async (input) => {
  const i = input as { ticketId: string; body: string; bodyMd?: string };
  return commentsDao.insert(i);
});

register("editComment", async (input) => {
  const i = input as { id: string; body: string; bodyMd?: string };
  return commentsDao.update(i.id, i.body, i.bodyMd);
});

register("deleteComment", async (id) => {
  commentsDao.delete(id as string);
});
