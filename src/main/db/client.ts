import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

let db: Database | null = null;

function dataDir(): string {
  return Bun.env.TIDE_DATA_DIR
    ? resolve(Bun.env.TIDE_DATA_DIR)
    : resolve(process.cwd(), "data");
}

export async function initDb(): Promise<Database> {
  if (db) return db;
  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, "tide.db");
  db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  await applySchema(db);
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error("db not initialized — call initDb() first");
  return db;
}

async function applySchema(d: Database) {
  // Phase 2 will replace this with the full DDL. Phase 1 only needs to create
  // the meta row.
  d.exec(
    `CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );`,
  );
  const row = d
    .query<{ value: string }, [string]>("SELECT value FROM schema_meta WHERE key = ?")
    .get("version");
  if (!row) {
    d.run("INSERT INTO schema_meta (key, value) VALUES (?, ?)", [
      "version",
      "1",
    ]);
  }

  // Allow later phases to layer on additional DDL. Each migration is idempotent
  // (CREATE TABLE IF NOT EXISTS).
  const { applyDomainSchema } = await import("./schema");
  applyDomainSchema(d);
}
