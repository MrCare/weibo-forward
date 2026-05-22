import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { storageStatePath } from "./paths.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const accountSchema = z.object({
  id: z.string().min(1),
  storageState: z.string().optional(),
});

const ruleSchema = z.object({
  id: z.string().min(1),
  forwardAccountId: z.string().min(1),
  sourceUid: z.string().min(1),
  limit: z.number().int().positive(),
  promptProfile: z.string().optional(),
  schedule: z.string().optional(),
  enabled: z.boolean().optional().default(true),
});

const rulesFileSchema = z.object({
  accounts: z.array(accountSchema).min(1),
  rules: z.array(ruleSchema).min(1),
});

export type ForwardAccountConfig = z.infer<typeof accountSchema>;
export type ForwardRuleConfig = z.infer<typeof ruleSchema>;
export type RulesFile = z.infer<typeof rulesFileSchema>;

export function resolveRulesPath(configPath?: string): string {
  if (configPath) {
    return path.isAbsolute(configPath) ? configPath : path.join(ROOT, configPath);
  }
  return path.join(ROOT, "rules.yaml");
}

export async function rulesFileExists(configPath?: string): Promise<boolean> {
  try {
    await access(resolveRulesPath(configPath));
    return true;
  } catch {
    return false;
  }
}

export async function loadRulesFile(configPath?: string): Promise<RulesFile> {
  const filePath = resolveRulesPath(configPath);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(`未找到规则文件: ${filePath}`);
  }

  const parsed = parseYaml(raw);
  const result = rulesFileSchema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`规则文件格式错误 (${filePath}):\n${msg}`);
  }

  const data = result.data;
  const accountIds = new Set(data.accounts.map((a) => a.id));
  if (accountIds.size !== data.accounts.length) {
    throw new Error("accounts 中存在重复的 id");
  }

  const ruleIds = new Set<string>();
  for (const rule of data.rules) {
    if (ruleIds.has(rule.id)) {
      throw new Error(`rules 中存在重复的 id: ${rule.id}`);
    }
    ruleIds.add(rule.id);
    if (!accountIds.has(rule.forwardAccountId)) {
      throw new Error(
        `规则 "${rule.id}" 引用了未知账号 "${rule.forwardAccountId}"，请在 accounts 中声明`,
      );
    }
  }

  return data;
}

export function resolveAccountStorageState(account: ForwardAccountConfig): string {
  if (account.storageState) {
    return path.isAbsolute(account.storageState)
      ? account.storageState
      : path.join(ROOT, account.storageState);
  }
  return storageStatePath(account.id);
}

export function getAccountMap(rules: RulesFile): Map<string, ForwardAccountConfig> {
  return new Map(rules.accounts.map((a) => [a.id, a]));
}

export function listEnabledRules(rules: RulesFile): ForwardRuleConfig[] {
  return rules.rules.filter((r) => r.enabled !== false);
}

export function findRule(rules: RulesFile, ruleId: string): ForwardRuleConfig {
  const rule = rules.rules.find((r) => r.id === ruleId);
  if (!rule) {
    throw new Error(`未找到规则 "${ruleId}"，可用: ${rules.rules.map((r) => r.id).join(", ")}`);
  }
  return rule;
}
