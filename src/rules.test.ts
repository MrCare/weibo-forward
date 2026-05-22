import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  findRule,
  listEnabledRules,
  loadRulesFile,
  resolveAccountStorageState,
} from "./rules.js";

describe("loadRulesFile", () => {
  it("解析并校验规则引用", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rules-test-"));
    const filePath = path.join(dir, "rules.yaml");
    await writeFile(
      filePath,
      `
accounts:
  - id: acc-a
rules:
  - id: r1
    forwardAccountId: acc-a
    sourceUid: "111"
    limit: 2
  - id: r2
    forwardAccountId: acc-a
    sourceUid: "222"
    limit: 1
    enabled: false
`,
      "utf-8",
    );

    const rules = await loadRulesFile(filePath);
    assert.equal(rules.accounts.length, 1);
    assert.equal(findRule(rules, "r1").sourceUid, "111");
    assert.equal(listEnabledRules(rules).length, 1);

    const storage = resolveAccountStorageState(rules.accounts[0]!);
    assert.ok(storage.includes("accounts/acc-a/storageState.json"));
  });

  it("未知 forwardAccountId 时报错", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rules-test-"));
    const filePath = path.join(dir, "rules.yaml");
    await writeFile(
      filePath,
      `
accounts:
  - id: acc-a
rules:
  - id: r1
    forwardAccountId: missing
    sourceUid: "111"
    limit: 1
`,
      "utf-8",
    );

    await assert.rejects(() => loadRulesFile(filePath), /未知账号/);
  });
});
