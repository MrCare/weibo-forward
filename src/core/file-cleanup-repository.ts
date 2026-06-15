import { appendFile, readFile } from "node:fs/promises";
import { ensureAccountDataDir, cleanupJudgmentsJsonlPath, cleanupRecordsCsvPath } from "../paths.js";
import type {
  CleanupJudgmentRecord,
  CleanupRepository,
  MarkCleanupInput,
  SaveCleanupJudgmentInput,
} from "./interfaces.js";

const CSV_HEADER = "mid,detail_url,judge_reason,deleted_at,dry_run\n";

async function readProcessedMidsFromCsv(forwardAccountId: string): Promise<Set<string>> {
  const path = cleanupRecordsCsvPath(forwardAccountId);
  try {
    const raw = await readFile(path, "utf-8");
    const mids = new Set<string>();
    for (const line of raw.split("\n").slice(1)) {
      const mid = line.split(",")[0]?.trim();
      if (mid) mids.add(mid);
    }
    return mids;
  } catch {
    return new Set();
  }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseJudgmentLine(
  line: string,
  ruleFingerprint: string,
): CleanupJudgmentRecord | null {
  const parts = line.split("\t");
  if (parts.length < 4) return null;
  const [mid, fp, shouldDelete, reason] = parts;
  if (!mid || fp !== ruleFingerprint) return null;
  return {
    shouldDelete: shouldDelete === "1",
    reason: reason ?? "",
    ruleFingerprint: fp,
  };
}

export class FileCleanupRepository implements CleanupRepository {
  constructor(private readonly forwardAccountId: string) {}

  async getProcessedMids(forwardAccountId: string): Promise<Set<string>> {
    return readProcessedMidsFromCsv(forwardAccountId);
  }

  async markProcessed(input: MarkCleanupInput): Promise<void> {
    await ensureAccountDataDir(input.forwardAccountId);
    const path = cleanupRecordsCsvPath(input.forwardAccountId);
    let needsHeader = false;
    try {
      await readFile(path, "utf-8");
    } catch {
      needsHeader = true;
    }

    const row = [
      csvEscape(input.mid),
      csvEscape(input.detailUrl),
      csvEscape(input.judgeReason),
      csvEscape(new Date().toISOString()),
      input.dryRun ? "1" : "0",
    ].join(",");

    await appendFile(path, (needsHeader ? CSV_HEADER : "") + row + "\n", "utf-8");
  }

  async getJudgment(
    ruleId: string,
    mid: string,
    ruleFingerprint: string,
  ): Promise<CleanupJudgmentRecord | null> {
    const path = cleanupJudgmentsJsonlPath(this.forwardAccountId, ruleId);
    try {
      const raw = await readFile(path, "utf-8");
      let latest: CleanupJudgmentRecord | null = null;
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\t");
        if (parts[0] !== mid) continue;
        const parsed = parseJudgmentLine(line, ruleFingerprint);
        if (parsed) latest = parsed;
      }
      return latest;
    } catch {
      return null;
    }
  }

  async saveJudgment(input: SaveCleanupJudgmentInput): Promise<void> {
    await ensureAccountDataDir(this.forwardAccountId);
    const path = cleanupJudgmentsJsonlPath(this.forwardAccountId, input.ruleId);
    const row = [
      input.mid,
      input.ruleFingerprint,
      input.shouldDelete ? "1" : "0",
      input.reason.replace(/\t/g, " "),
    ].join("\t");
    await appendFile(path, row + "\n", "utf-8");
  }
}
