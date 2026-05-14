// RPC for saving editor-pasted/dropped image bytes to disk so Claude can
// Read them by absolute path during a ticket run.
//
// Storage location:
//   - If `repoId` is given: <repo.path>/.tide/attachments/<ticketId-or-nonce>/<file>
//   - Else: <TIDE_DATA_DIR>/attachments/<nonce>/<file>
//
// The .tide directory is added to the repo's .gitignore lazily on first use.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ulid } from "ulid";
import { register } from "../rpc/handlers";
import { reposDao } from "./dao";

function dataDir(): string {
  return Bun.env.TIDE_DATA_DIR
    ? resolve(Bun.env.TIDE_DATA_DIR)
    : resolve(process.cwd(), "data");
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

async function ensureGitignoreEntry(repoPath: string): Promise<void> {
  const gi = join(repoPath, ".gitignore");
  let body = "";
  try {
    body = await readFile(gi, "utf8");
  } catch {
    // file doesn't exist yet
  }
  if (body.split(/\r?\n/).some((l) => l.trim() === ".tide" || l.trim() === ".tide/")) {
    return;
  }
  const next = body && !body.endsWith("\n") ? body + "\n.tide/\n" : body + ".tide/\n";
  await writeFile(gi, next, "utf8");
}

register("saveAttachment", async (input) => {
  const i = input as {
    base64: string;
    mimeType: string;
    repoId?: string | null;
    ticketId?: string | null;
    filename?: string;
  };
  if (!i.base64) throw new Error("saveAttachment: base64 is required");
  if (!i.mimeType) throw new Error("saveAttachment: mimeType is required");

  const ext = EXT_BY_MIME[i.mimeType] ?? "bin";
  const stem = (i.filename ?? "image").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 40);
  const name = `${stem}-${ulid().slice(-6)}.${ext}`;

  // Decide directory.
  let absDir: string;
  if (i.repoId) {
    const repo = reposDao.get(i.repoId);
    if (!repo) throw new Error(`unknown repo: ${i.repoId}`);
    const scope = i.ticketId ?? `draft-${ulid().slice(-8)}`;
    absDir = join(repo.path, ".tide", "attachments", scope);
    await mkdir(absDir, { recursive: true });
    // Best-effort .gitignore touch — silent on failure.
    void ensureGitignoreEntry(repo.path).catch(() => {});
  } else {
    const scope = i.ticketId ?? `draft-${ulid().slice(-8)}`;
    absDir = join(dataDir(), "attachments", scope);
    await mkdir(absDir, { recursive: true });
  }

  const absPath = join(absDir, name);
  await mkdir(dirname(absPath), { recursive: true });
  const buf = Buffer.from(i.base64, "base64");
  await writeFile(absPath, buf);

  return { absolutePath: absPath, filename: name, bytes: buf.length };
});

// Silence "unused" warning for existsSync — kept import for future use.
void existsSync;
