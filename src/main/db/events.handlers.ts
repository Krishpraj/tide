import { register } from "../rpc/handlers";
import { eventsDao } from "./dao";

register("getTicketEvents", async (ticketId) => {
  return eventsDao.forTicket(ticketId as string);
});
