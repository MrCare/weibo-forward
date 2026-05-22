import { createDefaultDeps } from "./core/deps.js";
import { randomDelay } from "./publisher.js";
import type { EnvSettings } from "./config.js";
import type { ForwardRuleConfig } from "./rules.js";
import {
  getAccountMap,
  resolveAccountStorageState,
  type ForwardAccountConfig,
  type RulesFile,
} from "./rules.js";

export async function runForwardRule(
  rule: ForwardRuleConfig,
  accounts: Map<string, ForwardAccountConfig>,
  env: EnvSettings,
): Promise<{ forwarded: number; processed: number }> {
  const account = accounts.get(rule.forwardAccountId);
  if (!account) {
    throw new Error(`规则 "${rule.id}" 引用了未知账号 "${rule.forwardAccountId}"`);
  }

  console.log(
    `\n>>> 规则 [${rule.id}] 账号=${rule.forwardAccountId} 源UID=${rule.sourceUid} limit=${rule.limit}`,
  );

  const storagePath = resolveAccountStorageState(account);
  const { jobRunner } = createDefaultDeps(rule.forwardAccountId, storagePath);

  const result = await jobRunner.run({
    forwardAccountId: rule.forwardAccountId,
    sourceUid: rule.sourceUid,
    limit: rule.limit,
    dryRun: env.dryRun,
    headless: env.headless,
  });

  return { forwarded: result.forwarded, processed: result.processed };
}

function groupRulesByAccount(rules: ForwardRuleConfig[]): Map<string, ForwardRuleConfig[]> {
  const groups = new Map<string, ForwardRuleConfig[]>();
  for (const rule of rules) {
    const list = groups.get(rule.forwardAccountId) ?? [];
    list.push(rule);
    groups.set(rule.forwardAccountId, list);
  }
  return groups;
}

export async function runAllRules(
  rules: RulesFile,
  env: EnvSettings,
  ruleFilter?: (rule: ForwardRuleConfig) => boolean,
): Promise<void> {
  const accounts = getAccountMap(rules);
  const toRun = rules.rules.filter(
    (r) => r.enabled !== false && (ruleFilter ? ruleFilter(r) : true),
  );

  if (toRun.length === 0) {
    console.log("没有可执行的规则（均已禁用或不存在）。");
    return;
  }

  let totalForwarded = 0;
  const byAccount = groupRulesByAccount(toRun);

  for (const [forwardAccountId, accountRules] of byAccount) {
    const account = accounts.get(forwardAccountId);
    if (!account) {
      throw new Error(`未知转发账号 "${forwardAccountId}"`);
    }

    const storagePath = resolveAccountStorageState(account);
    const { jobRunner, weiboClient } = createDefaultDeps(forwardAccountId, storagePath);

    console.log(
      `\n=== 登录账号 [${forwardAccountId}]：本批次 ${accountRules.length} 条规则（共享浏览器会话 v2）===`,
    );

    await weiboClient.withSession(env.headless, async (context) => {
      for (let i = 0; i < accountRules.length; i++) {
        const rule = accountRules[i]!;
        console.log(
          `\n>>> 规则 [${rule.id}] 账号=${rule.forwardAccountId} 源UID=${rule.sourceUid} limit=${rule.limit}`,
        );

        const result = await jobRunner.run(
          {
            forwardAccountId: rule.forwardAccountId,
            sourceUid: rule.sourceUid,
            limit: rule.limit,
            dryRun: env.dryRun,
            headless: env.headless,
          },
          { context },
        );
        totalForwarded += result.forwarded;

        if (i < accountRules.length - 1) {
          console.log("规则间隔等待…");
          await randomDelay(4000, 9000);
        }
      }
    });
  }

  console.log(`\n全部完成，共转发 ${totalForwarded} 条。`);
}
