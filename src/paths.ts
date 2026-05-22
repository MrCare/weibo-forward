import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FORWARD_ACCOUNT_ID } from "./core/constants.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = path.join(ROOT, "data");

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

/** 某转发微博账号的数据目录（default 仍使用 data/ 根目录以兼容旧数据） */
export function accountDataDir(forwardAccountId: string): string {
  if (forwardAccountId === DEFAULT_FORWARD_ACCOUNT_ID) {
    return DATA_DIR;
  }
  return path.join(DATA_DIR, "accounts", forwardAccountId);
}

export async function ensureAccountDataDir(forwardAccountId: string): Promise<string> {
  const dir = accountDataDir(forwardAccountId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** 转发微博账号的 Playwright storageState 路径 */
export function storageStatePath(forwardAccountId: string): string {
  if (forwardAccountId === DEFAULT_FORWARD_ACCOUNT_ID) {
    return path.join(DATA_DIR, "storageState.json");
  }
  return path.join(accountDataDir(forwardAccountId), "storageState.json");
}

export function forwardedPostsCsvPath(forwardAccountId: string): string {
  return path.join(accountDataDir(forwardAccountId), "forwarded-posts.csv");
}

export function forwardedJsonPath(forwardAccountId: string): string {
  return path.join(accountDataDir(forwardAccountId), "forwarded.json");
}

export function myRepostLinksCsvPath(forwardAccountId: string): string {
  return path.join(accountDataDir(forwardAccountId), "my-repost-links.csv");
}
