import { register } from "../rpc/handlers";
import { projectsDao } from "./dao";
import { emit } from "../rpc/events";

register("listProjects", async () => projectsDao.list());

register("createProject", async (input) => {
  const i = input as { name: string; color?: string };
  const p = projectsDao.insert({ name: i.name.trim(), color: i.color });
  emit("projectUpdated", { project: p });
  return p;
});

register("renameProject", async (input) => {
  const i = input as { id: string; name: string };
  const p = projectsDao.rename(i.id, i.name.trim());
  emit("projectUpdated", { project: p });
  return p;
});

register("deleteProject", async (id) => {
  projectsDao.delete(id as string);
});
