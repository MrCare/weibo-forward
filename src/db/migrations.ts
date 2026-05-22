import type Database from "better-sqlite3";

function ensureUserRoleColumn(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "role")) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  }

  const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  db.prepare(
    `UPDATE users SET role = 'admin' WHERE username = ? COLLATE NOCASE`,
  ).run(adminUsername);

  const { c } = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")
    .get() as { c: number };
  if (c === 0) {
    db.exec(
      `UPDATE users SET role = 'admin' WHERE id = (
         SELECT id FROM users ORDER BY created_at ASC LIMIT 1
       )`,
    );
  }
}

function ensureUserPromptColumns(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "prompt_template_id")) {
    db.exec(`ALTER TABLE users ADD COLUMN prompt_template_id TEXT NOT NULL DEFAULT 'libai'`);
  }
  if (!cols.some((c) => c.name === "custom_prompt")) {
    db.exec(`ALTER TABLE users ADD COLUMN custom_prompt TEXT`);
  }
}

export function runMigrations(db: Database.Database): void {
  ensureUserRoleColumn(db);
  ensureUserPromptColumns(db);
  const ruleCols = db.prepare("PRAGMA table_info(forward_rules)").all() as {
    name: string;
  }[];
  if (!ruleCols.some((c) => c.name === "schedule")) {
    db.exec(`ALTER TABLE forward_rules ADD COLUMN schedule TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS login_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      forward_account_id TEXT NOT NULL REFERENCES forward_accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      login_token TEXT NOT NULL UNIQUE,
      qr_image_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON login_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_login_sessions_token ON login_sessions(login_token);
  `);
}
