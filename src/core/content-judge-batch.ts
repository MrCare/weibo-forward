import {
  BATCH_OUTPUT_INSTRUCTION,
  SINGLE_OUTPUT_INSTRUCTION,
  buildBatchCleanupUserPrompt,
  buildCleanupUserPrompt,
  parseBatchContentJudgment,
  parseContentJudgment,
  resolveCleanupLlmBatchSize,
} from "./content-judge-utils.js";
import type { ContentJudgment } from "./interfaces.js";
import type { WeiboPost } from "../types.js";

export async function judgePostsInBatches(
  posts: WeiboPost[],
  _systemPrompt: string,
  invoke: (userPrompt: string, outputInstruction: string) => Promise<string>,
): Promise<Map<string, ContentJudgment>> {
  if (posts.length === 0) return new Map();

  const results = new Map<string, ContentJudgment>();
  const batchSize = resolveCleanupLlmBatchSize();

  for (let offset = 0; offset < posts.length; offset += batchSize) {
    const chunk = posts.slice(offset, offset + batchSize);
    let chunkComplete = false;

    if (chunk.length === 1) {
      await judgeSinglePost(chunk[0]!, invoke, results);
      continue;
    }

    try {
      const userPrompt = buildBatchCleanupUserPrompt(chunk);
      const raw = await invoke(userPrompt, BATCH_OUTPUT_INSTRUCTION);
      const parsed = parseBatchContentJudgment(raw);
      if (parsed) {
        for (const post of chunk) {
          const judgment = parsed.get(post.mid);
          if (judgment) results.set(post.mid, judgment);
        }
        chunkComplete = chunk.every((post) => results.has(post.mid));
      }
    } catch {
      chunkComplete = false;
    }

    if (!chunkComplete) {
      for (const post of chunk) {
        if (results.has(post.mid)) continue;
        await judgeSinglePost(post, invoke, results);
      }
    }
  }

  return results;
}

async function judgeSinglePost(
  post: WeiboPost,
  invoke: (userPrompt: string, outputInstruction: string) => Promise<string>,
  results: Map<string, ContentJudgment>,
): Promise<void> {
  const userPrompt = buildCleanupUserPrompt(post.text, post.mediaType);
  const raw = await invoke(userPrompt, SINGLE_OUTPUT_INSTRUCTION);
  const parsed = parseContentJudgment(raw);
  if (!parsed) {
    throw new Error(`无法解析 LLM 判定结果 mid=${post.mid}: ${raw.slice(0, 200)}`);
  }
  results.set(post.mid, parsed);
}
