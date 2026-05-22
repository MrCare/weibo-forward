import { rm } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tenantRoot } from "../tenancy/paths.js";
import { createMemoryDatabase } from "./client.js";
import {
  createAccount,
  createRule,
  createUser,
  findUserByApiKey,
  listAllAccounts,
  listEnabledRules,
  resolveAccount,
  verifyUserLogin,
} from "./user-store.js";
import { SqliteForwardRepository } from "../repositories/sqlite-forward-repository.js";

describe("multi-user sqlite", () => {
  it("用户数据隔离", async () => {
    const db = createMemoryDatabase();
    const u1 = createUser(db, "alice", "password1");
    const u2 = createUser(db, "bob", "password2");

    const a1 = createAccount(db, u1.id, "main");
    const a2 = createAccount(db, u2.id, "main");

    createRule(db, u1.id, {
      forwardAccountId: a1.id,
      sourceUid: "111",
      limit: 1,
    });
    createRule(db, u2.id, {
      forwardAccountId: a2.id,
      sourceUid: "222",
      limit: 1,
    });

    assert.equal(listEnabledRules(db, u1.id).length, 1);
    assert.equal(listEnabledRules(db, u2.id)[0]!.source_uid, "222");

    const repo1 = new SqliteForwardRepository(u1.id, db);
    await repo1.markForwarded({
      forwardAccountId: a1.id,
      mid: "m1",
      sourceUid: "111",
      sourceUrl: "https://weibo.com/1/m1",
      comment: "c",
      myRepostUrl: "https://weibo.com/me/m1",
    });

    const repo2 = new SqliteForwardRepository(u2.id, db);
    assert.equal((await repo2.getForwardedMids(a2.id, "111")).size, 0);

    assert.ok(verifyUserLogin(db, "alice", "password1"));
    assert.ok(findUserByApiKey(db, u1.api_key));

    await Promise.all([
      rm(tenantRoot(u1.id), { recursive: true, force: true }).catch(() => {}),
      rm(tenantRoot(u2.id), { recursive: true, force: true }).catch(() => {}),
    ]);
  });

  it("管理员可访问全部账号，普通用户不可跨租户", () => {
    const db = createMemoryDatabase();
    const admin = createUser(db, "adminx", "pass1111");
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);
    const adminRow = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(admin.id) as import("./types.js").UserRow;

    const bob = createUser(db, "bobx", "pass2222");
    const bobAcc = createAccount(db, bob.id, "main");

    assert.equal(listAllAccounts(db).length, 1);
    assert.ok(resolveAccount(db, adminRow, bobAcc.id));
    assert.equal(resolveAccount(db, bob, bobAcc.id)?.id, bobAcc.id);
    assert.equal(resolveAccount(db, bob, "00000000-0000-0000-0000-000000000099"), undefined);
  });
});
