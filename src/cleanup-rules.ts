import { access, readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { WeiboMediaType } from "./types.js";
import {
  resolveAccountStorageState,
  resolveRulesPath,
  type ForwardAccountConfig,
} from "./rules.js";
import { defaultCleanupSinceDate, defaultCleanupUntilDate } from "./core/cleanup-dates.js";

const mediaTypeSchema = z.enum(["video", "image", "text", "unknown"]);

const cleanupRuleSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1).optional(),
  forwardAccountId: z.string().min(1).optional(),
  enabled: z.boolean().optional().default(true),
  limit: z.number().int().positive().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  postTypes: z.array(mediaTypeSchema).default([]),
  requiredTags: z.array(z.string().min(1)).default(["追觅", "俞浩"]),
  judgeProfile: z.string().optional(),
  judgePrompt: z.string().optional(),
  schedule: z.string().optional(),
});

const accountSchema = z.object({
  id: z.string().min(1),
  storageState: z.string().optional(),
});

const cleanupRulesFileSchema = z.object({
  accounts: z.array(accountSchema).min(1),
  cleanupRules: z.array(cleanupRuleSchema).min(1),
});

export type CleanupRuleConfig = z.infer<typeof cleanupRuleSchema> & {
  forwardAccountId: string;
  since: string;
  until: string;
};

export async function loadCleanupRulesFromFile(
  configPath?: string,
): Promise<{ accounts: Map<string, ForwardAccountConfig>; cleanupRules: CleanupRuleConfig[] }> {
  const filePath = resolveRulesPath(configPath);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(`未找到规则文件: ${filePath}`);
  }

  const parsed = parseYaml(raw);
  const result = cleanupRulesFileSchema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`规则文件格式错误 (${filePath}):\n${msg}`);
  }

  const data = result.data;
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));

  const cleanupRules: CleanupRuleConfig[] = [];
  const ids = new Set<string>();

  for (const rule of data.cleanupRules) {
    const forwardAccountId = rule.forwardAccountId ?? rule.accountId;
    if (!forwardAccountId) {
      throw new Error(`清理规则 "${rule.id}" 缺少 accountId / forwardAccountId`);
    }
    if (ids.has(rule.id)) {
      throw new Error(`cleanupRules 中存在重复的 id: ${rule.id}`);
    }
    ids.add(rule.id);
    if (!accounts.has(forwardAccountId)) {
      throw new Error(
        `清理规则 "${rule.id}" 引用了未知账号 "${forwardAccountId}"，请在 accounts 中声明`,
      );
    }
    cleanupRules.push({
      ...rule,
      forwardAccountId,
      since: rule.since ?? defaultCleanupSinceDate(),
      until: rule.until ?? defaultCleanupUntilDate(),
    });
  }

  return { accounts, cleanupRules };
}

export async function cleanupRulesFileExists(configPath?: string): Promise<boolean> {
  return hasCleanupRulesSection(configPath);
}

export function listEnabledCleanupRules(rules: CleanupRuleConfig[]): CleanupRuleConfig[] {
  return rules.filter((r) => r.enabled !== false);
}

export function findCleanupRule(rules: CleanupRuleConfig[], ruleId: string): CleanupRuleConfig {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) {
    throw new Error(
      `未找到清理规则 "${ruleId}"，可用: ${rules.map((r) => r.id).join(", ")}`,
    );
  }
  return rule;
}

export function cleanupRulePostTypes(rule: CleanupRuleConfig): WeiboMediaType[] {
  return rule.postTypes as WeiboMediaType[];
}

export { resolveAccountStorageState, resolveRulesPath };
export type { ForwardAccountConfig };

export async function hasCleanupRulesSection(configPath?: string): Promise<boolean> {
  const filePath = resolveRulesPath(configPath);
  try {
    await access(filePath);
  } catch {
    return false;
  }
  const raw = await readFile(filePath, "utf-8");
  const parsed = parseYaml(raw) as { cleanupRules?: unknown[] };
  return Array.isArray(parsed.cleanupRules) && parsed.cleanupRules.length > 0;
}
