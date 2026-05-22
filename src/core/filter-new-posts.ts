import type { WeiboPost } from "../types.js";

/** 从时间线结果中筛出未转发过的，取前 limit 条（时间线从新到旧） */
export function filterNewPosts(
  posts: WeiboPost[],
  forwardedMids: Set<string>,
  limit: number,
): WeiboPost[] {
  return posts.filter((p) => !forwardedMids.has(p.mid)).slice(0, limit);
}
