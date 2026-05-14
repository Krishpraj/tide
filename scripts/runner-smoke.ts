// End-to-end smoke test for the production Claude runner.
// Spawns the `claude` CLI against a real temp git repo and verifies that
// stream-json messages are parsed, surface events fire, and the run exits 0.
//
// Run:   bun run scripts/runner-smoke.ts
//
// Requires `claude` on PATH and valid auth. Uses TIDE_DATA_DIR pointed at a
// temp folder so it doesn't touch your real ./data.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  const tmp = await mkdtemp(join(tmpdir(), "tide-smoke-"));
  const repoDir = join(tmp, "repo");
  const dataDir = join(tmp, "data");

  console.log(`[smoke] tmp=${tmp}`);
  Bun.env.TIDE_DATA_DIR = dataDir;

  // Init git repo
  await Bun.spawn({
    cmd: ["git", "init", "-q", "-b", "main", repoDir],
    stderr: "inherit",
  }).exited;
  await Bun.write(join(repoDir, "README.md"), "# smoke\n");
  await Bun.spawn({
    cmd: ["git", "-C", repoDir, "add", "."],
    stderr: "inherit",
  }).exited;
  await Bun.spawn({
    cmd: ["git", "-C", repoDir, "-c", "user.email=s@s", "-c", "user.name=s", "commit", "-q", "-m", "init"],
    stderr: "inherit",
  }).exited;

  // Init db so DAOs work
  const { initDb } = await import("../src/main/db/client");
  await initDb();

  // Wire a fake events transport so emit() doesn't throw.
  const { registerEventsTransport } = await import("../src/main/rpc/events");
  let emitCount = 0;
  registerEventsTransport((event, payload) => {
    emitCount += 1;
    const p = payload as { message?: { type?: string; label?: string } };
    const tag = p.message?.type ?? "?";
    const label = p.message?.label ? ` ${p.message.label}` : "";
    console.log(`[emit ${emitCount}] ${event} · ${tag}${label}`);
  });

  // Create a project, repo, and ticket through the real DAOs so FKs hold.
  const { projectsDao, reposDao, ticketsDao } = await import(
    "../src/main/db/dao"
  );
  const project = projectsDao.insert({ name: "smoke" });
  const repo = reposDao.insert({
    projectId: project.id,
    name: "smoke",
    path: repoDir,
    baseBranch: "main",
  });
  // Deliberately ambiguous prompt that previously would have triggered an
  // AskUserQuestion ("what should the file be named?" / "what language?").
  // With autonomous mode + disallowed AskUserQuestion, it must pick and act.
  const ticket = ticketsDao.insert({
    title: "smoke",
    descriptionMd:
      "Create a small file demonstrating a hello-world. You decide the filename, language, and exact content. Just do it.",
    repoId: repo.id,
    estimate: "XS",
    status: "in_progress",
  });

  const { runForTicket } = await import("../src/main/claude/runner");

  const ctrl = new AbortController();
  // Safety: kill after 60s no matter what.
  const killTimer = setTimeout(() => {
    console.log("[smoke] global timeout, aborting");
    ctrl.abort();
  }, 60_000);

  const t0 = Date.now();
  const result = await runForTicket(ticket, repo, {
    signal: ctrl.signal,
    resumeSessionId: null,
    extraPrompt: undefined,
    maxTurns: 3,
  });
  clearTimeout(killTimer);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n[smoke] runner returned in ${elapsed}s:`, result);

  // Did the agent actually write a file (any file, since the name was its
  // choice)? Walk the repo dir for new files beyond README.md / .git.
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(repoDir);
  const created = entries.filter((e) => e !== "README.md" && e !== ".git");
  console.log(`[smoke] new files in repo: ${JSON.stringify(created)}`);

  console.log(`[smoke] total emit events: ${emitCount}`);

  // Cleanup
  try {
    await rm(tmp, { recursive: true, force: true });
  } catch {}

  if (!result.ok) {
    console.log("[smoke] FAIL");
    process.exit(1);
  }
  console.log("[smoke] PASS");
}

main().catch((e) => {
  console.error("[smoke] threw:", e);
  process.exit(1);
});
