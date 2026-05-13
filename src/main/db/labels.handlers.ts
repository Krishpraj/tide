import { register } from "../rpc/handlers";
import { labelsDao } from "./dao";
import { emit } from "../rpc/events";

register("listLabels", async (input) => {
  const i = (input ?? {}) as { projectId?: string | null };
  return labelsDao.list(i);
});

register("createLabel", async (input) => {
  const i = input as { projectId: string | null; name: string; color: string };
  const l = labelsDao.insert({
    projectId: i.projectId,
    name: i.name.trim(),
    color: i.color,
  });
  emit("labelUpdated", { label: l });
  return l;
});

register("deleteLabel", async (id) => {
  labelsDao.delete(id as string);
});
