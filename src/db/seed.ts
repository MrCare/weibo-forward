import type Database from "better-sqlite3";
import { hashPassword } from "../auth/password.js";
import { generateApiKey, generateId } from "../auth/tokens.js";

export function seedAdminUser(db: Database.Database): void {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "changeme";

  const existing = db
    .prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE")
    .get(username);
  if (existing) return;

  const id = generateId();
  const apiKey = generateApiKey();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, api_key, role, prompt_template_id)
     VALUES (?, ?, ?, ?, 'admin', 'libai')`,
  ).run(id, username, hashPassword(password), apiKey);

  console.log(`[db] 已创建管理员用户: ${username}（请尽快修改密码）`);
}
