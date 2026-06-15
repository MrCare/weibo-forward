import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  findCleanupRule,
  listEnabledCleanupRules,
  loadCleanupRulesFromFile,
} from "./cleanup-rules.js";

describe("cleanup-rules", () => {
  it("解析 cleanupRules 段", async () => {
    const dir = path.join(os.tmpdir(), `cleanup-rules-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "rules.yaml");
    await writeFile(
      filePath,
      `
accounts:
  - id: my-main
cleanupRules:
  - id: video-dreame-yuhao
    accountId: my-main
    enabled: true
    since: "2025-05-01"
    postTypes: [video]
    requiredTags: ["追觅", "俞浩"]
    judgeProfile: dreame-video-negative
`,
      "utf-8",
    );

    const { cleanupRules, accounts } = await loadCleanupRulesFromFile(filePath);
    assert.equal(cleanupRules.length, 1);
    assert.equal(cleanupRules[0]!.forwardAccountId, "my-main");
    assert.deepEqual(cleanupRules[0]!.requiredTags, ["追觅", "俞浩"]);
    assert.ok(accounts.has("my-main"));

    const rule = findCleanupRule(cleanupRules, "video-dreame-yuhao");
    assert.equal(rule.since, "2025-05-01");
    assert.equal(listEnabledCleanupRules(cleanupRules).length, 1);

    await rm(dir, { recursive: true, force: true });
  });
});
