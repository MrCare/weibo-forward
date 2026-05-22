import { readFile, rm } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDatabase } from "../db/client.js";
import { createAccount, createUser } from "../db/user-store.js";
import {
  tenantForwardedPostsCsvPath,
  tenantMyRepostLinksCsvPath,
  tenantRoot,
} from "../tenancy/paths.js";
import { SqliteForwardRepository } from "./sqlite-forward-repository.js";

async function cleanupTenantDirs(...userIds: string[]): Promise<void> {
  await Promise.all(
    userIds.map((id) => rm(tenantRoot(id), { recursive: true, force: true }).catch(() => {})),
  );
}

describe("SqliteForwardRepository", () => {
  it("按 user_id 隔离去重", async () => {
    const db = createMemoryDatabase();
    const u1 = createUser(db, "alice", "password1");
    const u2 = createUser(db, "bob", "password2");

    const repo1 = new SqliteForwardRepository(u1.id, db);
    const repo2 = new SqliteForwardRepository(u2.id, db);

    const a1 = createAccount(db, u1.id, "main");
    const accountId = a1.id;
    const sourceUid = "111";
    const mid = "mid1";

    await repo1.markForwarded({
      forwardAccountId: accountId,
      mid,
      sourceUid,
      sourceUrl: "https://weibo.com/111/mid1",
      comment: "c1",
      myRepostUrl: "https://weibo.com/me/mid1",
    });

    const u1mids = await repo1.getForwardedMids(accountId, sourceUid);
    const u2mids = await repo2.getForwardedMids(accountId, sourceUid);

    assert.equal(u1mids.has(mid), true);
    assert.equal(u2mids.has(mid), false);

    await cleanupTenantDirs(u1.id, u2.id);
  });

  it("同步写入租户目录 CSV", async () => {
    const db = createMemoryDatabase();
    const user = createUser(db, "csv-user", "password1");
    const account = createAccount(db, user.id, "main");
    const repo = new SqliteForwardRepository(user.id, db);

    await repo.markForwarded({
      forwardAccountId: account.id,
      mid: "mid-csv",
      sourceUid: "9143294731",
      sourceUrl: "https://weibo.com/9143294731/mid-csv",
      comment: "测试",
      myRepostUrl: "https://weibo.com/me/repost1",
    });
    await repo.appendMyRepostLink(account.id, "https://weibo.com/me/repost1");

    assert.equal(
      repo.getForwardedPostsCsvPath(account.id),
      tenantForwardedPostsCsvPath(user.id, account.id),
    );
    assert.equal(
      repo.getMyRepostLinksCsvPath(account.id),
      tenantMyRepostLinksCsvPath(user.id, account.id),
    );

    const forwardedCsv = await readFile(repo.getForwardedPostsCsvPath(account.id), "utf-8");
    const linksCsv = await readFile(repo.getMyRepostLinksCsvPath(account.id), "utf-8");
    assert.match(forwardedCsv, /mid-csv/);
    assert.match(linksCsv, /repost1/);

    await cleanupTenantDirs(user.id);
  });
});
