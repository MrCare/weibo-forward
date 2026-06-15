import { judgePostsInBatches } from "./content-judge-batch.js";
import {
  buildCleanupUserPrompt,
  parseContentJudgment,
  SINGLE_OUTPUT_INSTRUCTION,
} from "./content-judge-utils.js";
import type { ContentJudge, ContentJudgment } from "./interfaces.js";
import type { WeiboPost } from "../types.js";
import { generateForwardComment } from "../generator.js";

export class QwenCliContentJudge implements ContentJudge {
  async judgeBatch(
    posts: WeiboPost[],
    systemPrompt: string,
  ): Promise<Map<string, ContentJudgment>> {
    return judgePostsInBatches(posts, systemPrompt, (userPrompt, outputInstruction) =>
      this.callCli(userPrompt, systemPrompt, outputInstruction),
    );
  }

  async judge(post: WeiboPost, systemPrompt: string): Promise<ContentJudgment> {
    const userPrompt = buildCleanupUserPrompt(post.text, post.mediaType);
    const raw = await this.callCli(userPrompt, systemPrompt, SINGLE_OUTPUT_INSTRUCTION);
    const parsed = parseContentJudgment(raw);
    if (!parsed) {
      throw new Error(`无法解析 LLM 判定结果: ${raw.slice(0, 200)}`);
    }
    return parsed;
  }

  private callCli(
    userPrompt: string,
    systemPrompt: string,
    outputInstruction: string,
  ): Promise<string> {
    return generateForwardComment(userPrompt, `${systemPrompt}\n\n${outputInstruction}`);
  }
}
