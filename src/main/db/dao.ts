// Typed DAOs for every domain entity. All operations go through these so
// schema knowledge stays in one place. Returns plain JS objects shaped per
// shared/types.ts.

import { ulid } from "ulid";
import { getDb } from "./client";
import type {
  ClaudeSession,
  Estimate,
  Label,
  LinkKind,
  Notification,
  Priority,
  Project,
  Repo,
  SavedView,
  Ticket,
  TicketComment,
  TicketEvent,
  TicketLink,
  TicketStatus,
  TicketTemplate,
} from "@shared/types";

function now(): number {
  return Date.now();
}

function newId(): string {
  return ulid();
}

// ─── projects ────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: number;
}
function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    createdAt: r.created_at,
  };
}

export const projectsDao = {
  list(): Project[] {
    const rows = getDb()
      .query<ProjectRow, []>(
        "SELECT id, name, color, position, created_at FROM projects ORDER BY position ASC, created_at ASC",
      )
      .all();
    return rows.map(rowToProject);
  },
  get(id: string): Project | null {
    const r = getDb()
      .query<ProjectRow, [string]>(
        "SELECT id, name, color, position, created_at FROM projects WHERE id = ?",
      )
      .get(id);
    return r ? rowToProject(r) : null;
  },
  insert(input: { name: string; color?: string }): Project {
    const id = newId();
    const color = input.color ?? "#5E6AD2";
    const position = projectsDao.list().length;
    getDb().run(
      "INSERT INTO projects (id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, input.name, color, position, now()],
    );
    return projectsDao.get(id)!;
  },
  rename(id: string, name: string): Project {
    getDb().run("UPDATE projects SET name = ? WHERE id = ?", [name, id]);
    const p = projectsDao.get(id);
    if (!p) throw new Error("project not found");
    return p;
  },
  delete(id: string): void {
    getDb().run("DELETE FROM projects WHERE id = ?", [id]);
  },
};

// ─── repos ───────────────────────────────────────────────────────────────

interface RepoRow {
  id: string;
  project_id: string | null;
  name: string;
  path: string;
  origin_url: string | null;
  base_branch: string;
  position: number;
  created_at: number;
}
function rowToRepo(r: RepoRow): Repo {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    path: r.path,
    originUrl: r.origin_url,
    baseBranch: r.base_branch,
    position: r.position,
    createdAt: r.created_at,
  };
}

export const reposDao = {
  list(filter?: { projectId?: string | null }): Repo[] {
    if (filter && "projectId" in filter) {
      const pid = filter.projectId;
      if (pid === null) {
        return getDb()
          .query<RepoRow, []>(
            "SELECT * FROM repos WHERE project_id IS NULL ORDER BY position ASC, created_at ASC",
          )
          .all()
          .map(rowToRepo);
      } else if (pid !== undefined) {
        return getDb()
          .query<RepoRow, [string]>(
            "SELECT * FROM repos WHERE project_id = ? ORDER BY position ASC, created_at ASC",
          )
          .all(pid)
          .map(rowToRepo);
      }
    }
    return getDb()
      .query<RepoRow, []>(
        "SELECT * FROM repos ORDER BY position ASC, created_at ASC",
      )
      .all()
      .map(rowToRepo);
  },
  get(id: string): Repo | null {
    const r = getDb()
      .query<RepoRow, [string]>("SELECT * FROM repos WHERE id = ?")
      .get(id);
    return r ? rowToRepo(r) : null;
  },
  getByPath(path: string): Repo | null {
    const r = getDb()
      .query<RepoRow, [string]>("SELECT * FROM repos WHERE path = ?")
      .get(path);
    return r ? rowToRepo(r) : null;
  },
  insert(input: {
    projectId: string | null;
    name: string;
    path: string;
    originUrl?: string | null;
    baseBranch?: string;
  }): Repo {
    const id = newId();
    const position = reposDao.list({ projectId: input.projectId }).length;
    getDb().run(
      "INSERT INTO repos (id, project_id, name, path, origin_url, base_branch, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        input.projectId,
        input.name,
        input.path,
        input.originUrl ?? null,
        input.baseBranch ?? "main",
        position,
        now(),
      ],
    );
    return reposDao.get(id)!;
  },
  setProject(id: string, projectId: string | null): void {
    getDb().run("UPDATE repos SET project_id = ? WHERE id = ?", [projectId, id]);
  },
  delete(id: string): void {
    getDb().run("DELETE FROM repos WHERE id = ?", [id]);
  },
};

// ─── labels ──────────────────────────────────────────────────────────────

interface LabelRow {
  id: string;
  project_id: string | null;
  name: string;
  color: string;
}
function rowToLabel(r: LabelRow): Label {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    color: r.color,
  };
}

export const labelsDao = {
  list(filter?: { projectId?: string | null }): Label[] {
    if (filter && "projectId" in filter) {
      const pid = filter.projectId;
      if (pid === null) {
        return getDb()
          .query<LabelRow, []>(
            "SELECT id, project_id, name, color FROM labels WHERE project_id IS NULL ORDER BY name",
          )
          .all()
          .map(rowToLabel);
      } else if (pid !== undefined) {
        return getDb()
          .query<LabelRow, [string]>(
            "SELECT id, project_id, name, color FROM labels WHERE project_id = ? ORDER BY name",
          )
          .all(pid)
          .map(rowToLabel);
      }
    }
    return getDb()
      .query<LabelRow, []>(
        "SELECT id, project_id, name, color FROM labels ORDER BY name",
      )
      .all()
      .map(rowToLabel);
  },
  get(id: string): Label | null {
    const r = getDb()
      .query<LabelRow, [string]>(
        "SELECT id, project_id, name, color FROM labels WHERE id = ?",
      )
      .get(id);
    return r ? rowToLabel(r) : null;
  },
  insert(input: {
    projectId: string | null;
    name: string;
    color: string;
  }): Label {
    const id = newId();
    getDb().run(
      "INSERT INTO labels (id, project_id, name, color) VALUES (?, ?, ?, ?)",
      [id, input.projectId, input.name, input.color],
    );
    return labelsDao.get(id)!;
  },
  delete(id: string): void {
    getDb().run("DELETE FROM labels WHERE id = ?", [id]);
  },
  forTicket(ticketId: string): Label[] {
    return getDb()
      .query<LabelRow, [string]>(
        `SELECT l.id, l.project_id, l.name, l.color
         FROM labels l
         JOIN ticket_labels tl ON tl.label_id = l.id
         WHERE tl.ticket_id = ?
         ORDER BY l.name`,
      )
      .all(ticketId)
      .map(rowToLabel);
  },
  setForTicket(ticketId: string, labelIds: string[]): void {
    const db = getDb();
    db.run("DELETE FROM ticket_labels WHERE ticket_id = ?", [ticketId]);
    if (labelIds.length === 0) return;
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO ticket_labels (ticket_id, label_id) VALUES (?, ?)",
    );
    for (const id of labelIds) stmt.run(ticketId, id);
  },
};

// ─── tickets ─────────────────────────────────────────────────────────────

interface TicketRow {
  id: string;
  repo_id: string | null;
  parent_id: string | null;
  title: string;
  description: string;
  description_md: string;
  status: TicketStatus;
  priority: number;
  estimate: string | null;
  branch_name: string | null;
  base_branch: string | null;
  position: number;
  snooze_until: number | null;
  created_at: number;
  updated_at: number;
}
function rowToTicket(r: TicketRow): Ticket {
  return {
    id: r.id,
    repoId: r.repo_id,
    parentId: r.parent_id,
    title: r.title,
    description: r.description,
    descriptionMd: r.description_md,
    status: r.status,
    priority: r.priority as Priority,
    estimate: (r.estimate as Estimate) ?? null,
    branchName: r.branch_name,
    baseBranch: r.base_branch,
    position: r.position,
    snoozeUntil: r.snooze_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function nextPosition(status: TicketStatus, repoId: string | null): number {
  const row = getDb()
    .query<{ max: number | null }, [TicketStatus, string | null]>(
      "SELECT MAX(position) as max FROM tickets WHERE status = ? AND repo_id IS ?",
    )
    .get(status, repoId);
  return (row?.max ?? -1) + 1;
}

export const ticketsDao = {
  list(filter?: { status?: TicketStatus; repoId?: string | null }): Ticket[] {
    const clauses: string[] = [];
    const args: (string | number | null)[] = [];
    if (filter?.status) {
      clauses.push("status = ?");
      args.push(filter.status);
    }
    if (filter && "repoId" in filter) {
      if (filter.repoId === null) clauses.push("repo_id IS NULL");
      else if (filter.repoId !== undefined) {
        clauses.push("repo_id = ?");
        args.push(filter.repoId);
      }
    }
    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const sql = `SELECT * FROM tickets ${where} ORDER BY status, priority DESC, position ASC, created_at ASC`;
    return getDb()
      .query<TicketRow, typeof args>(sql)
      .all(...args)
      .map(rowToTicket);
  },
  get(id: string): Ticket | null {
    const r = getDb()
      .query<TicketRow, [string]>("SELECT * FROM tickets WHERE id = ?")
      .get(id);
    return r ? rowToTicket(r) : null;
  },
  insert(input: {
    title: string;
    description?: string;
    descriptionMd?: string;
    repoId?: string | null;
    parentId?: string | null;
    priority?: Priority;
    estimate?: Estimate;
    status?: TicketStatus;
  }): Ticket {
    const id = newId();
    const status: TicketStatus = input.status ?? "triage";
    const repoId = input.repoId ?? null;
    const ts = now();
    getDb().run(
      `INSERT INTO tickets
         (id, repo_id, parent_id, title, description, description_md, status, priority, estimate, branch_name, base_branch, position, snooze_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)`,
      [
        id,
        repoId,
        input.parentId ?? null,
        input.title,
        input.description ?? "{}",
        input.descriptionMd ?? "",
        status,
        input.priority ?? 0,
        input.estimate ?? null,
        nextPosition(status, repoId),
        ts,
        ts,
      ],
    );
    return ticketsDao.get(id)!;
  },
  update(id: string, patch: Partial<Ticket>): Ticket {
    const fields: string[] = [];
    const args: (string | number | null)[] = [];
    const map: Record<string, string> = {
      title: "title",
      description: "description",
      descriptionMd: "description_md",
      status: "status",
      priority: "priority",
      estimate: "estimate",
      repoId: "repo_id",
      parentId: "parent_id",
      branchName: "branch_name",
      baseBranch: "base_branch",
      position: "position",
      snoozeUntil: "snooze_until",
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (patch as Record<string, unknown>)[k];
      if (v !== undefined) {
        fields.push(`${col} = ?`);
        args.push(v as string | number | null);
      }
    }
    fields.push("updated_at = ?");
    args.push(now());
    args.push(id);
    getDb().run(`UPDATE tickets SET ${fields.join(", ")} WHERE id = ?`, args);
    return ticketsDao.get(id)!;
  },
  delete(id: string): void {
    getDb().run("DELETE FROM tickets WHERE id = ?", [id]);
  },
  bulkUpdate(ids: string[], patch: Partial<Ticket>): void {
    if (ids.length === 0) return;
    const db = getDb();
    const tx = db.transaction((rows: string[]) => {
      for (const id of rows) ticketsDao.update(id, patch);
    });
    tx(ids);
  },
  withLabels(t: Ticket): Ticket {
    return { ...t, labels: labelsDao.forTicket(t.id) };
  },
};

// ─── ticket links ────────────────────────────────────────────────────────

interface LinkRow {
  id: number;
  from_ticket: string;
  to_ticket: string;
  kind: LinkKind;
}
function rowToLink(r: LinkRow): TicketLink {
  return {
    id: r.id,
    fromTicket: r.from_ticket,
    toTicket: r.to_ticket,
    kind: r.kind,
  };
}

export const linksDao = {
  insert(input: {
    fromTicketId: string;
    toTicketId: string;
    kind: LinkKind;
  }): TicketLink {
    if (input.fromTicketId === input.toTicketId) {
      throw new Error("cannot link a ticket to itself");
    }
    // Reject simple A blocked_by B if B is already blocked_by A (one-step cycle).
    if (input.kind === "blocked_by") {
      const reverse = getDb()
        .query<LinkRow, [string, string]>(
          "SELECT * FROM ticket_links WHERE from_ticket = ? AND to_ticket = ? AND kind = 'blocked_by'",
        )
        .get(input.toTicketId, input.fromTicketId);
      if (reverse) throw new Error("blocking cycle rejected");
    }
    getDb().run(
      "INSERT OR IGNORE INTO ticket_links (from_ticket, to_ticket, kind) VALUES (?, ?, ?)",
      [input.fromTicketId, input.toTicketId, input.kind],
    );
    const row = getDb()
      .query<LinkRow, [string, string, LinkKind]>(
        "SELECT * FROM ticket_links WHERE from_ticket = ? AND to_ticket = ? AND kind = ?",
      )
      .get(input.fromTicketId, input.toTicketId, input.kind);
    if (!row) throw new Error("failed to insert link");
    return rowToLink(row);
  },
  delete(id: number): void {
    getDb().run("DELETE FROM ticket_links WHERE id = ?", [id]);
  },
  forTicket(ticketId: string): TicketLink[] {
    return getDb()
      .query<LinkRow, [string, string]>(
        "SELECT * FROM ticket_links WHERE from_ticket = ? OR to_ticket = ?",
      )
      .all(ticketId, ticketId)
      .map(rowToLink);
  },
  blockersOf(ticketId: string): TicketLink[] {
    return getDb()
      .query<LinkRow, [string]>(
        "SELECT * FROM ticket_links WHERE from_ticket = ? AND kind = 'blocked_by'",
      )
      .all(ticketId)
      .map(rowToLink);
  },
};

// ─── templates ───────────────────────────────────────────────────────────

interface TemplateRow {
  id: string;
  project_id: string | null;
  name: string;
  icon: string | null;
  title_prefix: string;
  body_json: string;
  position: number;
}
function rowToTemplate(r: TemplateRow): TicketTemplate {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    icon: r.icon,
    titlePrefix: r.title_prefix,
    bodyJson: r.body_json,
    position: r.position,
  };
}

export const templatesDao = {
  list(filter?: { projectId?: string | null }): TicketTemplate[] {
    if (filter && "projectId" in filter) {
      const pid = filter.projectId;
      if (pid === null) {
        return getDb()
          .query<TemplateRow, []>(
            "SELECT * FROM ticket_templates WHERE project_id IS NULL ORDER BY position",
          )
          .all()
          .map(rowToTemplate);
      } else if (pid !== undefined) {
        return getDb()
          .query<TemplateRow, [string]>(
            "SELECT * FROM ticket_templates WHERE project_id = ? ORDER BY position",
          )
          .all(pid)
          .map(rowToTemplate);
      }
    }
    return getDb()
      .query<TemplateRow, []>("SELECT * FROM ticket_templates ORDER BY position")
      .all()
      .map(rowToTemplate);
  },
  insert(input: {
    projectId: string | null;
    name: string;
    icon?: string | null;
    titlePrefix?: string;
    bodyJson: string;
  }): TicketTemplate {
    const id = newId();
    const position = templatesDao.list({ projectId: input.projectId }).length;
    getDb().run(
      "INSERT INTO ticket_templates (id, project_id, name, icon, title_prefix, body_json, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        input.projectId,
        input.name,
        input.icon ?? null,
        input.titlePrefix ?? "",
        input.bodyJson,
        position,
      ],
    );
    return templatesDao.list({ projectId: input.projectId }).find(
      (t) => t.id === id,
    )!;
  },
};

// ─── comments ────────────────────────────────────────────────────────────

interface CommentRow {
  id: string;
  ticket_id: string;
  body: string;
  body_md: string;
  created_at: number;
  updated_at: number;
}
function rowToComment(r: CommentRow): TicketComment {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    body: r.body,
    bodyMd: r.body_md,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const commentsDao = {
  forTicket(ticketId: string): TicketComment[] {
    return getDb()
      .query<CommentRow, [string]>(
        "SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at",
      )
      .all(ticketId)
      .map(rowToComment);
  },
  insert(input: {
    ticketId: string;
    body: string;
    bodyMd?: string;
  }): TicketComment {
    const id = newId();
    const ts = now();
    getDb().run(
      "INSERT INTO ticket_comments (id, ticket_id, body, body_md, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, input.ticketId, input.body, input.bodyMd ?? "", ts, ts],
    );
    return commentsDao.get(id)!;
  },
  get(id: string): TicketComment | null {
    const r = getDb()
      .query<CommentRow, [string]>("SELECT * FROM ticket_comments WHERE id = ?")
      .get(id);
    return r ? rowToComment(r) : null;
  },
  update(id: string, body: string, bodyMd?: string): TicketComment {
    getDb().run(
      "UPDATE ticket_comments SET body = ?, body_md = ?, updated_at = ? WHERE id = ?",
      [body, bodyMd ?? "", now(), id],
    );
    return commentsDao.get(id)!;
  },
  delete(id: string): void {
    getDb().run("DELETE FROM ticket_comments WHERE id = ?", [id]);
  },
};

// ─── notifications ───────────────────────────────────────────────────────

interface NotificationRow {
  id: string;
  ticket_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read_at: number | null;
  created_at: number;
}
function rowToNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

export const notificationsDao = {
  list(filter?: { unreadOnly?: boolean }): Notification[] {
    const where = filter?.unreadOnly ? "WHERE read_at IS NULL" : "";
    return getDb()
      .query<NotificationRow, []>(
        `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT 200`,
      )
      .all()
      .map(rowToNotification);
  },
  unreadCount(): number {
    const row = getDb()
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM notifications WHERE read_at IS NULL",
      )
      .get();
    return row?.n ?? 0;
  },
  insert(input: {
    ticketId?: string | null;
    kind: string;
    title: string;
    body?: string | null;
  }): Notification {
    const id = newId();
    getDb().run(
      "INSERT INTO notifications (id, ticket_id, kind, title, body, read_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
      [id, input.ticketId ?? null, input.kind, input.title, input.body ?? null, now()],
    );
    const r = getDb()
      .query<NotificationRow, [string]>(
        "SELECT * FROM notifications WHERE id = ?",
      )
      .get(id);
    return rowToNotification(r!);
  },
  markRead(id: string): void {
    getDb().run("UPDATE notifications SET read_at = ? WHERE id = ?", [
      now(),
      id,
    ]);
  },
  markAllRead(): void {
    getDb().run(
      "UPDATE notifications SET read_at = ? WHERE read_at IS NULL",
      [now()],
    );
  },
};

// ─── saved views ─────────────────────────────────────────────────────────

interface SavedViewRow {
  id: string;
  name: string;
  group_by: string | null;
  sort_by: string | null;
  filters_json: string;
  position: number;
}
function rowToSavedView(r: SavedViewRow): SavedView {
  return {
    id: r.id,
    name: r.name,
    groupBy: r.group_by,
    sortBy: r.sort_by,
    filtersJson: r.filters_json,
    position: r.position,
  };
}

export const savedViewsDao = {
  list(): SavedView[] {
    return getDb()
      .query<SavedViewRow, []>(
        "SELECT * FROM saved_views ORDER BY position ASC",
      )
      .all()
      .map(rowToSavedView);
  },
  insert(input: Omit<SavedView, "id" | "position">): SavedView {
    const id = newId();
    const position = savedViewsDao.list().length;
    getDb().run(
      "INSERT INTO saved_views (id, name, group_by, sort_by, filters_json, position) VALUES (?, ?, ?, ?, ?, ?)",
      [
        id,
        input.name,
        input.groupBy,
        input.sortBy,
        input.filtersJson,
        position,
      ],
    );
    return savedViewsDao.list().find((v) => v.id === id)!;
  },
  delete(id: string): void {
    getDb().run("DELETE FROM saved_views WHERE id = ?", [id]);
  },
};

// ─── ticket events ───────────────────────────────────────────────────────

interface EventRow {
  id: number;
  ticket_id: string;
  ts: number;
  kind: string;
  payload: string;
}

export const eventsDao = {
  insert(input: {
    ticketId: string;
    kind: string;
    payload: unknown;
  }): TicketEvent {
    const ts = now();
    const res = getDb().run(
      "INSERT INTO ticket_events (ticket_id, ts, kind, payload) VALUES (?, ?, ?, ?)",
      [input.ticketId, ts, input.kind, JSON.stringify(input.payload ?? null)],
    );
    return {
      id: Number(res.lastInsertRowid),
      ticketId: input.ticketId,
      ts,
      kind: input.kind,
      payload: input.payload ?? null,
    };
  },
  forTicket(ticketId: string): TicketEvent[] {
    return getDb()
      .query<EventRow, [string]>(
        "SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY ts ASC, id ASC",
      )
      .all(ticketId)
      .map((r) => ({
        id: r.id,
        ticketId: r.ticket_id,
        ts: r.ts,
        kind: r.kind,
        payload: safeParse(r.payload),
      }));
  },
};

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// ─── claude sessions ─────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  ticket_id: string;
  sdk_session_id: string | null;
  status: ClaudeSession["status"];
  started_at: number;
  ended_at: number | null;
  error: string | null;
}
function rowToSession(r: SessionRow): ClaudeSession {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    sdkSessionId: r.sdk_session_id,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    error: r.error,
  };
}

export const sessionsDao = {
  start(ticketId: string): ClaudeSession {
    const id = newId();
    getDb().run(
      "INSERT INTO claude_sessions (id, ticket_id, sdk_session_id, status, started_at, ended_at, error) VALUES (?, ?, NULL, 'running', ?, NULL, NULL)",
      [id, ticketId, now()],
    );
    return sessionsDao.get(id)!;
  },
  get(id: string): ClaudeSession | null {
    const r = getDb()
      .query<SessionRow, [string]>(
        "SELECT * FROM claude_sessions WHERE id = ?",
      )
      .get(id);
    return r ? rowToSession(r) : null;
  },
  latestForTicket(ticketId: string): ClaudeSession | null {
    const r = getDb()
      .query<SessionRow, [string]>(
        "SELECT * FROM claude_sessions WHERE ticket_id = ? ORDER BY started_at DESC LIMIT 1",
      )
      .get(ticketId);
    return r ? rowToSession(r) : null;
  },
  setSdkId(id: string, sdkSessionId: string): void {
    getDb().run(
      "UPDATE claude_sessions SET sdk_session_id = ? WHERE id = ?",
      [sdkSessionId, id],
    );
  },
  finish(
    id: string,
    status: ClaudeSession["status"],
    error?: string | null,
  ): void {
    getDb().run(
      "UPDATE claude_sessions SET status = ?, ended_at = ?, error = ? WHERE id = ?",
      [status, now(), error ?? null, id],
    );
  },
};

// ─── app settings ────────────────────────────────────────────────────────

export const settingsDao = {
  get<T = unknown>(key: string): T | null {
    const r = getDb()
      .query<{ value: string }, [string]>(
        "SELECT value FROM app_settings WHERE key = ?",
      )
      .get(key);
    if (!r) return null;
    try {
      return JSON.parse(r.value) as T;
    } catch {
      return r.value as unknown as T;
    }
  },
  set(key: string, value: unknown): void {
    getDb().run(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, JSON.stringify(value)],
    );
  },
};
