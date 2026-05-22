import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { runMigrations } from "./migrations.js";

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");

export function migrate(db: Database.Database): void {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);
  runMigrations(db);
}
