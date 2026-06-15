import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBatchContentJudgment, parseContentJudgment } from "./content-judge-utils.js";

describe("parseContentJudgment", () => {
  it("解析纯 JSON", () => {
    const result = parseContentJudgment('{"shouldDelete":true,"reason":"非正向内容"}');
    assert.deepEqual(result, { shouldDelete: true, reason: "非正向内容" });
  });

  it("解析 markdown 代码块", () => {
    const result = parseContentJudgment(
      '```json\n{"shouldDelete":false,"reason":"产品展示"}\n```',
    );
    assert.deepEqual(result, { shouldDelete: false, reason: "产品展示" });
  });

  it("无效 JSON 返回 null", () => {
    assert.equal(parseContentJudgment("不是 JSON"), null);
    assert.equal(parseContentJudgment('{"reason":"缺字段"}'), null);
  });
});

describe("parseBatchContentJudgment", () => {
  it("解析 JSON 数组", () => {
    const raw = `[{"mid":"a","shouldDelete":true,"reason":"删"},{"mid":"b","shouldDelete":false,"reason":"留"}]`;
    const map = parseBatchContentJudgment(raw);
    assert.ok(map);
    assert.equal(map!.size, 2);
    assert.deepEqual(map!.get("a"), { shouldDelete: true, reason: "删" });
    assert.deepEqual(map!.get("b"), { shouldDelete: false, reason: "留" });
  });

  it("解析 markdown 代码块中的数组", () => {
    const raw =
      '```json\n[{"mid":"x","shouldDelete":false,"reason":"ok"}]\n```';
    const map = parseBatchContentJudgment(raw);
    assert.deepEqual(map!.get("x"), { shouldDelete: false, reason: "ok" });
  });
});
