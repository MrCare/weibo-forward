import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../paths.js";

export function tenantRoot(userId: string): string {
  return path.join(DATA_DIR, "tenants", userId);
}

export function tenantAccountDir(userId: string, accountId: string): string {
  return path.join(tenantRoot(userId), "accounts", accountId);
}

export async function ensureTenantAccountDir(
  userId: string,
  accountId: string,
): Promise<string> {
  const dir = tenantAccountDir(userId, accountId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function tenantStorageStatePath(userId: string, accountId: string): string {
  return path.join(tenantAccountDir(userId, accountId), "storageState.json");
}

export function tenantErrorsDir(userId: string): string {
  return path.join(tenantRoot(userId), "errors");
}

export function tenantForwardedPostsCsvPath(userId: string, accountId: string): string {
  return path.join(tenantAccountDir(userId, accountId), "forwarded-posts.csv");
}

export function tenantMyRepostLinksCsvPath(userId: string, accountId: string): string {
  return path.join(tenantAccountDir(userId, accountId), "my-repost-links.csv");
}
