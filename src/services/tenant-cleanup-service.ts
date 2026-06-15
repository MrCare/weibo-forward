import { access } from "node:fs/promises";
import type Database from "better-sqlite3";
import type { CleanupJobResult } from "../core/interfaces.js";
import { buildCleanupJobInput } from "../core/build-cleanup-job-input.js";
import { DefaultCleanupJobRunner } from "../core/cleanup-job-runner.js";
import { PlaywrightWeiboClient } from "../core/playwright-weibo-client.js";
import { RunLogger, createRunLogFn } from "../core/run-logger.js";
import { isAdmin } from "../db/access-control.js";
import type { CleanupRuleRow } from "../db/types.js";
import {
  listAllEnabledCleanupRules,
  listEnabledCleanupRules,
  resolveCleanupRule,
} from "../db/cleanup-store.js";
import { SqliteCleanupRepository } from "../repositories/sqlite-cleanup-repository.js";
import { randomDelay } from "../publisher.js";
import { tenantStorageStatePath } from "../tenancy/paths.js";
import type { UserRow } from "../db/types.js";
import type { WeiboMediaType } from "../types.js";

export interface TenantCleanupRunOptions {
  headless: boolean;
  dryRun?: boolean;
  logger?: RunLogger;
}

export interface TenantCleanupRunAllResult {
  totalDeleted: number;
  scanned: number;
  logs: string[];
  dryRun: boolean;
}

async function storageStateExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function createTenantCleanupJobRunner(
  userId: string,
  forwardAccountId: string,
  storagePath: string,
  db: Database.Database,
) {
  const cleanupRepository = new SqliteCleanupRepository(userId, db);
  const weiboClient = new PlaywrightWeiboClient(forwardAccountId, storagePath);
  const cleanupJobRunner = new DefaultCleanupJobRunner({
    weiboClient,
    cleanupRepository,
  });
  return { cleanupJobRunner, weiboClient };
}

function tenantAccountKey(rule: CleanupRuleRow): string {
  return `${rule.user_id}:${rule.forward_account_id}`;
}

function parseRulePostTypes(rule: CleanupRuleRow): WeiboMediaType[] {
  try {
    const parsed = JSON.parse(rule.post_types) as WeiboMediaType[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRuleRequiredTags(rule: CleanupRuleRow): string[] {
  try {
    const parsed = JSON.parse(rule.required_tags) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildJobInputFromRule(rule: CleanupRuleRow, dryRun: boolean, headless: boolean) {
  return buildCleanupJobInput({
    forwardAccountId: rule.forward_account_id,
    since: rule.since_date ?? undefined,
    until: rule.until_date ?? undefined,
    postTypes: parseRulePostTypes(rule),
    requiredTags: parseRuleRequiredTags(rule),
    dryRun,
    headless,
  });
}

async function runCleanupRulesBatch(
  db: Database.Database,
  rules: CleanupRuleRow[],
  env: TenantCleanupRunOptions,
): Promise<TenantCleanupRunAllResult> {
  const logger = env.logger ?? new RunLogger();
  const log = createRunLogFn(logger);
  const dryRun = !!env.dryRun;

  if (rules.length === 0) {
    log("没有已启用的清理规则。");
    return { totalDeleted: 0, scanned: 0, logs: logger.getLines(), dryRun };
  }

  const byTenantAccount = new Map<string, CleanupRuleRow[]>();
  for (const rule of rules) {
    const key = tenantAccountKey(rule);
    const list = byTenantAccount.get(key) ?? [];
    list.push(rule);
    byTenantAccount.set(key, list);
  }

  let totalDeleted = 0;
  let scanned = 0;

  for (const [, accountRules] of byTenantAccount) {
    const ownerId = accountRules[0]!.user_id;
    const forwardAccountId = accountRules[0]!.forward_account_id;
    const storagePath = tenantStorageStatePath(ownerId, forwardAccountId);

    if (!(await storageStateExists(storagePath))) {
      log(`账号 ${forwardAccountId} 未登录，跳过 ${accountRules.length} 条清理规则`);
      continue;
    }

    const { cleanupJobRunner, weiboClient } = createTenantCleanupJobRunner(
      ownerId,
      forwardAccountId,
      storagePath,
      db,
    );

    log(`=== 登录账号 [${forwardAccountId}]：本批次 ${accountRules.length} 条清理规则 ===`);

    await weiboClient.withSession(env.headless, async (context) => {
      for (let i = 0; i < accountRules.length; i++) {
        const rule = accountRules[i]!;
        const jobInput = buildJobInputFromRule(rule, dryRun, env.headless);
        log(
          `>>> 清理规则 [${rule.id}] 账号=${rule.forward_account_id} ${jobInput.since}~${jobInput.until}`,
        );

        const result = await cleanupJobRunner.run(jobInput, { context, logger });

        totalDeleted += result.deleted;
        scanned += result.scanned;

        if (i < accountRules.length - 1) {
          log("规则间隔等待…");
          await randomDelay(4000, 9000);
        }
      }
    });
  }

  log(`全部完成，共${dryRun ? "将删" : "删除"} ${totalDeleted} 条。`);
  return { totalDeleted, scanned, logs: logger.getLines(), dryRun };
}

export async function runTenantCleanupRule(
  db: Database.Database,
  actor: UserRow,
  ruleId: string,
  env: TenantCleanupRunOptions,
): Promise<CleanupJobResult & { logs: string[] }> {
  const rule = resolveCleanupRule(db, actor, ruleId);
  if (!rule) {
    throw new Error("清理规则不存在");
  }

  const storagePath = tenantStorageStatePath(rule.user_id, rule.forward_account_id);
  if (!(await storageStateExists(storagePath))) {
    throw new Error(`账号 ${rule.forward_account_id} 未登录，请先扫码登录`);
  }

  const logger = env.logger ?? new RunLogger();
  const { cleanupJobRunner } = createTenantCleanupJobRunner(
    rule.user_id,
    rule.forward_account_id,
    storagePath,
    db,
  );

  const result = await cleanupJobRunner.run(
    buildJobInputFromRule(rule, !!env.dryRun, env.headless),
    { logger },
  );

  return { ...result, logs: logger.getLines() };
}

export async function runTenantAllCleanupRules(
  db: Database.Database,
  actor: UserRow,
  env: TenantCleanupRunOptions,
  scopeUserId?: string | null,
): Promise<TenantCleanupRunAllResult> {
  const rules =
    scopeUserId && !isAdmin(actor)
      ? listEnabledCleanupRules(db, scopeUserId)
      : scopeUserId && isAdmin(actor)
        ? listEnabledCleanupRules(db, scopeUserId)
        : isAdmin(actor)
          ? listAllEnabledCleanupRules(db)
          : listEnabledCleanupRules(db, actor.id);

  return runCleanupRulesBatch(db, rules, env);
}
