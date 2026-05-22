import { readFile, writeFile } from "node:fs/promises";
import {
  appendForwardedSourcePost,
  getForwardedPostsCsvPath,
  loadForwardedSourceMids,
} from "../forwarded-posts-csv.js";
import {
  appendMyRepostLink,
  getMyRepostLinksCsvPath,
} from "../link-csv.js";
import { ensureAccountDataDir, forwardedJsonPath } from "../paths.js";
import type { ForwardRecord, ForwardedStore } from "../types.js";
import { DEFAULT_FORWARD_ACCOUNT_ID } from "./constants.js";
import type { ForwardRepository, MarkForwardedInput } from "./interfaces.js";

function recordMatchesAccount(
  record: ForwardRecord,
  forwardAccountId: string,
): boolean {
  return (record.forwardAccountId ?? DEFAULT_FORWARD_ACCOUNT_ID) === forwardAccountId;
}

async function readStore(forwardAccountId: string): Promise<ForwardedStore> {
  await ensureAccountDataDir(forwardAccountId);
  const jsonPath = forwardedJsonPath(forwardAccountId);
  try {
    const raw = await readFile(jsonPath, "utf-8");
    return JSON.parse(raw) as ForwardedStore;
  } catch {
    return { records: [] };
  }
}

async function writeStore(forwardAccountId: string, store: ForwardedStore): Promise<void> {
  await ensureAccountDataDir(forwardAccountId);
  await writeFile(forwardedJsonPath(forwardAccountId), JSON.stringify(store, null, 2), "utf-8");
}

export class FileForwardRepository implements ForwardRepository {
  async getForwardedMids(
    forwardAccountId: string,
    sourceUid: string,
  ): Promise<Set<string>> {
    const fromCsv = await loadForwardedSourceMids(forwardAccountId, sourceUid);
    const store = await readStore(forwardAccountId);
    for (const r of store.records) {
      if (r.sourceUid === sourceUid && recordMatchesAccount(r, forwardAccountId)) {
        fromCsv.add(r.mid);
      }
    }
    return fromCsv;
  }

  async markForwarded(input: MarkForwardedInput): Promise<void> {
    const { forwardAccountId, mid, sourceUid, sourceUrl, comment } = input;

    await appendForwardedSourcePost(forwardAccountId, mid, sourceUid, sourceUrl);

    const store = await readStore(forwardAccountId);
    if (
      store.records.some(
        (r) =>
          r.mid === mid &&
          r.sourceUid === sourceUid &&
          recordMatchesAccount(r, forwardAccountId),
      )
    ) {
      return;
    }

    const record: ForwardRecord = {
      mid,
      sourceUid,
      forwardAccountId,
      comment,
      forwardedAt: new Date().toISOString(),
    };
    store.records.push(record);
    await writeStore(forwardAccountId, store);
  }

  async appendMyRepostLink(forwardAccountId: string, url: string): Promise<void> {
    await appendMyRepostLink(forwardAccountId, url);
  }

  getForwardedPostsCsvPath(forwardAccountId: string): string {
    return getForwardedPostsCsvPath(forwardAccountId);
  }

  getMyRepostLinksCsvPath(forwardAccountId: string): string {
    return getMyRepostLinksCsvPath(forwardAccountId);
  }
}
