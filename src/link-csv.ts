import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv, serializeCsv } from "./csv-utils.js";
import { accountDataDir, ensureAccountDataDir, myRepostLinksCsvPath } from "./paths.js";

function todayInShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());
}

function padHeader(header: string[], minCols: number): void {
  while (header.length < minCols) {
    header.push(`link${header.length}`);
  }
}

function compactDayRow(row: string[]): string[] {
  const date = row[0] ?? "";
  const links = row.slice(1).filter((cell) => cell !== "");
  return [date, ...links];
}

function appendLinkToDayRow(row: string[], link: string): void {
  const firstEmpty = row.findIndex((cell, i) => i > 0 && cell === "");
  if (firstEmpty !== -1) {
    row[firstEmpty] = link;
    return;
  }
  row.push(link);
}

export async function appendMyRepostLinkInDir(accountDir: string, link: string): Promise<void> {
  await mkdir(accountDir, { recursive: true });
  const csvPath = path.join(accountDir, "my-repost-links.csv");

  let rows: string[][];
  try {
    rows = parseCsv(await readFile(csvPath, "utf-8"));
  } catch {
    rows = [["date"]];
  }

  if (rows.length === 0 || rows[0]![0] !== "date") {
    rows = [["date"], ...rows.filter((r) => r[0] !== "date")];
  }

  const header = rows[0]!;
  const date = todayInShanghai();
  const dayRowIndex = rows.findIndex((row, i) => i > 0 && row[0] === date);

  if (dayRowIndex === -1) {
    rows.push([date, link]);
  } else {
    const dayRow = compactDayRow(rows[dayRowIndex]!);
    appendLinkToDayRow(dayRow, link);
    rows[dayRowIndex] = dayRow;
  }

  const maxCols = Math.max(...rows.map((r) => r.length));
  padHeader(header, maxCols);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    while (row.length < maxCols) {
      row.push("");
    }
  }

  await writeFile(csvPath, serializeCsv(rows), "utf-8");
}

export async function appendMyRepostLink(forwardAccountId: string, link: string): Promise<void> {
  await ensureAccountDataDir(forwardAccountId);
  await appendMyRepostLinkInDir(accountDataDir(forwardAccountId), link);
}

export function getMyRepostLinksCsvPath(forwardAccountId: string): string {
  return myRepostLinksCsvPath(forwardAccountId);
}
