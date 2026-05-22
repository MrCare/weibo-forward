import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AccessDeniedError, resolveCreateUserId, resolveListUserId } from "./access-control.js";
import { createMemoryDatabase } from "./client.js";
import { createAccount, createUser, getAccountById, resolveAccount } from "./user-store.js";

describe("access-control", () => {
  it("普通用户不能按他人 userId 列表", () => {
    const db = createMemoryDatabase();
    const alice = createUser(db, "alice", "pass1111");
    const bob = createUser(db, "bob", "pass2222");

    assert.throws(
      () => resolveListUserId(alice, bob.id),
      AccessDeniedError,
    );
    assert.equal(resolveListUserId(alice), alice.id);
  });

  it("管理员可查看任意账号，普通用户只能看自己的", () => {
    const db = createMemoryDatabase();
    const admin = createUser(db, "admin1", "pass1111");
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);
    const refreshedAdmin = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(admin.id) as import("./types.js").UserRow;

    const bob = createUser(db, "bob2", "pass2222");
    const bobAcc = createAccount(db, bob.id, "main");

    assert.ok(resolveAccount(db, refreshedAdmin, bobAcc.id));
    assert.equal(resolveAccount(db, bob, bobAcc.id)?.id, bobAcc.id);
    assert.equal(resolveAccount(db, bob, bobAcc.id)?.user_id, bob.id);

    const otherAcc = getAccountById(db, bobAcc.id)!;
    assert.equal(resolveAccount(db, bob, otherAcc.id)?.id, bobAcc.id);
  });

  it("管理员可为他人创建资源", () => {
    const db = createMemoryDatabase();
    const admin = createUser(db, "admin2", "pass1111");
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);
    const refreshedAdmin = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(admin.id) as import("./types.js").UserRow;

    const bob = createUser(db, "bob3", "pass2222");
    assert.equal(resolveCreateUserId(refreshedAdmin, bob.id), bob.id);
    assert.throws(() => resolveCreateUserId(bob, admin.id), AccessDeniedError);
  });
});
