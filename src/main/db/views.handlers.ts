import { register } from "../rpc/handlers";
import { savedViewsDao } from "./dao";
import type { SavedView } from "@shared/types";

register("listSavedViews", async () => savedViewsDao.list());

register("saveView", async (input) => {
  const i = input as Omit<SavedView, "id" | "position">;
  return savedViewsDao.insert(i);
});

register("deleteView", async (id) => {
  savedViewsDao.delete(id as string);
});
