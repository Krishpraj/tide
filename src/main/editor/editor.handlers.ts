import { register } from "../rpc/handlers";
import { detectEditors } from "./detect";
import { openInEditor } from "./launch";

register("listEditors", async () => detectEditors());

register("openInEditor", async (input) => {
  await openInEditor(input as { ticketId: string; editorId: string });
});
