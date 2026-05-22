import type { CommentGenerator } from "./interfaces.js";
import { QwenApiCommentGenerator } from "./qwen-api-comment-generator.js";
import { QwenCliCommentGenerator } from "./qwen-comment-generator.js";

export type CommentGeneratorMode = "cli" | "api" | "auto";

export function resolveCommentGeneratorMode(): CommentGeneratorMode {
  const explicit = process.env.COMMENT_GENERATOR?.trim().toLowerCase();
  if (explicit === "cli" || explicit === "api") return explicit;
  if (process.env.QWEN_API_KEY?.trim()) return "api";
  return "cli";
}

export function createCommentGenerator(): CommentGenerator {
  const mode = resolveCommentGeneratorMode();
  if (mode === "api") {
    return new QwenApiCommentGenerator();
  }
  return new QwenCliCommentGenerator();
}

export function describeCommentGenerator(): string {
  const mode = resolveCommentGeneratorMode();
  if (mode === "api") {
    const model = process.env.QWEN_MODEL ?? "qwen-plus";
    return `qwen-api (${model})`;
  }
  return "qwen-cli (本机命令行)";
}
