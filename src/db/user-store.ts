import type Database from "better-sqlite3";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { generateApiKey, generateId } from "../auth/tokens.js";
import { isAdmin } from "./access-control.js";
import {
  DEFAULT_PROMPT_TEMPLATE_ID,
  isPromptTemplateId,
  userPromptSettingsFromRow,
  type PromptTemplateId,
  type UserPromptSettings,
} from "../prompt-templates.js";
import type { ForwardAccountRow, ForwardRuleRow, UserRow } from "./types.js";

export function findUserByApiKey(db: Database.Database, apiKey: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE api_key = ?").get(apiKey) as UserRow | undefined;
}

export function getUserById(db: Database.Database, userId: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
}

export function findUserByUsername(
  db: Database.Database,
  username: string,
): UserRow | undefined {
  return db
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(username) as UserRow | undefined;
}

export function createUser(
  db: Database.Database,
  username: string,
  password: string,
): UserRow {
  const existing = findUserByUsername(db, username);
  if (existing) {
    throw new Error(`用户名 "${username}" 已存在`);
  }

  const id = generateId();
  const apiKey = generateApiKey();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, api_key, role, prompt_template_id)
     VALUES (?, ?, ?, ?, 'user', ?)`,
  ).run(id, username, hashPassword(password), apiKey, DEFAULT_PROMPT_TEMPLATE_ID);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
}

export function verifyUserLogin(
  db: Database.Database,
  username: string,
  password: string,
): UserRow | null {
  const user = findUserByUsername(db, username);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return user;
}

export function getUserPromptSettings(
  db: Database.Database,
  userId: string,
): UserPromptSettings | null {
  const row = db
    .prepare("SELECT prompt_template_id, custom_prompt FROM users WHERE id = ?")
    .get(userId) as { prompt_template_id: string; custom_prompt: string | null } | undefined;
  if (!row) return null;
  return userPromptSettingsFromRow(row);
}

export function updateUserPromptSettings(
  db: Database.Database,
  userId: string,
  patch: { promptTemplateId?: PromptTemplateId; customPrompt?: string | null },
): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (patch.promptTemplateId !== undefined) {
    if (!isPromptTemplateId(patch.promptTemplateId)) {
      throw new Error(`无效的模板 id: ${patch.promptTemplateId}`);
    }
    fields.push("prompt_template_id = ?");
    values.push(patch.promptTemplateId);
  }
  if (patch.customPrompt !== undefined) {
    fields.push("custom_prompt = ?");
    values.push(patch.customPrompt?.trim() || null);
  }

  if (fields.length === 0) return false;

  values.push(userId);
  const result = db
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

export function rotateApiKey(db: Database.Database, userId: string): string {
  const apiKey = generateApiKey();
  db.prepare("UPDATE users SET api_key = ? WHERE id = ?").run(apiKey, userId);
  return apiKey;
}

// --- forward accounts ---

export function listUsers(db: Database.Database): Pick<UserRow, "id" | "username" | "role" | "created_at">[] {
  return db
    .prepare("SELECT id, username, role, created_at FROM users ORDER BY username COLLATE NOCASE")
    .all() as Pick<UserRow, "id" | "username" | "role" | "created_at">[];
}

export function listAccounts(db: Database.Database, userId: string): ForwardAccountRow[] {
  return db
    .prepare("SELECT * FROM forward_accounts WHERE user_id = ? ORDER BY created_at")
    .all(userId) as ForwardAccountRow[];
}

export function listAllAccounts(db: Database.Database): ForwardAccountRow[] {
  return db
    .prepare("SELECT * FROM forward_accounts ORDER BY created_at")
    .all() as ForwardAccountRow[];
}

export function getAccountById(
  db: Database.Database,
  accountId: string,
): ForwardAccountRow | undefined {
  return db
    .prepare("SELECT * FROM forward_accounts WHERE id = ?")
    .get(accountId) as ForwardAccountRow | undefined;
}

export function resolveAccount(
  db: Database.Database,
  actor: UserRow,
  accountId: string,
): ForwardAccountRow | undefined {
  if (isAdmin(actor)) return getAccountById(db, accountId);
  return getAccount(db, actor.id, accountId);
}

export function getAccount(
  db: Database.Database,
  userId: string,
  accountId: string,
): ForwardAccountRow | undefined {
  return db
    .prepare("SELECT * FROM forward_accounts WHERE user_id = ? AND id = ?")
    .get(userId, accountId) as ForwardAccountRow | undefined;
}

export function createAccount(
  db: Database.Database,
  userId: string,
  name: string,
): ForwardAccountRow {
  const id = generateId();
  db.prepare(
    `INSERT INTO forward_accounts (id, user_id, name) VALUES (?, ?, ?)`,
  ).run(id, userId, name);
  return getAccount(db, userId, id)!;
}

export function deleteAccount(db: Database.Database, userId: string, accountId: string): boolean {
  const result = db
    .prepare("DELETE FROM forward_accounts WHERE user_id = ? AND id = ?")
    .run(userId, accountId);
  return result.changes > 0;
}

// --- forward rules ---

export function listRules(db: Database.Database, userId: string): ForwardRuleRow[] {
  return db
    .prepare("SELECT * FROM forward_rules WHERE user_id = ? ORDER BY created_at")
    .all(userId) as ForwardRuleRow[];
}

export function listAllRules(db: Database.Database): ForwardRuleRow[] {
  return db
    .prepare("SELECT * FROM forward_rules ORDER BY created_at")
    .all() as ForwardRuleRow[];
}

export function getRuleById(
  db: Database.Database,
  ruleId: string,
): ForwardRuleRow | undefined {
  return db
    .prepare("SELECT * FROM forward_rules WHERE id = ?")
    .get(ruleId) as ForwardRuleRow | undefined;
}

export function resolveRule(
  db: Database.Database,
  actor: UserRow,
  ruleId: string,
): ForwardRuleRow | undefined {
  if (isAdmin(actor)) return getRuleById(db, ruleId);
  return getRule(db, actor.id, ruleId);
}

export function getRule(
  db: Database.Database,
  userId: string,
  ruleId: string,
): ForwardRuleRow | undefined {
  return db
    .prepare("SELECT * FROM forward_rules WHERE user_id = ? AND id = ?")
    .get(userId, ruleId) as ForwardRuleRow | undefined;
}

export interface CreateRuleInput {
  forwardAccountId: string;
  sourceUid: string;
  limit: number;
  enabled?: boolean;
  promptProfile?: string | null;
  schedule?: string | null;
}

export function createRule(
  db: Database.Database,
  userId: string,
  input: CreateRuleInput,
): ForwardRuleRow {
  const account = getAccount(db, userId, input.forwardAccountId);
  if (!account) {
    throw new Error(`转发账号 "${input.forwardAccountId}" 不存在`);
  }

  const id = generateId();
  db.prepare(
    `INSERT INTO forward_rules
      (id, user_id, forward_account_id, source_uid, limit_count, enabled, prompt_profile, schedule)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.forwardAccountId,
    input.sourceUid,
    input.limit,
    input.enabled === false ? 0 : 1,
    input.promptProfile ?? null,
    input.schedule ?? null,
  );
  return getRule(db, userId, id)!;
}

export function updateRuleEnabled(
  db: Database.Database,
  userId: string,
  ruleId: string,
  enabled: boolean,
): boolean {
  const result = db
    .prepare("UPDATE forward_rules SET enabled = ? WHERE user_id = ? AND id = ?")
    .run(enabled ? 1 : 0, userId, ruleId);
  return result.changes > 0;
}

export function deleteRule(db: Database.Database, userId: string, ruleId: string): boolean {
  const result = db
    .prepare("DELETE FROM forward_rules WHERE user_id = ? AND id = ?")
    .run(userId, ruleId);
  return result.changes > 0;
}

export function listEnabledRules(db: Database.Database, userId: string): ForwardRuleRow[] {
  return db
    .prepare(
      "SELECT * FROM forward_rules WHERE user_id = ? AND enabled = 1 ORDER BY created_at",
    )
    .all(userId) as ForwardRuleRow[];
}

export function listAllEnabledRules(db: Database.Database): ForwardRuleRow[] {
  return db
    .prepare("SELECT * FROM forward_rules WHERE enabled = 1 ORDER BY created_at")
    .all() as ForwardRuleRow[];
}

export function updateRule(
  db: Database.Database,
  userId: string,
  ruleId: string,
  patch: {
    enabled?: boolean;
    schedule?: string | null;
    limit?: number;
    promptProfile?: string | null;
  },
): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (patch.promptProfile !== undefined) {
    fields.push("prompt_profile = ?");
    values.push(patch.promptProfile);
  }
  if (patch.enabled !== undefined) {
    fields.push("enabled = ?");
    values.push(patch.enabled ? 1 : 0);
  }
  if (patch.schedule !== undefined) {
    fields.push("schedule = ?");
    values.push(patch.schedule);
  }
  if (patch.limit !== undefined) {
    fields.push("limit_count = ?");
    values.push(patch.limit);
  }

  if (fields.length === 0) return false;

  values.push(userId, ruleId);
  const result = db
    .prepare(`UPDATE forward_rules SET ${fields.join(", ")} WHERE user_id = ? AND id = ?`)
    .run(...values);
  return result.changes > 0;
}

/** 全局：所有已启用且配置了 cron 的规则（调度器用） */
export function listAllScheduledRules(db: Database.Database): ForwardRuleRow[] {
  return db
    .prepare(
      `SELECT * FROM forward_rules
       WHERE enabled = 1 AND schedule IS NOT NULL AND trim(schedule) != ''
       ORDER BY created_at`,
    )
    .all() as ForwardRuleRow[];
}
