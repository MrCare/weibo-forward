import type Database from "better-sqlite3";
import { generateApiKey, generateId } from "../auth/tokens.js";
import type { LoginSessionRow, LoginSessionStatus } from "./types.js";

const SESSION_TTL_MS = 10 * 60 * 1000;

export function createLoginSession(
  db: Database.Database,
  userId: string,
  forwardAccountId: string,
): LoginSessionRow {
  const id = generateId();
  const loginToken = generateApiKey();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO login_sessions
      (id, user_id, forward_account_id, status, login_token, expires_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
  ).run(id, userId, forwardAccountId, loginToken, expiresAt);

  return getLoginSession(db, userId, id)!;
}

export function getLoginSession(
  db: Database.Database,
  userId: string,
  sessionId: string,
): LoginSessionRow | undefined {
  return db
    .prepare("SELECT * FROM login_sessions WHERE user_id = ? AND id = ?")
    .get(userId, sessionId) as LoginSessionRow | undefined;
}

export function getLoginSessionByToken(
  db: Database.Database,
  sessionId: string,
  loginToken: string,
): LoginSessionRow | undefined {
  return db
    .prepare("SELECT * FROM login_sessions WHERE id = ? AND login_token = ?")
    .get(sessionId, loginToken) as LoginSessionRow | undefined;
}

export function updateLoginSession(
  db: Database.Database,
  sessionId: string,
  patch: {
    status?: LoginSessionStatus;
    qrImagePath?: string | null;
    errorMessage?: string | null;
  },
): void {
  const fields: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];

  if (patch.status !== undefined) {
    fields.push("status = ?");
    values.push(patch.status);
  }
  if (patch.qrImagePath !== undefined) {
    fields.push("qr_image_path = ?");
    values.push(patch.qrImagePath);
  }
  if (patch.errorMessage !== undefined) {
    fields.push("error_message = ?");
    values.push(patch.errorMessage);
  }

  values.push(sessionId);
  db.prepare(`UPDATE login_sessions SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function expireStaleSessions(db: Database.Database): void {
  db.prepare(
    `UPDATE login_sessions SET status = 'expired', updated_at = datetime('now')
     WHERE status IN ('pending', 'awaiting_scan') AND expires_at < datetime('now')`,
  ).run();
}
