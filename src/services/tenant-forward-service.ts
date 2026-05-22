import { access } from "node:fs/promises";
import type Database from "better-sqlite3";
import type { ForwardJobResult } from "../core/interfaces.js";
import { DefaultJobRunner } from "../core/job-runner.js";
import { PlaywrightWeiboClient } from "../core/playwright-weibo-client.js";
import { createCommentGenerator } from "../core/comment-generator-factory.js";
import { RunLogger, createRunLogFn } from "../core/run-logger.js";
import { isAdmin } from "../db/access-control.js";
import {
  getUserPromptSettings,
  listAllEnabledRules,
  listEnabledRules,
  resolveRule,
} from "../db/user-store.js";
import {
  parseRulePromptProfile,
  PROMPT_TEMPLATES,
  resolveSystemPrompt,
} from "../prompt-templates.js";
import type { ForwardRuleRow, UserRow } from "../db/types.js";
import { SqliteForwardRepository } from "../repositories/sqlite-forward-repository.js";
import { randomDelay } from "../publisher.js";
import { tenantStorageStatePath } from "../tenancy/paths.js";

export interface TenantRunOptions {
  headless: boolean;
  dryRun?: boolean;
  logger?: RunLogger;
}

export interface TenantRunAllResult {
  totalForwarded: number;
  processed: number;
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

function createTenantJobRunner(
  userId: string,
  forwardAccountId: string,
  storagePath: string,
  db: Database.Database,
) {
  const forwardRepository = new SqliteForwardRepository(userId, db);
  const weiboClient = new PlaywrightWeiboClient(forwardAccountId, storagePath);
  const commentGenerator = createCommentGenerator();
  const jobRunner = new DefaultJobRunner({
    weiboClient,
    commentGenerator,
    forwardRepository,
  });
  return { jobRunner, weiboClient };
}

function tenantAccountKey(rule: ForwardRuleRow): string {
  return `${rule.user_id}:${rule.forward_account_id}`;
}

function resolveRuleSystemPrompt(
  db: Database.Database,
  rule: ForwardRuleRow,
): string {
  const settings = getUserPromptSettings(db, rule.user_id);
  if (!settings) {
    throw new Error(`用户 ${rule.user_id} 不存在`);
  }
  return resolveSystemPrompt(settings, rule.prompt_profile);
}

function describePromptSource(
  db: Database.Database,
  rule: ForwardRuleRow,
): string {
  const settings = getUserPromptSettings(db, rule.user_id);
  if (!settings) return "unknown";
  const parsed = parseRulePromptProfile(rule.prompt_profile);
  if (parsed.customPrompt) return "规则自定义";
  if (parsed.templateId) {
    return `规则模板: ${PROMPT_TEMPLATES[parsed.templateId].nameKey}`;
  }
  if (settings.customPrompt?.trim()) return "用户自定义";
  return `用户默认: ${settings.promptTemplateId}`;
}

async function runRulesBatch(
  db: Database.Database,
  rules: ForwardRuleRow[],
  env: TenantRunOptions,
): Promise<TenantRunAllResult> {
  const logger = env.logger ?? new RunLogger();
  const log = createRunLogFn(logger);
  const dryRun = !!env.dryRun;

  if (rules.length === 0) {
    log("没有已启用的规则。");
    return { totalForwarded: 0, processed: 0, logs: logger.getLines(), dryRun };
  }

  const byTenantAccount = new Map<string, ForwardRuleRow[]>();
  for (const rule of rules) {
    const key = tenantAccountKey(rule);
    const list = byTenantAccount.get(key) ?? [];
    list.push(rule);
    byTenantAccount.set(key, list);
  }

  let totalForwarded = 0;
  let processed = 0;

  for (const [, accountRules] of byTenantAccount) {
    const ownerId = accountRules[0]!.user_id;
    const accountId = accountRules[0]!.forward_account_id;
    const storagePath = tenantStorageStatePath(ownerId, accountId);
    if (!(await storageStateExists(storagePath))) {
      logger.warn(`跳过账号 ${accountId}（用户 ${ownerId.slice(0, 8)}）：未上传登录态`);
      continue;
    }

    const { jobRunner, weiboClient } = createTenantJobRunner(
      ownerId,
      accountId,
      storagePath,
      db,
    );

    log(
      `=== 账号 [${accountId}]（用户 ${ownerId.slice(0, 8)}）：${accountRules.length} 条规则（共享浏览器会话）===`,
    );

    await weiboClient.withSession(env.headless, async (context) => {
      for (let i = 0; i < accountRules.length; i++) {
        const rule = accountRules[i]!;
        log(`>>> 规则 [${rule.id}] 源UID=${rule.source_uid} limit=${rule.limit_count}`);
        log(`评语风格: ${describePromptSource(db, rule)}`);

        const result = await jobRunner.run(
          {
            forwardAccountId: rule.forward_account_id,
            sourceUid: rule.source_uid,
            limit: rule.limit_count,
            dryRun,
            headless: env.headless,
            systemPrompt: resolveRuleSystemPrompt(db, rule),
          },
          { context, logger },
        );
        totalForwarded += result.forwarded;
        processed += result.processed;

        if (i < accountRules.length - 1) {
          log("规则间隔等待…");
          await randomDelay(4000, 9000);
        }
      }
    });
  }

  log("");
  log(
    dryRun
      ? `全部完成（dry-run，未实际转发），共处理 ${processed} 条，模拟转发 ${totalForwarded} 条。`
      : `全部完成，共处理 ${processed} 条，实际转发 ${totalForwarded} 条。`,
  );

  return {
    totalForwarded,
    processed,
    logs: logger.getLines(),
    dryRun,
  };
}

export async function runTenantRule(
  db: Database.Database,
  actor: UserRow,
  ruleId: string,
  env: TenantRunOptions,
): Promise<ForwardJobResult> {
  const rule = resolveRule(db, actor, ruleId);
  if (!rule) {
    throw new Error(`规则 "${ruleId}" 不存在`);
  }

  const storagePath = tenantStorageStatePath(rule.user_id, rule.forward_account_id);
  if (!(await storageStateExists(storagePath))) {
    throw new Error(
      `转发账号未登录，请先上传登录态: POST /api/v1/accounts/${rule.forward_account_id}/storage-state`,
    );
  }

  const logger = env.logger ?? new RunLogger();
  const log = createRunLogFn(logger);
  const dryRun = !!env.dryRun;

  const { jobRunner } = createTenantJobRunner(
    rule.user_id,
    rule.forward_account_id,
    storagePath,
    db,
  );

  log(
    `>>> [租户 ${rule.user_id.slice(0, 8)}] 规则 ${rule.id} 源UID=${rule.source_uid} limit=${rule.limit_count}`,
  );
  log(`评语风格: ${describePromptSource(db, rule)}`);
  if (dryRun) log("模式: dry-run（不会真正转发）");

  const result = await jobRunner.run(
    {
      forwardAccountId: rule.forward_account_id,
      sourceUid: rule.source_uid,
      limit: rule.limit_count,
      dryRun,
      headless: env.headless,
      systemPrompt: resolveRuleSystemPrompt(db, rule),
    },
    { logger },
  );

  log("");
  log(
    dryRun
      ? `规则执行结束（dry-run）：处理 ${result.processed} 条，模拟转发 ${result.forwarded} 条。`
      : `规则执行结束：处理 ${result.processed} 条，转发 ${result.forwarded} 条。`,
  );

  return {
    ...result,
    logs: logger.getLines(),
    dryRun,
  };
}

export async function runTenantAllRules(
  db: Database.Database,
  actor: UserRow,
  env: TenantRunOptions,
  scopeUserId?: string,
): Promise<TenantRunAllResult> {
  let rules: ForwardRuleRow[];
  if (scopeUserId) {
    rules = listEnabledRules(db, scopeUserId);
  } else if (isAdmin(actor)) {
    rules = listAllEnabledRules(db);
  } else {
    rules = listEnabledRules(db, actor.id);
  }

  const logger = env.logger ?? new RunLogger();
  if (env.dryRun) {
    logger.log("模式: dry-run（不会真正转发）");
  }
  return runRulesBatch(db, rules, { ...env, logger });
}
