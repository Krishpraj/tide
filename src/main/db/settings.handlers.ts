import { register } from "../rpc/handlers";
import { getDb } from "./client";

function readAll(): Record<string, unknown> {
  const rows = getDb()
    .query<{ key: string; value: string }, []>(
      "SELECT key, value FROM app_settings",
    )
    .all();
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

register("getSettings", async () => readAll());
register("updateSettings", async (input) => {
  const patch = (input ?? {}) as Record<string, unknown>;
  const db = getDb();
  for (const [k, v] of Object.entries(patch)) {
    db.run(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [k, JSON.stringify(v)],
    );
  }
});
