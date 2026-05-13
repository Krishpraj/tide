import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "tide-test-"));
process.env.TIDE_DATA_DIR = tmp;

let dao: typeof import("@main/db/dao");
let client: typeof import("@main/db/client");

beforeAll(async () => {
  client = await import("../../src/main/db/client");
  await client.initDb();
  dao = await import("../../src/main/db/dao");
});

beforeEach(() => {
  // Each test starts from a clean slate by wiping tables (keep schema).
  const db = client.getDb();
  db.exec(`
    DELETE FROM ticket_events;
    DELETE FROM claude_sessions;
    DELETE FROM ticket_comments;
    DELETE FROM ticket_links;
    DELETE FROM ticket_labels;
    DELETE FROM tickets;
    DELETE FROM ticket_templates;
    DELETE FROM labels;
    DELETE FROM notifications;
    DELETE FROM saved_views;
    DELETE FROM app_settings;
    DELETE FROM repos;
    DELETE FROM projects;
    INSERT INTO projects (id, name, color, position, created_at) VALUES ('default', 'Default', '#5E6AD2', 0, ${Date.now()});
  `);
});

describe("projects", () => {
  test("insert + list", () => {
    const p = dao.projectsDao.insert({ name: "Work" });
    expect(p.name).toBe("Work");
    const list = dao.projectsDao.list();
    expect(list.length).toBe(2); // Default + Work
    expect(list.some((x) => x.id === p.id)).toBe(true);
  });

  test("rename", () => {
    const p = dao.projectsDao.insert({ name: "A" });
    dao.projectsDao.rename(p.id, "B");
    expect(dao.projectsDao.get(p.id)?.name).toBe("B");
  });

  test("delete cascades labels (FK ON DELETE CASCADE)", () => {
    const p = dao.projectsDao.insert({ name: "P" });
    dao.labelsDao.insert({ projectId: p.id, name: "bug", color: "#f00" });
    dao.projectsDao.delete(p.id);
    expect(dao.labelsDao.list({ projectId: p.id })).toEqual([]);
  });
});

describe("repos", () => {
  test("insert with project, get by path, unique path", () => {
    const r = dao.reposDao.insert({
      projectId: "default",
      name: "alpha",
      path: "/tmp/alpha",
    });
    expect(r.baseBranch).toBe("main");
    expect(dao.reposDao.getByPath("/tmp/alpha")?.id).toBe(r.id);
    expect(() =>
      dao.reposDao.insert({
        projectId: "default",
        name: "alpha2",
        path: "/tmp/alpha",
      }),
    ).toThrow();
  });

  test("move repo between projects", () => {
    const p2 = dao.projectsDao.insert({ name: "Other" });
    const r = dao.reposDao.insert({
      projectId: "default",
      name: "x",
      path: "/tmp/x",
    });
    dao.reposDao.setProject(r.id, p2.id);
    expect(dao.reposDao.get(r.id)?.projectId).toBe(p2.id);
  });

  test("delete project nulls repo.project_id (FK ON DELETE SET NULL)", () => {
    const p = dao.projectsDao.insert({ name: "Z" });
    const r = dao.reposDao.insert({
      projectId: p.id,
      name: "r",
      path: "/tmp/r",
    });
    dao.projectsDao.delete(p.id);
    expect(dao.reposDao.get(r.id)?.projectId).toBeNull();
  });
});

describe("labels + ticket_labels", () => {
  test("setForTicket replaces existing labels", () => {
    const t = dao.ticketsDao.insert({ title: "x", status: "backlog" });
    const a = dao.labelsDao.insert({ projectId: null, name: "a", color: "#fff" });
    const b = dao.labelsDao.insert({ projectId: null, name: "b", color: "#fff" });
    dao.labelsDao.setForTicket(t.id, [a.id, b.id]);
    expect(dao.labelsDao.forTicket(t.id).map((l) => l.name).sort()).toEqual([
      "a",
      "b",
    ]);
    dao.labelsDao.setForTicket(t.id, [a.id]);
    expect(dao.labelsDao.forTicket(t.id).map((l) => l.name)).toEqual(["a"]);
  });
});

describe("tickets", () => {
  test("defaults to triage; priority/estimate/labels round-trip", () => {
    const t = dao.ticketsDao.insert({
      title: "Hello",
      description: '{"type":"doc"}',
      descriptionMd: "Hello",
      priority: 3,
      estimate: "M",
    });
    expect(t.status).toBe("triage");
    expect(t.priority).toBe(3);
    expect(t.estimate).toBe("M");
    expect(t.descriptionMd).toBe("Hello");
    expect(dao.ticketsDao.get(t.id)?.title).toBe("Hello");
  });

  test("update mutates and bumps updated_at", () => {
    const t = dao.ticketsDao.insert({ title: "T" });
    const before = t.updatedAt;
    Bun.sleepSync(2);
    const t2 = dao.ticketsDao.update(t.id, { status: "backlog", priority: 4 });
    expect(t2.status).toBe("backlog");
    expect(t2.priority).toBe(4);
    expect(t2.updatedAt).toBeGreaterThan(before);
  });

  test("bulkUpdate is atomic in a transaction", () => {
    const ids = [
      dao.ticketsDao.insert({ title: "1" }).id,
      dao.ticketsDao.insert({ title: "2" }).id,
      dao.ticketsDao.insert({ title: "3" }).id,
    ];
    dao.ticketsDao.bulkUpdate(ids, { priority: 2 });
    for (const id of ids) {
      expect(dao.ticketsDao.get(id)?.priority).toBe(2);
    }
  });

  test("position auto-increments within status", () => {
    const a = dao.ticketsDao.insert({ title: "1", status: "backlog" });
    const b = dao.ticketsDao.insert({ title: "2", status: "backlog" });
    expect(b.position).toBe(a.position + 1);
  });

  test("delete cascades events, sessions, comments, labels", () => {
    const t = dao.ticketsDao.insert({ title: "x" });
    dao.eventsDao.insert({ ticketId: t.id, kind: "test", payload: {} });
    dao.sessionsDao.start(t.id);
    dao.commentsDao.insert({ ticketId: t.id, body: "{}", bodyMd: "hi" });
    const l = dao.labelsDao.insert({
      projectId: null,
      name: "lbl",
      color: "#fff",
    });
    dao.labelsDao.setForTicket(t.id, [l.id]);
    dao.ticketsDao.delete(t.id);
    expect(dao.eventsDao.forTicket(t.id)).toEqual([]);
    expect(dao.sessionsDao.latestForTicket(t.id)).toBeNull();
    expect(dao.commentsDao.forTicket(t.id)).toEqual([]);
    expect(dao.labelsDao.forTicket(t.id)).toEqual([]);
  });
});

describe("ticket links", () => {
  test("blocked_by + blockers query", () => {
    const a = dao.ticketsDao.insert({ title: "A" });
    const b = dao.ticketsDao.insert({ title: "B" });
    dao.linksDao.insert({
      fromTicketId: a.id,
      toTicketId: b.id,
      kind: "blocked_by",
    });
    expect(dao.linksDao.blockersOf(a.id).map((l) => l.toTicket)).toEqual([
      b.id,
    ]);
  });

  test("rejects self-link", () => {
    const a = dao.ticketsDao.insert({ title: "A" });
    expect(() =>
      dao.linksDao.insert({
        fromTicketId: a.id,
        toTicketId: a.id,
        kind: "relates_to",
      }),
    ).toThrow();
  });

  test("rejects simple blocking cycle", () => {
    const a = dao.ticketsDao.insert({ title: "A" });
    const b = dao.ticketsDao.insert({ title: "B" });
    dao.linksDao.insert({
      fromTicketId: a.id,
      toTicketId: b.id,
      kind: "blocked_by",
    });
    expect(() =>
      dao.linksDao.insert({
        fromTicketId: b.id,
        toTicketId: a.id,
        kind: "blocked_by",
      }),
    ).toThrow();
  });
});

describe("comments", () => {
  test("insert + edit + delete", () => {
    const t = dao.ticketsDao.insert({ title: "x" });
    const c = dao.commentsDao.insert({
      ticketId: t.id,
      body: "{}",
      bodyMd: "first",
    });
    expect(dao.commentsDao.forTicket(t.id).length).toBe(1);
    const c2 = dao.commentsDao.update(c.id, "{}", "edited");
    expect(c2.bodyMd).toBe("edited");
    expect(c2.updatedAt).toBeGreaterThanOrEqual(c.updatedAt);
    dao.commentsDao.delete(c.id);
    expect(dao.commentsDao.forTicket(t.id)).toEqual([]);
  });
});

describe("notifications", () => {
  test("insert + unread count + markAllRead", () => {
    dao.notificationsDao.insert({
      kind: "review_ready",
      title: "ready",
      body: null,
    });
    dao.notificationsDao.insert({
      kind: "failed",
      title: "failed",
      body: null,
    });
    expect(dao.notificationsDao.unreadCount()).toBe(2);
    dao.notificationsDao.markAllRead();
    expect(dao.notificationsDao.unreadCount()).toBe(0);
  });
});

describe("saved views", () => {
  test("round-trip filters_json", () => {
    const sv = dao.savedViewsDao.insert({
      name: "My reviews",
      groupBy: "status",
      sortBy: "priority",
      filtersJson: JSON.stringify({ status: "review" }),
    });
    const list = dao.savedViewsDao.list();
    expect(list.find((v) => v.id === sv.id)?.filtersJson).toBe(
      '{"status":"review"}',
    );
  });
});

describe("templates", () => {
  test("project-scoped listing", () => {
    const p = dao.projectsDao.insert({ name: "P" });
    dao.templatesDao.insert({
      projectId: p.id,
      name: "Fix bug",
      bodyJson: "{}",
    });
    dao.templatesDao.insert({
      projectId: null,
      name: "Global",
      bodyJson: "{}",
    });
    expect(
      dao.templatesDao.list({ projectId: p.id }).map((t) => t.name),
    ).toEqual(["Fix bug"]);
    expect(
      dao.templatesDao.list({ projectId: null }).map((t) => t.name),
    ).toEqual(["Global"]);
  });
});

describe("events + sessions", () => {
  test("eventsDao orders by ts asc", () => {
    const t = dao.ticketsDao.insert({ title: "x" });
    dao.eventsDao.insert({ ticketId: t.id, kind: "a", payload: {} });
    Bun.sleepSync(2);
    dao.eventsDao.insert({ ticketId: t.id, kind: "b", payload: {} });
    const events = dao.eventsDao.forTicket(t.id);
    expect(events.map((e) => e.kind)).toEqual(["a", "b"]);
  });

  test("sessionsDao lifecycle", () => {
    const t = dao.ticketsDao.insert({ title: "x" });
    const s = dao.sessionsDao.start(t.id);
    dao.sessionsDao.setSdkId(s.id, "sdk-123");
    dao.sessionsDao.finish(s.id, "completed");
    const latest = dao.sessionsDao.latestForTicket(t.id)!;
    expect(latest.sdkSessionId).toBe("sdk-123");
    expect(latest.status).toBe("completed");
    expect(latest.endedAt).not.toBeNull();
  });
});

describe("settings", () => {
  test("get/set round-trip JSON", () => {
    dao.settingsDao.set("preferredEditor", "vscode");
    dao.settingsDao.set("theme", { mode: "dark" });
    expect(dao.settingsDao.get<string>("preferredEditor")).toBe("vscode");
    expect(dao.settingsDao.get<{ mode: string }>("theme")).toEqual({
      mode: "dark",
    });
  });
});

// Tmp dir is left for OS cleanup — Windows holds the WAL file open until
// process exit.
