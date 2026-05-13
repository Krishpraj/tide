import type { Database } from "bun:sqlite";

// Centralized DDL applied on boot. Idempotent; safe to run on every startup.
// Later phases extend this rather than introducing a migration framework.
export function applyDomainSchema(d: Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL DEFAULT '#5E6AD2',
      position    INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repos (
      id          TEXT PRIMARY KEY,
      project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL UNIQUE,
      origin_url  TEXT,
      base_branch TEXT NOT NULL DEFAULT 'main',
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id              TEXT PRIMARY KEY,
      repo_id         TEXT REFERENCES repos(id) ON DELETE SET NULL,
      parent_id       TEXT REFERENCES tickets(id) ON DELETE SET NULL,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      description_md  TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL CHECK (status IN
                       ('triage','backlog','queued','in_progress','review','done','discarded','failed','canceled','snoozed')),
      priority        INTEGER NOT NULL DEFAULT 0,
      estimate        TEXT,
      branch_name     TEXT,
      base_branch     TEXT,
      position        INTEGER NOT NULL,
      snooze_until    INTEGER,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_repo_status     ON tickets(repo_id, status, position);
    CREATE INDEX IF NOT EXISTS idx_tickets_status_priority ON tickets(status, priority DESC, created_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_parent          ON tickets(parent_id);

    CREATE TABLE IF NOT EXISTS labels (
      id          TEXT PRIMARY KEY,
      project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL,
      UNIQUE(project_id, name)
    );

    CREATE TABLE IF NOT EXISTS ticket_labels (
      ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      label_id    TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, label_id)
    );

    CREATE TABLE IF NOT EXISTS ticket_links (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      from_ticket TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      to_ticket   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL CHECK (kind IN ('blocks','blocked_by','duplicates','relates_to')),
      UNIQUE (from_ticket, to_ticket, kind)
    );
    CREATE INDEX IF NOT EXISTS idx_links_to ON ticket_links(to_ticket, kind);

    CREATE TABLE IF NOT EXISTS ticket_templates (
      id           TEXT PRIMARY KEY,
      project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      icon         TEXT,
      title_prefix TEXT NOT NULL DEFAULT '',
      body_json    TEXT NOT NULL,
      position     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ticket_comments (
      id          TEXT PRIMARY KEY,
      ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      body_md     TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id, created_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY,
      ticket_id   TEXT REFERENCES tickets(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      read_at     INTEGER,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(read_at, created_at DESC);

    CREATE TABLE IF NOT EXISTS saved_views (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      group_by     TEXT,
      sort_by      TEXT,
      filters_json TEXT NOT NULL DEFAULT '{}',
      position     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      ts        INTEGER NOT NULL,
      kind      TEXT NOT NULL,
      payload   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_ticket_ts ON ticket_events(ticket_id, ts);

    CREATE TABLE IF NOT EXISTS claude_sessions (
      id             TEXT PRIMARY KEY,
      ticket_id      TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sdk_session_id TEXT,
      status         TEXT NOT NULL CHECK (status IN ('running','completed','errored','interrupted','canceled')),
      started_at     INTEGER NOT NULL,
      ended_at       INTEGER,
      error          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_ticket ON claude_sessions(ticket_id);
  `);

  // Seed the default project if none exist.
  const count = d
    .query<{ n: number }, []>("SELECT COUNT(*) as n FROM projects")
    .get();
  if (!count || count.n === 0) {
    const now = Date.now();
    d.run(
      "INSERT INTO projects (id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)",
      ["default", "Default", "#5E6AD2", 0, now],
    );
  }
}
