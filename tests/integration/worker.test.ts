import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

// Force the stub runner before any module import.
process.env.TIDE_RUNNER = "stub";
process.env.TIDE_DATA_DIR = mkdtempSync(join(tmpdir(), "tide-worker-test-"));

let dao: typeof import("@main/db/dao");
let client: typeof import("@main/db/client");
let pool: typeof import("@main/queue/WorkerPool");

function shellGit(cwd: string, args: string[]) {
  execSync(`git ${args.map((a) => `"${a}"`).join(" ")}`, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function makeRepo(name: string): string {
  const dir = join(
    mkdtempSync(join(tmpdir(), `tide-repo-${name}-`)),
    name,
  );
  execSync(`mkdir -p "${dir}"`, { shell: "bash" });
  shellGit(dir, ["init", "--initial-branch=main"]);
  shellGit(dir, ["config", "user.email", "tide@local"]);
  shellGit(dir, ["config", "user.name", "Tide"]);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  shellGit(dir, ["add", "."]);
  shellGit(dir, ["commit", "-m", "init"]);
  return dir;
}

async function waitFor(predicate: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await Bun.sleep(20);
  }
}

beforeAll(async () => {
  client = await import("../../src/main/db/client");
  await client.initDb();
  dao = await import("../../src/main/db/dao");
  pool = await import("../../src/main/queue/WorkerPool");
});

beforeEach(() => {
  const db = client.getDb();
  db.exec(`
    DELETE FROM ticket_events;
    DELETE FROM claude_sessions;
    DELETE FROM ticket_comments;
    DELETE FROM ticket_links;
    DELETE FROM ticket_labels;
    DELETE FROM tickets;
    DELETE FROM notifications;
    DELETE FROM repos;
    DELETE FROM projects;
    INSERT INTO projects (id, name, color, position, created_at) VALUES ('default', 'Default', '#5E6AD2', 0, ${Date.now()});
  `);
});

describe("RepoWorker", () => {
  test("runs two tickets sequentially, lands a commit each", async () => {
    const path = makeRepo("alpha");
    const repo = dao.reposDao.insert({
      projectId: "default",
      name: "alpha",
      path,
    });
    const t1 = dao.ticketsDao.insert({
      title: "Add LICENSE",
      descriptionMd: "TEST_FILE: LICENSE: MIT\n",
      status: "backlog",
      repoId: repo.id,
    });
    const t2 = dao.ticketsDao.insert({
      title: "Add CHANGELOG",
      descriptionMd: "TEST_FILE: CHANGELOG.md: ## v1\n",
      status: "backlog",
      repoId: repo.id,
    });
    pool.enqueueTicket(repo.id, t1.id);
    pool.enqueueTicket(repo.id, t2.id);

    await waitFor(
      () =>
        dao.ticketsDao.get(t1.id)?.status === "review" &&
        dao.ticketsDao.get(t2.id)?.status === "review",
      8000,
    );

    const r1 = dao.ticketsDao.get(t1.id)!;
    const r2 = dao.ticketsDao.get(t2.id)!;
    expect(r1.branchName).not.toBeNull();
    expect(r2.branchName).not.toBeNull();
    expect(r1.branchName).not.toBe(r2.branchName);

    // Verify diff actually contains the expected files.
    const { diffAgainstBase } = await import("../../src/main/git/ops");
    const d1 = await diffAgainstBase(path, "main", r1.branchName!);
    const d2 = await diffAgainstBase(path, "main", r2.branchName!);
    expect(d1).toContain("LICENSE");
    expect(d2).toContain("CHANGELOG.md");
  });

  test("stub TEST_THROW lands ticket in failed status", async () => {
    const path = makeRepo("beta");
    const repo = dao.reposDao.insert({
      projectId: "default",
      name: "beta",
      path,
    });
    const t = dao.ticketsDao.insert({
      title: "Boom",
      descriptionMd: "TEST_THROW: synthetic failure",
      status: "backlog",
      repoId: repo.id,
    });
    pool.enqueueTicket(repo.id, t.id);
    await waitFor(() => dao.ticketsDao.get(t.id)?.status === "failed", 5000);
    const events = dao.eventsDao.forTicket(t.id);
    expect(events.some((e) => e.kind === "error")).toBe(true);
  });

  test("cancel a hanging stub run moves ticket to canceled", async () => {
    const path = makeRepo("gamma");
    const repo = dao.reposDao.insert({
      projectId: "default",
      name: "gamma",
      path,
    });
    const t = dao.ticketsDao.insert({
      title: "Forever",
      descriptionMd: "TEST_HANG",
      status: "backlog",
      repoId: repo.id,
    });
    pool.enqueueTicket(repo.id, t.id);
    await waitFor(
      () => dao.ticketsDao.get(t.id)?.status === "in_progress",
      3000,
    );
    pool.cancelTicket(t.id);
    await waitFor(
      () => {
        const s = dao.ticketsDao.get(t.id)?.status;
        return s === "canceled" || s === "review";
      },
      5000,
    );
    const events = dao.eventsDao.forTicket(t.id);
    expect(events.some((e) => e.kind === "canceled")).toBe(true);
  });

  test("blocked_by ticket waits, then runs after blocker is done", async () => {
    const path = makeRepo("delta");
    const repo = dao.reposDao.insert({
      projectId: "default",
      name: "delta",
      path,
    });
    const blocker = dao.ticketsDao.insert({
      title: "Blocker",
      descriptionMd: "TEST_FILE: A.txt: a",
      status: "backlog",
      repoId: repo.id,
    });
    const blocked = dao.ticketsDao.insert({
      title: "Blocked",
      descriptionMd: "TEST_FILE: B.txt: b",
      status: "backlog",
      repoId: repo.id,
    });
    dao.linksDao.insert({
      fromTicketId: blocked.id,
      toTicketId: blocker.id,
      kind: "blocked_by",
    });

    // Enqueue blocked FIRST — it must not start before blocker is done.
    pool.enqueueTicket(repo.id, blocked.id);
    pool.enqueueTicket(repo.id, blocker.id);

    await waitFor(() => {
      return dao.ticketsDao.get(blocker.id)?.status === "review";
    }, 6000);

    // At this moment blocked is still queued (its blocker is review, not done).
    expect(dao.ticketsDao.get(blocked.id)?.status).toBe("queued");

    // Move blocker to done; worker should pick up blocked.
    dao.ticketsDao.update(blocker.id, { status: "done" });
    pool.notifyAllUnblocked();
    await waitFor(
      () => dao.ticketsDao.get(blocked.id)?.status === "review",
      6000,
    );
  });
});
