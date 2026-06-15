-- 阶段 2：多用户（平台账号）数据模型

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  prompt_template_id TEXT NOT NULL DEFAULT 'libai',
  custom_prompt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forward_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS forward_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forward_account_id TEXT NOT NULL REFERENCES forward_accounts(id) ON DELETE CASCADE,
  source_uid TEXT NOT NULL,
  limit_count INTEGER NOT NULL DEFAULT 1 CHECK (limit_count > 0),
  enabled INTEGER NOT NULL DEFAULT 1,
  prompt_profile TEXT,
  schedule TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS forward_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forward_account_id TEXT NOT NULL REFERENCES forward_accounts(id) ON DELETE CASCADE,
  source_uid TEXT NOT NULL,
  mid TEXT NOT NULL,
  source_url TEXT NOT NULL,
  comment TEXT NOT NULL,
  my_repost_url TEXT,
  forwarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (forward_account_id, source_uid, mid)
);

CREATE TABLE IF NOT EXISTS repost_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forward_account_id TEXT NOT NULL REFERENCES forward_accounts(id) ON DELETE CASCADE,
  link TEXT NOT NULL,
  link_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forward_accounts_user ON forward_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_forward_rules_user ON forward_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_forward_rules_account ON forward_rules(forward_account_id);
CREATE INDEX IF NOT EXISTS idx_forward_records_user ON forward_records(user_id);
CREATE INDEX IF NOT EXISTS idx_repost_links_user_date ON repost_links(user_id, forward_account_id, link_date);
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
  since_date TEXT,
  until_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cleanup_judgments (
  rule_id TEXT NOT NULL REFERENCES cleanup_rules(id) ON DELETE CASCADE,
  mid TEXT NOT NULL,
  rule_fingerprint TEXT NOT NULL,
  should_delete INTEGER NOT NULL,
  reason TEXT NOT NULL,
  judged_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (rule_id, mid)
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
CREATE INDEX IF NOT EXISTS idx_cleanup_judgments_rule ON cleanup_judgments(rule_id);
