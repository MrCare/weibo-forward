import {
  buildForwardUserPrompt,
  FORWARD_SYSTEM_PROMPT,
  inferPromptTemplateIdFromSystemPrompt,
} from "../prompt-templates.js";
import type { CommentGenerator } from "./interfaces.js";

function truncateComment(text: string): string {
  const cleaned = text.replace(/^["「『]|["」』]$/g, "").trim();
  if ([...cleaned].length <= 140) return cleaned;
  return [...cleaned].slice(0, 137).join("") + "…";
}

/**
 * 通过 DashScope / Qwen OpenAI 兼容 API 生成评语（Docker 部署推荐）。
 * 环境变量：QWEN_API_KEY（必填）、QWEN_API_BASE、QWEN_MODEL
 */
export class QwenApiCommentGenerator implements CommentGenerator {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.QWEN_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("QWEN_API_KEY 未配置，无法使用 API 模式生成评语");
    }
    this.apiKey = apiKey;
    this.baseUrl = (
      process.env.QWEN_API_BASE ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).replace(/\/$/, "");
    this.model = process.env.QWEN_MODEL ?? "qwen-plus";
  }

  async generate(postText: string, systemPrompt?: string): Promise<string> {
    const sys = systemPrompt ?? FORWARD_SYSTEM_PROMPT;
    const tplId = inferPromptTemplateIdFromSystemPrompt(sys);
    const userPrompt = buildForwardUserPrompt(postText, tplId);
    const url = `${this.baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });

    const body = (await res.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!res.ok) {
      const msg = body.error?.message ?? res.statusText;
      throw new Error(`Qwen API 请求失败 (${res.status}): ${msg}`);
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Qwen API 未返回有效文案");
    }

    return truncateComment(content);
  }
}
