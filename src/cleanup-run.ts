import { createCleanupDeps } from "./cleanup-deps.js";
import type { CleanupRuleConfig } from "./cleanup-rules.js";
import {
  findCleanupRule,
  cleanupRulePostTypes,
  listEnabledCleanupRules,
  loadCleanupRulesFromFile,
  resolveAccountStorageState,
  type ForwardAccountConfig,
} from "./cleanup-rules.js";
import { buildCleanupJobInput } from "./core/build-cleanup-job-input.js";
import type { EnvSettings } from "./config.js";
import { randomDelay } from "./publisher.js";

export async function runCleanupRule(
  rule: CleanupRuleConfig,
  accounts: Map<string, ForwardAccountConfig>,
  env: EnvSettings,
): Promise<{ deleted: number; scanned: number }> {
  const account = accounts.get(rule.forwardAccountId);
  if (!account) {
    throw new Error(`清理规则 "${rule.id}" 引用了未知账号 "${rule.forwardAccountId}"`);
  }

  console.log(
    `\n>>> 清理规则 [${rule.id}] 账号=${rule.forwardAccountId} ${rule.since}~${rule.until} tags=${rule.requiredTags.join(",")}`,
  );

  const storagePath = resolveAccountStorageState(account);
  const { cleanupJobRunner } = createCleanupDeps(rule.forwardAccountId, storagePath);

  const result = await cleanupJobRunner.run(
    buildCleanupJobInput({
      forwardAccountId: rule.forwardAccountId,
      since: rule.since,
      until: rule.until,
      postTypes: cleanupRulePostTypes(rule),
      requiredTags: rule.requiredTags,
      dryRun: env.dryRun,
      headless: env.headless,
    }),
  );

  return { deleted: result.deleted, scanned: result.scanned };
}

export async function runAllCleanupRules(
  configPath: string,
  env: EnvSettings,
  ruleFilter?: (rule: CleanupRuleConfig) => boolean,
): Promise<void> {
  const { accounts, cleanupRules } = await loadCleanupRulesFromFile(configPath);
  const toRun = listEnabledCleanupRules(cleanupRules).filter((r) =>
    ruleFilter ? ruleFilter(r) : true,
  );

  if (toRun.length === 0) {
    console.log("没有可执行的清理规则（均已禁用或不存在）。");
    return;
  }

  let totalDeleted = 0;
  const byAccount = new Map<string, CleanupRuleConfig[]>();
  for (const rule of toRun) {
    const list = byAccount.get(rule.forwardAccountId) ?? [];
    list.push(rule);
    byAccount.set(rule.forwardAccountId, list);
  }

  for (const [forwardAccountId, accountRules] of byAccount) {
    const account = accounts.get(forwardAccountId);
    if (!account) {
      throw new Error(`未知转发账号 "${forwardAccountId}"`);
    }

    const storagePath = resolveAccountStorageState(account);
    const { cleanupJobRunner, weiboClient } = createCleanupDeps(forwardAccountId, storagePath);

    console.log(
      `\n=== 登录账号 [${forwardAccountId}]：本批次 ${accountRules.length} 条清理规则 ===`,
    );

    await weiboClient.withSession(env.headless, async (context) => {
      for (let i = 0; i < accountRules.length; i++) {
        const rule = accountRules[i]!;
        console.log(
          `\n>>> 清理规则 [${rule.id}] 账号=${rule.forwardAccountId} ${rule.since}~${rule.until}`,
        );

        const result = await cleanupJobRunner.run(
          buildCleanupJobInput({
            forwardAccountId: rule.forwardAccountId,
            since: rule.since,
            until: rule.until,
            postTypes: cleanupRulePostTypes(rule),
            requiredTags: rule.requiredTags,
            dryRun: env.dryRun,
            headless: env.headless,
          }),
          { context },
        );
        totalDeleted += result.deleted;

        if (i < accountRules.length - 1) {
          console.log("规则间隔等待…");
          await randomDelay(4000, 9000);
        }
      }
    });
  }

  console.log(`\n全部完成，共${env.dryRun ? "将删" : "删除"} ${totalDeleted} 条。`);
}

export { findCleanupRule, loadCleanupRulesFromFile, listEnabledCleanupRules };
