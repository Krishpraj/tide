import { register } from "../rpc/handlers";
import { templatesDao } from "./dao";

register("listTemplates", async (input) => {
  const i = (input ?? {}) as { projectId?: string | null };
  return templatesDao.list(i);
});

register("createTemplate", async (input) => {
  const i = input as {
    projectId: string | null;
    name: string;
    icon?: string | null;
    titlePrefix?: string;
    bodyJson: string;
  };
  return templatesDao.insert(i);
});
