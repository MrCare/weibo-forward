import type Database from "better-sqlite3";
import type { ForwardRepository, MarkForwardedInput } from "../core/interfaces.js";
import { appendForwardedSourcePostInDir } from "../forwarded-posts-csv.js";
import { appendMyRepostLinkInDir } from "../link-csv.js";
import {
  ensureTenantAccountDir,
  tenantAccountDir,
  tenantForwardedPostsCsvPath,
  tenantMyRepostLinksCsvPath,
} from "../tenancy/paths.js";

function todayInShanghai(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());
}

/**
 * 多用户模式下的转发记录仓库，所有读写强制带 user_id。
 * SQLite 为主存储，并同步写入租户目录下的 CSV（与 CLI 模式文件格式一致）。
 */
export class SqliteForwardRepository implements ForwardRepository {
  constructor(
    private readonly userId: string,
    private readonly db: Database.Database,
  ) {}

  private accountDir(forwardAccountId: string): string {
    return tenantAccountDir(this.userId, forwardAccountId);
  }

  async getForwardedMids(
    forwardAccountId: string,
    sourceUid: string,
  ): Promise<Set<string>> {
    const rows = this.db
      .prepare(
        `SELECT mid FROM forward_records
         WHERE user_id = ? AND forward_account_id = ? AND source_uid = ?`,
      )
      .all(this.userId, forwardAccountId, sourceUid) as { mid: string }[];

    return new Set(rows.map((r) => r.mid));
  }

  async markForwarded(input: MarkForwardedInput): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO forward_records
          (user_id, forward_account_id, source_uid, mid, source_url, comment, my_repost_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(forward_account_id, source_uid, mid) DO UPDATE SET
           comment = excluded.comment,
           my_repost_url = excluded.my_repost_url`,
      )
      .run(
        this.userId,
        input.forwardAccountId,
        input.sourceUid,
        input.mid,
        input.sourceUrl,
        input.comment,
        input.myRepostUrl,
      );

    await ensureTenantAccountDir(this.userId, input.forwardAccountId);
    await appendForwardedSourcePostInDir(
      this.accountDir(input.forwardAccountId),
      input.mid,
      input.sourceUid,
      input.sourceUrl,
    );
  }

  async appendMyRepostLink(forwardAccountId: string, url: string): Promise<void> {
    const linkDate = todayInShanghai();
    this.db
      .prepare(
        `INSERT INTO repost_links (user_id, forward_account_id, link, link_date)
         VALUES (?, ?, ?, ?)`,
      )
      .run(this.userId, forwardAccountId, url, linkDate);

    await ensureTenantAccountDir(this.userId, forwardAccountId);
    await appendMyRepostLinkInDir(this.accountDir(forwardAccountId), url);
  }

  getForwardedPostsCsvPath(forwardAccountId: string): string {
    return tenantForwardedPostsCsvPath(this.userId, forwardAccountId);
  }

  getMyRepostLinksCsvPath(forwardAccountId: string): string {
    return tenantMyRepostLinksCsvPath(this.userId, forwardAccountId);
  }

  /** 供 API 展示数据目录（登录态等） */
  getAccountDataDir(forwardAccountId: string): string {
    return tenantAccountDir(this.userId, forwardAccountId);
  }
}
