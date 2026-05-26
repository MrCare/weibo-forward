import { spawn } from "node:child_process";
import {
  buildForwardUserPrompt,
  FORWARD_SYSTEM_PROMPT,
  inferPromptTemplateIdFromSystemPrompt,
  resolveUserPromptTemplateId,
  type UserPromptSettings,
} from "./prompt-templates.js";

const QWEN_BIN = "qwen";

function runQwen(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(QWEN_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

export async function generateForwardComment(
  postText: string,
  systemPrompt?: string,
  userSettings?: UserPromptSettings,
  ruleProfile?: string | null,
): Promise<string> {
  const sys = systemPrompt ?? FORWARD_SYSTEM_PROMPT;
  const tplId =
    userSettings != null
      ? resolveUserPromptTemplateId(userSettings, ruleProfile)
      : inferPromptTemplateIdFromSystemPrompt(sys);
  const userPrompt = buildForwardUserPrompt(postText, tplId);
  const args = [
    "-y",
    "-o",
    "text",
    "--system-prompt",
    sys,
    userPrompt,
  ];

  const { stdout, stderr, code } = await runQwen(args);
  if (code !== 0) {
    throw new Error(`qwen 执行失败 (exit ${code}): ${stderr.trim() || stdout.trim()}`);
  }

  const raw = extractComment(stdout);
  if (!raw) throw new Error("qwen 未返回有效文案");

  return truncateComment(raw);
}

/** 合并 qwen 正文行；仅去掉末尾的 CLI 日志行（旧逻辑只取最后一行会丢掉前三句诗） */
export function extractComment(stdout: string): string {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  while (lines.length > 0 && isQwenTrailingNoise(lines[lines.length - 1]!)) {
    lines.pop();
  }

  return lines.join("\n") || stdout.trim();
}

function isQwenTrailingNoise(line: string): boolean {
  if (/^(tokens?|usage|cost|model|session|thinking|done)\b/i.test(line)) return true;
  if (/^[\d$>●✓✗─━\[\]]/.test(line)) return true;
  if (/^qwen\b/i.test(line)) return true;
  return false;
}

function truncateComment(text: string): string {
  const cleaned = text.replace(/^["「『]|["」』]$/g, "").trim();
  if ([...cleaned].length <= 140) return cleaned;
  return [...cleaned].slice(0, 137).join("") + "…";
}
