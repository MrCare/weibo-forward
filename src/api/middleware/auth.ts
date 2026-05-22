import type { Request, Response, NextFunction } from "express";
import { findUserByApiKey } from "../../db/user-store.js";
import { getDatabase } from "../../db/client.js";
import type { UserRow } from "../../db/types.js";

export interface AuthedRequest extends Request {
  user?: UserRow;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const apiKey =
    header?.startsWith("Bearer ") ? header.slice(7).trim() : (req.headers["x-api-key"] as string);

  if (!apiKey) {
    res.status(401).json({ error: "缺少 Authorization: Bearer <api_key> 或 X-Api-Key" });
    return;
  }

  const db = getDatabase();
  const user = findUserByApiKey(db, apiKey);
  if (!user) {
    res.status(401).json({ error: "无效的 API Key" });
    return;
  }

  req.user = user;
  next();
}
