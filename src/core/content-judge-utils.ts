import type { ContentJudgment } from "./interfaces.js";
import type { WeiboPost } from "../types.js";

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/i;

export const SINGLE_OUTPUT_INSTRUCTION =
  '你必须只输出 JSON，格式：{"shouldDelete":boolean,"reason":"..."}，不要输出其它文字。';

export const BATCH_OUTPUT_INSTRUCTION =
  '你必须只输出 JSON 数组，每项格式：{"mid":"...","shouldDelete":boolean,"reason":"..."}，不要输出其它文字。';

export function buildCleanupUserPrompt(postText: string, mediaType?: string): string {
  const typeLine = mediaType ? `媒体类型：${mediaType}\n` : "";
  return `${typeLine}微博正文：\n${postText}\n\n请判断该微博是否应当删除，仅输出 JSON。`;
}

export function buildBatchCleanupUserPrompt(posts: WeiboPost[]): string {
  const blocks = posts.map((post, index) => {
    const typeLine = post.mediaType ? `媒体类型：${post.mediaType}\n` : "";
    return `--- ${index + 1}. mid=${post.mid} ---\n${typeLine}微博正文：\n${post.text}`;
  });
  return `请对以下 ${posts.length} 条微博分别判断是否应删除。\n\n${blocks.join("\n\n")}\n\n仅输出 JSON 数组。`;
}

export function resolveCleanupLlmBatchSize(): number {
  const raw = process.env.CLEANUP_LLM_BATCH_SIZE?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  }
  return 20;
}

export function parseContentJudgment(raw: string): ContentJudgment | null {
  let text = raw.trim();
  const block = text.match(JSON_BLOCK_RE);
  if (block?.[1]) text = block[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      shouldDelete?: unknown;
      reason?: unknown;
    };
    if (typeof parsed.shouldDelete !== "boolean") return null;
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : parsed.shouldDelete
          ? "符合删除标准"
          : "不符合删除标准";
    return { shouldDelete: parsed.shouldDelete, reason };
  } catch {
    return null;
  }
}

export function parseBatchContentJudgment(raw: string): Map<string, ContentJudgment> | null {
  let text = raw.trim();
  const block = text.match(JSON_BLOCK_RE);
  if (block?.[1]) text = block[1].trim();

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return null;

    const map = new Map<string, ContentJudgment>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as { mid?: unknown; shouldDelete?: unknown; reason?: unknown };
      if (typeof row.mid !== "string" || typeof row.shouldDelete !== "boolean") continue;
      const reason =
        typeof row.reason === "string" && row.reason.trim()
          ? row.reason.trim()
          : row.shouldDelete
            ? "符合删除标准"
            : "不符合删除标准";
      map.set(row.mid, { shouldDelete: row.shouldDelete, reason });
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}
