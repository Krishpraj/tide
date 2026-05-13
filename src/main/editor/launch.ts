import { detectEditors } from "./detect";
import { reposDao, ticketsDao, settingsDao, eventsDao } from "../db/dao";
import { runGit } from "../git/ops";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Launch the user's editor at the repo path of a ticket's branch. Returns
 *  silently on success; throws on missing editor. */
export async function openInEditor(input: {
  ticketId: string;
  editorId: string;
}) {
  const t = ticketsDao.get(input.ticketId);
  if (!t || !t.repoId) throw new Error("ticket has no repo");
  const r = reposDao.get(t.repoId);
  if (!r) throw new Error("repo missing");

  if (t.branchName) {
    // best-effort checkout to the ticket's branch (won't switch if already there)
    await runGit(["checkout", t.branchName], {
      cwd: r.path,
      allowNonZero: true,
    });
  }

  let editor = detectEditors().find((e) => e.id === input.editorId);
  if (!editor) {
    const custom = settingsDao.get<string>("customEditorCommand");
    if (input.editorId === "custom" && custom) {
      editor = { id: "custom", label: "Custom", command: custom };
    } else {
      throw new Error(`editor not found: ${input.editorId}`);
    }
  }

  // Tests can intercept the launch with TIDE_EDITOR_STUB=1, which writes the
  // command + args to a sentinel file instead of spawning.
  if (Bun.env.TIDE_EDITOR_STUB === "1") {
    const sink = resolve(
      Bun.env.TIDE_DATA_DIR ?? "./data",
      "test",
      "last-editor-launch.json",
    );
    await mkdir(dirname(sink), { recursive: true });
    await writeFile(
      sink,
      JSON.stringify({
        command: editor.command,
        args: [r.path],
        ticketId: t.id,
      }),
    );
  } else {
    Bun.spawn([editor.command, r.path], {
      stdout: "ignore",
      stderr: "ignore",
    });
  }

  eventsDao.insert({
    ticketId: t.id,
    kind: "editor_opened",
    payload: { editor: editor.id },
  });
}
