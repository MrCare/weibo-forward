import cron, { type ScheduledTask } from "node-cron";
import type Database from "better-sqlite3";
import { loadEnvSettings } from "../config.js";
import { getUserById, listAllScheduledRules } from "../db/user-store.js";
import { listAllScheduledCleanupRules } from "../db/cleanup-store.js";
import { runTenantCleanupRule } from "./tenant-cleanup-service.js";
import { runTenantRule } from "./tenant-forward-service.js";

const scheduledTasks = new Map<string, ScheduledTask>();

function cronEnabled(): boolean {
  return process.env.CRON_ENABLED !== "false";
}

export function reloadCronScheduler(db: Database.Database): void {
  for (const task of scheduledTasks.values()) {
    task.stop();
  }
  scheduledTasks.clear();

  if (!cronEnabled()) {
    console.log("[cron] 已禁用（CRON_ENABLED=false）");
    return;
  }

  const forwardRules = listAllScheduledRules(db);
  const cleanupRules = listAllScheduledCleanupRules(db);
  let registered = 0;

  for (const rule of forwardRules) {
    const expr = rule.schedule?.trim();
    if (!expr) continue;

    if (!cron.validate(expr)) {
      console.warn(`[cron] 转发规则 ${rule.id} 的 schedule 无效: ${expr}`);
      continue;
    }

    const task = cron.schedule(
      expr,
      async () => {
        console.log(`[cron] 执行转发规则 ${rule.id} (用户 ${rule.user_id})`);
        try {
          const owner = getUserById(db, rule.user_id);
          if (!owner) {
            console.error(`[cron] 规则 ${rule.id} 所属用户不存在`);
            return;
          }
          const env = loadEnvSettings({ dryRun: false });
          await runTenantRule(db, owner, rule.id, {
            headless: env.headless,
            dryRun: false,
          });
        } catch (err) {
          console.error(`[cron] 转发规则 ${rule.id} 失败:`, err);
        }
      },
      { timezone: process.env.CRON_TZ ?? "Asia/Shanghai" },
    );

    scheduledTasks.set(`forward:${rule.id}`, task);
    registered++;
    console.log(`[cron] 已注册转发 ${rule.id}: ${expr}`);
  }

  for (const rule of cleanupRules) {
    const expr = rule.schedule?.trim();
    if (!expr) continue;

    if (!cron.validate(expr)) {
      console.warn(`[cron] 清理规则 ${rule.id} 的 schedule 无效: ${expr}`);
      continue;
    }

    const task = cron.schedule(
      expr,
      async () => {
        console.log(`[cron] 执行清理规则 ${rule.id} (用户 ${rule.user_id})`);
        try {
          const owner = getUserById(db, rule.user_id);
          if (!owner) {
            console.error(`[cron] 清理规则 ${rule.id} 所属用户不存在`);
            return;
          }
          const env = loadEnvSettings({ dryRun: false });
          await runTenantCleanupRule(db, owner, rule.id, {
            headless: env.headless,
            dryRun: false,
          });
        } catch (err) {
          console.error(`[cron] 清理规则 ${rule.id} 失败:`, err);
        }
      },
      { timezone: process.env.CRON_TZ ?? "Asia/Shanghai" },
    );

    scheduledTasks.set(`cleanup:${rule.id}`, task);
    registered++;
    console.log(`[cron] 已注册清理 ${rule.id}: ${expr}`);
  }

  console.log(`[cron] 共 ${registered} 条定时规则`);
}

export function startCronScheduler(db: Database.Database): void {
  reloadCronScheduler(db);
}
