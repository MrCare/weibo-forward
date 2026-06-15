import { judgePostsInBatches } from "./content-judge-batch.js";
import {
  buildCleanupUserPrompt,
  parseContentJudgment,
  SINGLE_OUTPUT_INSTRUCTION,
} from "./content-judge-utils.js";
import type { ContentJudge, ContentJudgment } from "./interfaces.js";
import type { WeiboPost } from "../types.js";

export class QwenApiContentJudge implements ContentJudge {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.QWEN_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("QWEN_API_KEY 未配置，无法使用 API 模式进行内容判定");
    }
    this.apiKey = apiKey;
    this.baseUrl = (
      process.env.QWEN_API_BASE ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).replace(/\/$/, "");
    this.model = process.env.QWEN_MODEL ?? "qwen-plus";
  }

  async judgeBatch(
    posts: WeiboPost[],
    systemPrompt: string,
  ): Promise<Map<string, ContentJudgment>> {
    return judgePostsInBatches(posts, systemPrompt, (userPrompt, outputInstruction) =>
      this.callApi(userPrompt, systemPrompt, outputInstruction),
    );
  }

  async judge(post: WeiboPost, systemPrompt: string): Promise<ContentJudgment> {
    const userPrompt = buildCleanupUserPrompt(post.text, post.mediaType);
    const content = await this.callApi(userPrompt, systemPrompt, SINGLE_OUTPUT_INSTRUCTION);
    const parsed = parseContentJudgment(content);
    if (!parsed) {
      throw new Error(`无法解析 LLM 判定结果: ${content.slice(0, 200)}`);
    }
    return parsed;
  }

  private async callApi(
    userPrompt: string,
    systemPrompt: string,
    outputInstruction: string,
  ): Promise<string> {
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
          {
            role: "system",
            content: `${systemPrompt}\n\n${outputInstruction}`,
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
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
      throw new Error("Qwen API 未返回有效判定结果");
    }
    return content;
  }
}
