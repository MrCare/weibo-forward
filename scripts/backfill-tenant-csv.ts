/**
 * 将 SQLite 中的转发记录回填到租户 CSV。
 * 用法: npx tsx scripts/backfill-tenant-csv.ts [userId]
 */
import { closeDatabase, getDatabase } from "../src/db/client.js";
import { appendForwardedSourcePostInDir } from "../src/forwarded-posts-csv.js";
import { appendMyRepostLinkInDir } from "../src/link-csv.js";
import { ensureTenantAccountDir, tenantAccountDir } from "../src/tenancy/paths.js";

const userId = process.argv[2];
const db = getDatabase();

const users = userId
  ? [{ id: userId }]
  : (db.prepare("SELECT id FROM users").all() as { id: string }[]);

for (const { id: uid } of users) {
  const records = db
    .prepare(
      `SELECT forward_account_id, source_uid, mid, source_url
       FROM forward_records WHERE user_id = ? ORDER BY forwarded_at`,
    )
    .all(uid) as {
    forward_account_id: string;
    source_uid: string;
    mid: string;
    source_url: string;
  }[];

  const links = db
    .prepare(
      `SELECT forward_account_id, link FROM repost_links
       WHERE user_id = ? ORDER BY link_date, rowid`,
    )
    .all(uid) as { forward_account_id: string; link: string }[];

  const byAccount = new Set([
    ...records.map((r) => r.forward_account_id),
    ...links.map((l) => l.forward_account_id),
  ]);

  for (const accountId of byAccount) {
    await ensureTenantAccountDir(uid, accountId);
    const dir = tenantAccountDir(uid, accountId);

    for (const r of records.filter((x) => x.forward_account_id === accountId)) {
      await appendForwardedSourcePostInDir(dir, r.mid, r.source_uid, r.source_url);
    }
    for (const l of links.filter((x) => x.forward_account_id === accountId)) {
      await appendMyRepostLinkInDir(dir, l.link);
    }

    console.log(
      `用户 ${uid} 账号 ${accountId}: ${records.filter((r) => r.forward_account_id === accountId).length} 条源博, ${links.filter((l) => l.forward_account_id === accountId).length} 条链接 -> ${dir}`,
    );
  }
}

closeDatabase();
console.log("回填完成。");
