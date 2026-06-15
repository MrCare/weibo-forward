import type { ContentJudge } from "./interfaces.js";
import { resolveCommentGeneratorMode } from "./comment-generator-factory.js";
import { QwenApiContentJudge } from "./qwen-api-content-judge.js";
import { QwenCliContentJudge } from "./qwen-cli-content-judge.js";

export function createContentJudge(): ContentJudge {
  const mode = resolveCommentGeneratorMode();
  if (mode === "api") {
    return new QwenApiContentJudge();
  }
  return new QwenCliContentJudge();
}

export function describeContentJudge(): string {
  const mode = resolveCommentGeneratorMode();
  if (mode === "api") {
    const model = process.env.QWEN_MODEL ?? "qwen-plus";
    return `qwen-api (${model})`;
  }
  return "qwen-cli (本机命令行)";
}
