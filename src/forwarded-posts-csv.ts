import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv, serializeCsv } from "./csv-utils.js";
import {
  accountDataDir,
  ensureAccountDataDir,
  forwardedPostsCsvPath,
} from "./paths.js";

const HEADER = ["mid", "source_uid", "source_url", "forwarded_at"];

export async function loadForwardedSourceMids(
  forwardAccountId: string,
  sourceUid: string,
): Promise<Set<string>> {
  await ensureAccountDataDir(forwardAccountId);
  const mids = new Set<string>();
  const csvPath = forwardedPostsCsvPath(forwardAccountId);

  try {
    const rows = parseCsv(await readFile(csvPath, "utf-8"));
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const mid = row[0]?.trim();
      const uid = row[1]?.trim();
      if (mid && uid === sourceUid) mids.add(mid);
    }
  } catch {
    // 文件不存在
  }

  return mids;
}

export async function appendForwardedSourcePostInDir(
  accountDir: string,
  mid: string,
  sourceUid: string,
  sourceUrl: string,
): Promise<void> {
  await mkdir(accountDir, { recursive: true });
  const csvPath = path.join(accountDir, "forwarded-posts.csv");

  let rows: string[][];
  try {
    rows = parseCsv(await readFile(csvPath, "utf-8"));
  } catch {
    rows = [];
  }

  if (rows.length === 0 || rows[0]![0] !== HEADER[0]) {
    rows = [HEADER, ...rows.filter((r) => r[0] !== HEADER[0])];
  }

  const exists = rows.some((r, i) => i > 0 && r[0] === mid && r[1] === sourceUid);
  if (exists) return;

  rows.push([mid, sourceUid, sourceUrl, new Date().toISOString()]);
  await writeFile(csvPath, serializeCsv(rows), "utf-8");
}

export async function appendForwardedSourcePost(
  forwardAccountId: string,
  mid: string,
  sourceUid: string,
  sourceUrl: string,
): Promise<void> {
  await ensureAccountDataDir(forwardAccountId);
  await appendForwardedSourcePostInDir(
    accountDataDir(forwardAccountId),
    mid,
    sourceUid,
    sourceUrl,
  );
}

export function getForwardedPostsCsvPath(forwardAccountId: string): string {
  return forwardedPostsCsvPath(forwardAccountId);
}
