import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { AppConfig } from "./types.js";

loadEnv();

const envSchema = z.object({
  SOURCE_UID: z.string().optional(),
  FORWARD_LIMIT: z.coerce.number().int().positive().default(1),
  HEADLESS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DRY_RUN: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export interface CliOverrides {
  uid?: string;
  limit?: number;
  dryRun?: boolean;
}

export interface EnvSettings {
  headless: boolean;
  dryRun: boolean;
}

export function loadEnvSettings(overrides: Pick<CliOverrides, "dryRun"> = {}): EnvSettings {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  const env = parsed.data;
  return {
    headless: env.HEADLESS,
    dryRun: overrides.dryRun ?? env.DRY_RUN,
  };
}

/** 兼容模式：从 .env 加载单源账号配置 */
export function loadConfig(overrides: CliOverrides = {}): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${msg}`);
  }

  const env = parsed.data;
  const sourceUid = overrides.uid ?? env.SOURCE_UID;
  if (!sourceUid) {
    throw new Error("请通过 --uid 指定源账号 UID，或在 .env 中设置 SOURCE_UID");
  }

  return {
    sourceUid,
    forwardLimit: overrides.limit ?? env.FORWARD_LIMIT,
    headless: env.HEADLESS,
    dryRun: overrides.dryRun ?? env.DRY_RUN,
  };
}
