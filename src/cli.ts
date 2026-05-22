#!/usr/bin/env node
import { Command } from "commander";
import { loginAndSaveState } from "./auth.js";
import { loadConfig, loadEnvSettings, type CliOverrides } from "./config.js";
import { createDefaultDeps, DEFAULT_FORWARD_ACCOUNT_ID } from "./core/index.js";
import { runAllRules, runForwardRule } from "./forward-run.js";
import {
  findRule,
  getAccountMap,
  listEnabledRules,
  loadRulesFile,
  rulesFileExists,
} from "./rules.js";

const program = new Command();

program.name("weibo-forward").description("微博自动转发工具");

program
  .command("auth")
  .description("登录相关")
  .addCommand(
    new Command("login")
      .description("扫码/登录并保存 storageState")
      .option("--account <id>", "转发微博账号 ID", DEFAULT_FORWARD_ACCOUNT_ID)
      .action(async (opts: { account: string }) => {
        await loginAndSaveState(opts.account);
      }),
  );

program
  .command("forward")
  .description("抓取源账号新微博并转发")
  .option("--config <path>", "规则文件路径", "rules.yaml")
  .option("--rule <id>", "执行指定规则（需 rules.yaml）")
  .option("--all", "执行所有已启用规则（需 rules.yaml）")
  .option("--uid <uid>", "源账号 UID（兼容模式，覆盖 SOURCE_UID）")
  .option("--limit <n>", "最多处理条数（兼容模式）", (v) => parseInt(v, 10))
  .option("--dry-run", "仅生成文案，不点击转发、不写记录")
  .action(
    async (opts: {
      config: string;
      rule?: string;
      all?: boolean;
      uid?: string;
      limit?: number;
      dryRun?: boolean;
    }) => {
      const overrides: CliOverrides = {
        uid: opts.uid,
        limit: opts.limit,
        dryRun: opts.dryRun,
      };

      const hasRules = await rulesFileExists(opts.config);

      if (opts.rule || opts.all) {
        if (!hasRules) {
          throw new Error(
            `未找到规则文件，请先创建 ${opts.config}（可参考 rules.yaml.example）`,
          );
        }
        const rules = await loadRulesFile(opts.config);
        const env = loadEnvSettings(overrides);

        if (opts.rule && opts.all) {
          throw new Error("请只指定 --rule 或 --all 之一");
        }

        if (opts.rule) {
          const rule = findRule(rules, opts.rule);
          if (rule.enabled === false) {
            console.warn(`规则 "${opts.rule}" 已禁用，仍将执行（可设 enabled: true）`);
          }
          const accounts = getAccountMap(rules);
          await runForwardRule(rule, accounts, env);
          console.log("\n完成。");
          return;
        }

        await runAllRules(rules, env);
        return;
      }

      if (hasRules && !opts.uid) {
        const enabled = listEnabledRules(await loadRulesFile(opts.config));
        throw new Error(
          `已存在 ${opts.config}，请使用 --rule <id> 或 --all。\n` +
            `可用规则: ${enabled.map((r) => r.id).join(", ") || "(无已启用规则)"}`,
        );
      }

      const config = loadConfig(overrides);
      const { jobRunner } = createDefaultDeps(DEFAULT_FORWARD_ACCOUNT_ID);

      await jobRunner.run({
        forwardAccountId: DEFAULT_FORWARD_ACCOUNT_ID,
        sourceUid: config.sourceUid,
        limit: config.forwardLimit,
        dryRun: config.dryRun,
        headless: config.headless,
      });

      if (config.dryRun) {
        console.log("\n完成。");
      } else {
        console.log("\n完成。");
      }
    },
  );

program.parse();
