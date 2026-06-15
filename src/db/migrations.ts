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

    CREATE TABLE IF NOT EXISTS cleanup_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      forward_account_id TEXT NOT NULL REFERENCES forward_accounts(id) ON DELETE CASCADE,
      limit_count INTEGER NOT NULL DEFAULT 30 CHECK (limit_count > 0),
      enabled INTEGER NOT NULL DEFAULT 1,
      post_types TEXT NOT NULL DEFAULT '["video"]',
      required_tags TEXT NOT NULL DEFAULT '[]',
      judge_profile TEXT,
      judge_prompt TEXT,
      schedule TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cleanup_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      forward_account_id TEXT NOT NULL REFERENCES forward_accounts(id) ON DELETE CASCADE,
      mid TEXT NOT NULL,
      detail_url TEXT NOT NULL,
      judge_reason TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
      dry_run INTEGER NOT NULL DEFAULT 0,
      UNIQUE (forward_account_id, mid)
    );

    CREATE INDEX IF NOT EXISTS idx_cleanup_rules_user ON cleanup_rules(user_id);
    CREATE INDEX IF NOT EXISTS idx_cleanup_rules_account ON cleanup_rules(forward_account_id);
    CREATE INDEX IF NOT EXISTS idx_cleanup_records_user ON cleanup_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_cleanup_records_account ON cleanup_records(forward_account_id);

    CREATE TABLE IF NOT EXISTS cleanup_judgments (
      rule_id TEXT NOT NULL REFERENCES cleanup_rules(id) ON DELETE CASCADE,
      mid TEXT NOT NULL,
      rule_fingerprint TEXT NOT NULL,
      should_delete INTEGER NOT NULL,
      reason TEXT NOT NULL,
      judged_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (rule_id, mid)
    );
    CREATE INDEX IF NOT EXISTS idx_cleanup_judgments_rule ON cleanup_judgments(rule_id);
  `);

  const cleanupRuleCols = db.prepare("PRAGMA table_info(cleanup_rules)").all() as {
    name: string;
  }[];
  if (!cleanupRuleCols.some((c) => c.name === "since_date")) {
    db.exec(`ALTER TABLE cleanup_rules ADD COLUMN since_date TEXT`);
  }
  if (!cleanupRuleCols.some((c) => c.name === "until_date")) {
    db.exec(`ALTER TABLE cleanup_rules ADD COLUMN until_date TEXT`);
  }
}
