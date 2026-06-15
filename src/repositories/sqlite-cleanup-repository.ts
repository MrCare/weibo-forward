import type Database from "better-sqlite3";
import type {
  CleanupJudgmentRecord,
  CleanupRepository,
  MarkCleanupInput,
  SaveCleanupJudgmentInput,
} from "../core/interfaces.js";
import {
  getCleanupJudgment,
  getProcessedCleanupMids,
  insertCleanupRecord,
  upsertCleanupJudgment,
} from "../db/cleanup-store.js";

export class SqliteCleanupRepository implements CleanupRepository {
  constructor(
    private readonly userId: string,
    private readonly db: Database.Database,
  ) {}

  async getProcessedMids(forwardAccountId: string): Promise<Set<string>> {
    return getProcessedCleanupMids(this.db, forwardAccountId);
  }

  async markProcessed(input: MarkCleanupInput): Promise<void> {
    insertCleanupRecord(this.db, {
      userId: this.userId,
      forwardAccountId: input.forwardAccountId,
      mid: input.mid,
      detailUrl: input.detailUrl,
      judgeReason: input.judgeReason,
      dryRun: input.dryRun,
    });
  }

  async getJudgment(
    ruleId: string,
    mid: string,
    ruleFingerprint: string,
  ): Promise<CleanupJudgmentRecord | null> {
    return getCleanupJudgment(this.db, ruleId, mid, ruleFingerprint);
  }

  async saveJudgment(input: SaveCleanupJudgmentInput): Promise<void> {
    upsertCleanupJudgment(this.db, input);
  }
}
