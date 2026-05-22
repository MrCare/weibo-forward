import type { UserRow } from "./types.js";

export type UserRole = "admin" | "user";

export class AccessDeniedError extends Error {
  constructor(message = "无权访问该资源") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export function isAdmin(user: UserRow): boolean {
  return user.role === "admin";
}

/** 列表接口：普通用户只能查本人；管理员可传 userId 筛选，不传则查全部 */
export function resolveListUserId(
  actor: UserRow,
  requestedUserId?: string | null,
): string | undefined {
  const filter = requestedUserId?.trim() || undefined;
  if (!isAdmin(actor)) {
    if (filter && filter !== actor.id) {
      throw new AccessDeniedError();
    }
    return actor.id;
  }
  return filter;
}

/** 创建资源时的所属用户：管理员可通过 userId 代建 */
export function resolveCreateUserId(
  actor: UserRow,
  requestedUserId?: string | null,
): string {
  const owner = requestedUserId?.trim();
  if (!isAdmin(actor)) {
    if (owner && owner !== actor.id) {
      throw new AccessDeniedError();
    }
    return actor.id;
  }
  return owner || actor.id;
}

export function assertCanAccessOwner(actor: UserRow, ownerUserId: string): void {
  if (!isAdmin(actor) && actor.id !== ownerUserId) {
    throw new AccessDeniedError();
  }
}

/** 读写评语风格设置的目标用户（管理员可指定 userId，普通用户只能是自己） */
export function resolvePromptTargetUserId(
  actor: UserRow,
  requestedUserId?: string | null,
): string {
  const target = requestedUserId?.trim();
  if (!target || target === actor.id) return actor.id;
  if (!isAdmin(actor)) {
    throw new AccessDeniedError();
  }
  return target;
}
