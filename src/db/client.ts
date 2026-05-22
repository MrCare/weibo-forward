import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./migrate.js";
import { seedAdminUser } from "./seed.js";

let dbInstance: Database.Database | null = null;

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? "data/app.db";
}

export function getDatabase(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = getDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedAdminUser(db);

  dbInstance = db;
  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/** 测试用内存库 */
export function createMemoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
