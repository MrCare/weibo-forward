import type Database from "better-sqlite3";
import { resolveListUserId } from "./access-control.js";
import type { ForwardRecordRow, UserRow } from "./types.js";

export interface ListForwardRecordsQuery {
  forwardAccountId?: string;
  sourceUid?: string;
  limit?: number;
  offset?: number;
}

export interface ListForwardRecordsResult {
  records: ForwardRecordRow[];
  total: number;
}

export function listForwardRecords(
  db: Database.Database,
  userId: string,
  query: ListForwardRecordsQuery = {},
): ListForwardRecordsResult {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);

  const conditions = ["user_id = ?"];
  const params: unknown[] = [userId];

  if (query.forwardAccountId) {
    conditions.push("forward_account_id = ?");
    params.push(query.forwardAccountId);
  }
  if (query.sourceUid) {
    conditions.push("source_uid = ?");
    params.push(query.sourceUid);
  }

  const where = conditions.join(" AND ");

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM forward_records WHERE ${where}`)
    .get(...params) as { c: number };

  const records = db
    .prepare(
      `SELECT * FROM forward_records WHERE ${where}
       ORDER BY forwarded_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ForwardRecordRow[];

  return { records, total: totalRow.c };
}

export function countForwardRecords(db: Database.Database, userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM forward_records WHERE user_id = ?")
    .get(userId) as { c: number };
  return row.c;
}

function buildForwardRecordWhere(query: ListForwardRecordsQuery, scopeUserId?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (scopeUserId) {
    conditions.push("user_id = ?");
    params.push(scopeUserId);
  }

  if (query.forwardAccountId) {
    conditions.push("forward_account_id = ?");
    params.push(query.forwardAccountId);
  }
  if (query.sourceUid) {
    conditions.push("source_uid = ?");
    params.push(query.sourceUid);
  }

  const where = conditions.length > 0 ? conditions.join(" AND ") : "1=1";
  return { where, params };
}

export function listForwardRecordsForActor(
  db: Database.Database,
  actor: UserRow,
  query: ListForwardRecordsQuery = {},
  requestedScopeUserId?: string,
): ListForwardRecordsResult {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);

  const ownerFilter = resolveListUserId(actor, requestedScopeUserId);
  const { where, params } = buildForwardRecordWhere(query, ownerFilter);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM forward_records WHERE ${where}`)
    .get(...params) as { c: number };

  const records = db
    .prepare(
      `SELECT * FROM forward_records WHERE ${where}
       ORDER BY forwarded_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ForwardRecordRow[];

  return { records, total: totalRow.c };
}

export function countForwardRecordsForActor(
  db: Database.Database,
  actor: UserRow,
  requestedScopeUserId?: string,
): number {
  const ownerFilter = resolveListUserId(actor, requestedScopeUserId);
  if (ownerFilter) return countForwardRecords(db, ownerFilter);

  const row = db.prepare("SELECT COUNT(*) AS c FROM forward_records").get() as { c: number };
  return row.c;
}
