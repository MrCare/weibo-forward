import type { WeiboMediaType, WeiboPost } from "../types.js";

export interface CleanupFilterOptions {
  postTypes: WeiboMediaType[];
  /** 命中任一 tag 时直接删除（条件 1） */
  autoDeleteTags: string[];
  processedMids: Set<string>;
}

/** @deprecated 保留兼容；新逻辑请用 splitCleanupPosts */
export interface LegacyCleanupFilterOptions {
  postTypes: WeiboMediaType[];
  requiredTags: string[];
  processedMids: Set<string>;
}

/** 正文是否包含指定 tag（兼容 #tag、[话题]、纯文本） */
export function textContainsTag(text: string, tag: string): boolean {
  const normalized = tag.replace(/^#/, "").trim();
  if (!normalized) return false;
  if (text.includes(`#${normalized}[话题]`)) return true;
  if (text.includes(`#${normalized}`)) return true;
  return text.includes(normalized);
}

export function textContainsAllTags(text: string, tags: string[]): boolean {
  return tags.every((tag) => textContainsTag(text, tag));
}

export function textContainsAnyTag(text: string, tags: string[]): boolean {
  return tags.some((tag) => textContainsTag(text, tag));
}

function passesMediaFilter(post: WeiboPost, postTypes: WeiboMediaType[]): boolean {
  const mediaType = post.mediaType ?? "unknown";
  if (mediaType === "unknown") return false;
  if (postTypes.length > 0 && !postTypes.includes(mediaType)) return false;
  return true;
}

export function splitCleanupPosts(
  posts: WeiboPost[],
  options: CleanupFilterOptions,
): {
  toDelete: WeiboPost[];
  skippedNoTag: number;
  skippedProcessed: number;
  skippedUnknownMedia: number;
  skippedMediaType: number;
} {
  const { postTypes, autoDeleteTags, processedMids } = options;
  const toDelete: WeiboPost[] = [];
  let skippedNoTag = 0;
  let skippedProcessed = 0;
  let skippedUnknownMedia = 0;
  let skippedMediaType = 0;

  for (const post of posts) {
    if (processedMids.has(post.mid)) {
      skippedProcessed++;
      continue;
    }

    const mediaType = post.mediaType ?? "unknown";
    if (mediaType === "unknown") {
      skippedUnknownMedia++;
      continue;
    }
    if (postTypes.length > 0 && !postTypes.includes(mediaType)) {
      skippedMediaType++;
      continue;
    }

    if (autoDeleteTags.length > 0 && textContainsAnyTag(post.text, autoDeleteTags)) {
      toDelete.push(post);
    } else {
      skippedNoTag++;
    }
  }

  return {
    toDelete,
    skippedNoTag,
    skippedProcessed,
    skippedUnknownMedia,
    skippedMediaType,
  };
}

export function filterCleanupCandidates(
  posts: WeiboPost[],
  options: LegacyCleanupFilterOptions,
): { candidates: WeiboPost[]; skippedUnknownMedia: number; skippedProcessed: number } {
  const { postTypes, requiredTags, processedMids } = options;
  const candidates: WeiboPost[] = [];
  let skippedUnknownMedia = 0;
  let skippedProcessed = 0;

  for (const post of posts) {
    if (processedMids.has(post.mid)) {
      skippedProcessed++;
      continue;
    }

    if (!passesMediaFilter(post, postTypes)) {
      if ((post.mediaType ?? "unknown") === "unknown") skippedUnknownMedia++;
      continue;
    }
    if (requiredTags.length > 0 && !textContainsAllTags(post.text, requiredTags)) {
      continue;
    }

    candidates.push(post);
  }

  return { candidates, skippedUnknownMedia, skippedProcessed };
}
