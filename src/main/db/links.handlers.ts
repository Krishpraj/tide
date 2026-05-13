import { register } from "../rpc/handlers";
import { linksDao, ticketsDao } from "./dao";
import { emit } from "../rpc/events";
import type { LinkKind } from "@shared/types";

register("addLink", async (input) => {
  const i = input as {
    fromTicketId: string;
    toTicketId: string;
    kind: LinkKind;
  };
  const link = linksDao.insert(i);
  // Notify both tickets so any UI showing them refreshes link counts.
  const a = ticketsDao.get(i.fromTicketId);
  const b = ticketsDao.get(i.toTicketId);
  if (a) emit("ticketUpdated", { ticket: ticketsDao.withLabels(a) });
  if (b) emit("ticketUpdated", { ticket: ticketsDao.withLabels(b) });
  return link;
});

register("removeLink", async (id) => {
  linksDao.delete(id as number);
});

register("getLinks", async (ticketId) => {
  return linksDao.forTicket(ticketId as string);
});
