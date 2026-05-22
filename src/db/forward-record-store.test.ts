import { rm } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDatabase } from "./client.js";
import { AccessDeniedError } from "./access-control.js";
import { listForwardRecords, listForwardRecordsForActor } from "./forward-record-store.js";
import { createAccount, createUser } from "./user-store.js";
import { tenantRoot } from "../tenancy/paths.js";
import { SqliteForwardRepository } from "../repositories/sqlite-forward-repository.js";

describe("forward-record-store", () => {
  it("按用户与筛选条件列出记录", async () => {
    const db = createMemoryDatabase();
    const u1 = createUser(db, "u1", "pass1111");
    const u2 = createUser(db, "u2", "pass2222");
    const a1 = createAccount(db, u1.id, "acc1");

    const repo1 = new SqliteForwardRepository(u1.id, db);
    await repo1.markForwarded({
      forwardAccountId: a1.id,
      mid: "m1",
      sourceUid: "111",
      sourceUrl: "https://weibo.com/111/m1",
      comment: "c1",
      myRepostUrl: "https://weibo.com/me/1",
    });
    await repo1.markForwarded({
      forwardAccountId: a1.id,
      mid: "m2",
      sourceUid: "222",
      sourceUrl: "https://weibo.com/222/m2",
      comment: "c2",
      myRepostUrl: "https://weibo.com/me/2",
    });

    const all = listForwardRecords(db, u1.id);
    assert.equal(all.total, 2);

    const filtered = listForwardRecords(db, u1.id, { sourceUid: "111" });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.records[0]!.mid, "m1");

    const other = listForwardRecords(db, u2.id);
    assert.equal(other.total, 0);

    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u1.id);
    const admin = db.prepare("SELECT * FROM users WHERE id = ?").get(u1.id) as import("./types.js").UserRow;
    const allUsers = listForwardRecordsForActor(db, admin, {});
    assert.equal(allUsers.total, 2);

    const u2row = db.prepare("SELECT * FROM users WHERE id = ?").get(u2.id) as import("./types.js").UserRow;
    assert.throws(() => listForwardRecordsForActor(db, u2row, {}, u1.id), (err: unknown) => {
      return err instanceof AccessDeniedError;
    });

    await rm(tenantRoot(u1.id), { recursive: true, force: true }).catch(() => {});
  });
});
