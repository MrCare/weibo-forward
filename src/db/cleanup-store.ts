import type Database from "better-sqlite3";
import { generateId } from "../auth/tokens.js";
import { isAdmin } from "./access-control.js";
import type { CleanupRecordRow, CleanupRuleRow, UserRow } from "./types.js";
import type { WeiboMediaType } from "../types.js";
import {
  defaultCleanupSinceDate,
  defaultCleanupUntilDate,
} from "../core/cleanup-dates.js";
import type { SaveCleanupJudgmentInput } from "../core/interfaces.js";

export interface CreateCleanupRuleInput {
  forwardAccountId: string;
  enabled?: boolean;
  postTypes?: WeiboMediaType[];
  requiredTags?: string[];
  judgeProfile?: string | null;
  judgePrompt?: string | null;
  schedule?: string | null;
  since?: string | null;
  until?: string | null;
  /** @deprecated 保留兼容，不再用于扫描范围 */
  limit?: number;
}

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function mapCleanupRule(row: CleanupRuleRow) {
  return {
    id: row.id,
    userId: row.user_id,
    forwardAccountId: row.forward_account_id,
    limit: row.limit_count,
    enabled: row.enabled === 1,
    postTypes: parseJsonArray<WeiboMediaType>(row.post_types, []),
    requiredTags: parseJsonArray<string>(row.required_tags, []),
    judgeProfile: row.judge_profile,
    judgePrompt: row.judge_prompt,
    schedule: row.schedule,
    since: row.since_date ?? defaultCleanupSinceDate(),
    until: row.until_date ?? defaultCleanupUntilDate(),
    createdAt: row.created_at,
  };
}

export function mapCleanupRecord(row: CleanupRecordRow) {
  return {
    id: row.id,
    userId: row.user_id,
    forwardAccountId: row.forward_account_id,
    mid: row.mid,
    detailUrl: row.detail_url,
    judgeReason: row.judge_reason,
    deletedAt: row.deleted_at,
    dryRun: row.dry_run === 1,
  };
}

export function listCleanupRules(db: Database.Database, userId: string): CleanupRuleRow[] {
  return db
    .prepare("SELECT * FROM cleanup_rules WHERE user_id = ? ORDER BY created_at")
    .all(userId) as CleanupRuleRow[];
}

export function listAllCleanupRules(db: Database.Database): CleanupRuleRow[] {
  return db
    .prepare("SELECT * FROM cleanup_rules ORDER BY created_at")
    .all() as CleanupRuleRow[];
}

export function getCleanupRule(
  db: Database.Database,
  userId: string,
  ruleId: string,
): CleanupRuleRow | undefined {
  return db
    .prepare("SELECT * FROM cleanup_rules WHERE user_id = ? AND id = ?")
    .get(userId, ruleId) as CleanupRuleRow | undefined;
}

export function resolveCleanupRule(
  db: Database.Database,
  actor: UserRow,
  ruleId: string,
): CleanupRuleRow | undefined {
  if (isAdmin(actor)) {
    return db
      .prepare("SELECT * FROM cleanup_rules WHERE id = ?")
      .get(ruleId) as CleanupRuleRow | undefined;
  }
  return getCleanupRule(db, actor.id, ruleId);
}

export function createCleanupRule(
  db: Database.Database,
  userId: string,
  input: CreateCleanupRuleInput,
): CleanupRuleRow {
  const account = db
    .prepare("SELECT id FROM forward_accounts WHERE user_id = ? AND id = ?")
    .get(userId, input.forwardAccountId);
  if (!account) {
    throw new Error(`转发账号 "${input.forwardAccountId}" 不存在`);
  }

  const id = generateId();
  const since = input.since ?? defaultCleanupSinceDate();
  const until = input.until ?? defaultCleanupUntilDate();
  db.prepare(
    `INSERT INTO cleanup_rules
      (id, user_id, forward_account_id, limit_count, enabled, post_types, required_tags, judge_profile, judge_prompt, schedule, since_date, until_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    input.forwardAccountId,
    input.limit ?? 30,
    input.enabled === false ? 0 : 1,
    JSON.stringify(input.postTypes ?? []),
    JSON.stringify(input.requiredTags ?? ["追觅", "俞浩"]),
    input.judgeProfile ?? null,
    input.judgePrompt ?? null,
    input.schedule ?? null,
    since,
    until,
  );
  return getCleanupRule(db, userId, id)!;
}

export function updateCleanupRule(
  db: Database.Database,
  userId: string,
  ruleId: string,
  patch: {
    enabled?: boolean;
    schedule?: string | null;
    limit?: number;
    postTypes?: WeiboMediaType[];
    requiredTags?: string[];
    judgeProfile?: string | null;
    judgePrompt?: string | null;
    since?: string | null;
    until?: string | null;
  },
): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];

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
  if (patch.postTypes !== undefined) {
    fields.push("post_types = ?");
    values.push(JSON.stringify(patch.postTypes));
  }
  if (patch.requiredTags !== undefined) {
    fields.push("required_tags = ?");
    values.push(JSON.stringify(patch.requiredTags));
  }
  if (patch.judgeProfile !== undefined) {
    fields.push("judge_profile = ?");
    values.push(patch.judgeProfile);
  }
  if (patch.judgePrompt !== undefined) {
    fields.push("judge_prompt = ?");
    values.push(patch.judgePrompt);
  }
  if (patch.since !== undefined) {
    fields.push("since_date = ?");
    values.push(patch.since);
  }
  if (patch.until !== undefined) {
    fields.push("until_date = ?");
    values.push(patch.until);
  }

  if (fields.length === 0) return false;

  values.push(userId, ruleId);
  const result = db
    .prepare(`UPDATE cleanup_rules SET ${fields.join(", ")} WHERE user_id = ? AND id = ?`)
    .run(...values);
  return result.changes > 0;
}

export function deleteCleanupRule(
  db: Database.Database,
  userId: string,
  ruleId: string,
): boolean {
  const result = db
    .prepare("DELETE FROM cleanup_rules WHERE user_id = ? AND id = ?")
    .run(userId, ruleId);
  return result.changes > 0;
}

export function listEnabledCleanupRules(
  db: Database.Database,
  userId: string,
): CleanupRuleRow[] {
  return db
    .prepare(
      "SELECT * FROM cleanup_rules WHERE user_id = ? AND enabled = 1 ORDER BY created_at",
    )
    .all(userId) as CleanupRuleRow[];
}

export function listAllEnabledCleanupRules(db: Database.Database): CleanupRuleRow[] {
  return db
    .prepare("SELECT * FROM cleanup_rules WHERE enabled = 1 ORDER BY created_at")
    .all() as CleanupRuleRow[];
}

export function listAllScheduledCleanupRules(db: Database.Database): CleanupRuleRow[] {
  return db
    .prepare(
      `SELECT * FROM cleanup_rules
       WHERE enabled = 1 AND schedule IS NOT NULL AND trim(schedule) != ''
       ORDER BY created_at`,
    )
    .all() as CleanupRuleRow[];
}

export function listCleanupRecords(
  db: Database.Database,
  userId: string,
  options: { forwardAccountId?: string; limit?: number; offset?: number } = {},
): { records: CleanupRecordRow[]; total: number; deletedTotal: number } {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const params: unknown[] = [userId];
  let where = "WHERE user_id = ?";

  if (options.forwardAccountId) {
    where += " AND forward_account_id = ?";
    params.push(options.forwardAccountId);
  }

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM cleanup_records ${where}`).get(...params) as {
      c: number;
    }
  ).c;

  const deletedTotal = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM cleanup_records ${where} AND dry_run = 0`)
      .get(...params) as { c: number }
  ).c;

  const records = db
    .prepare(
      `SELECT * FROM cleanup_records ${where} ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as CleanupRecordRow[];

  return { records, total, deletedTotal };
}

export function listAllCleanupRecords(
  db: Database.Database,
  options: { userId?: string; forwardAccountId?: string; limit?: number; offset?: number } = {},
): { records: CleanupRecordRow[]; total: number; deletedTotal: number } {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (options.userId) {
    clauses.push("user_id = ?");
    params.push(options.userId);
  }
  if (options.forwardAccountId) {
    clauses.push("forward_account_id = ?");
    params.push(options.forwardAccountId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const deletedWhere = where ? `${where} AND dry_run = 0` : "WHERE dry_run = 0";

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM cleanup_records ${where}`).get(...params) as {
      c: number;
    }
  ).c;

  const deletedTotal = (
    db.prepare(`SELECT COUNT(*) AS c FROM cleanup_records ${deletedWhere}`).get(...params) as {
      c: number;
    }
  ).c;

  const records = db
    .prepare(
      `SELECT * FROM cleanup_records ${where} ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as CleanupRecordRow[];

  return { records, total, deletedTotal };
}

export function getProcessedCleanupMids(
  db: Database.Database,
  forwardAccountId: string,
): Set<string> {
  const rows = db
    .prepare("SELECT mid FROM cleanup_records WHERE forward_account_id = ?")
    .all(forwardAccountId) as { mid: string }[];
  return new Set(rows.map((r) => r.mid));
}

export function insertCleanupRecord(
  db: Database.Database,
  input: {
    userId: string;
    forwardAccountId: string;
    mid: string;
    detailUrl: string;
    judgeReason: string;
    dryRun: boolean;
  },
): void {
  db.prepare(
    `INSERT OR IGNORE INTO cleanup_records
      (user_id, forward_account_id, mid, detail_url, judge_reason, dry_run)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.userId,
    input.forwardAccountId,
    input.mid,
    input.detailUrl,
    input.judgeReason,
    input.dryRun ? 1 : 0,
  );
}

export function getCleanupJudgment(
  db: Database.Database,
  ruleId: string,
  mid: string,
  ruleFingerprint: string,
): { shouldDelete: boolean; reason: string; ruleFingerprint: string } | null {
  const row = db
    .prepare(
      `SELECT rule_fingerprint, should_delete, reason FROM cleanup_judgments
       WHERE rule_id = ? AND mid = ?`,
    )
    .get(ruleId, mid) as
    | { rule_fingerprint: string; should_delete: number; reason: string }
    | undefined;
  if (!row || row.rule_fingerprint !== ruleFingerprint) return null;
  return {
    shouldDelete: row.should_delete === 1,
    reason: row.reason,
    ruleFingerprint: row.rule_fingerprint,
  };
}

export function upsertCleanupJudgment(
  db: Database.Database,
  input: SaveCleanupJudgmentInput,
): void {
  db.prepare(
    `INSERT INTO cleanup_judgments (rule_id, mid, rule_fingerprint, should_delete, reason)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(rule_id, mid) DO UPDATE SET
       rule_fingerprint = excluded.rule_fingerprint,
       should_delete = excluded.should_delete,
       reason = excluded.reason,
       judged_at = datetime('now')`,
  ).run(
    input.ruleId,
    input.mid,
    input.ruleFingerprint,
    input.shouldDelete ? 1 : 0,
    input.reason,
  );
}
