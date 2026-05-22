import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  appendForwardedSourcePost,
  loadForwardedSourceMids,
} from "./forwarded-posts-csv.js";
import { DEFAULT_FORWARD_ACCOUNT_ID } from "./core/constants.js";
import { filterNewPosts as filterNewPostsCore } from "./core/filter-new-posts.js";
import { DATA_DIR, ensureDataDir } from "./paths.js";
import type { ForwardRecord, ForwardedStore, WeiboPost } from "./types.js";

const FORWARDED_PATH = path.join(DATA_DIR, "forwarded.json");

export { DATA_DIR, ensureDataDir };

async function readStore(): Promise<ForwardedStore> {
  await ensureDataDir();
  try {
    const raw = await readFile(FORWARDED_PATH, "utf-8");
    return JSON.parse(raw) as ForwardedStore;
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: ForwardedStore): Promise<void> {
  await ensureDataDir();
  await writeFile(FORWARDED_PATH, JSON.stringify(store, null, 2), "utf-8");
}

/** 合并 JSON 与 CSV 中已转发的源微博 mid */
export async function getForwardedMids(sourceUid: string): Promise<Set<string>> {
  const fromCsv = await loadForwardedSourceMids(DEFAULT_FORWARD_ACCOUNT_ID, sourceUid);
  const store = await readStore();
  for (const r of store.records) {
    if (r.sourceUid === sourceUid) fromCsv.add(r.mid);
  }
  return fromCsv;
}

export async function isForwarded(mid: string, sourceUid: string): Promise<boolean> {
  const mids = await getForwardedMids(sourceUid);
  return mids.has(mid);
}

/** 从时间线结果中筛出未转发过的，取前 limit 条（时间线从新到旧） */
/** @deprecated 使用 core/filter-new-posts */
export async function filterNewPosts(
  posts: WeiboPost[],
  sourceUid: string,
  limit: number,
): Promise<WeiboPost[]> {
  const forwardedMids = await getForwardedMids(sourceUid);
  return filterNewPostsCore(posts, forwardedMids, limit);
}

export async function markForwarded(
  mid: string,
  sourceUid: string,
  sourceUrl: string,
  comment: string,
): Promise<void> {
  await appendForwardedSourcePost(DEFAULT_FORWARD_ACCOUNT_ID, mid, sourceUid, sourceUrl);

  const store = await readStore();
  if (store.records.some((r) => r.mid === mid && r.sourceUid === sourceUid)) return;

  const record: ForwardRecord = {
    mid,
    sourceUid,
    forwardAccountId: DEFAULT_FORWARD_ACCOUNT_ID,
    comment,
    forwardedAt: new Date().toISOString(),
  };
  store.records.push(record);
  await writeStore(store);
}
