import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractComment } from "./generator.js";

describe("extractComment", () => {
  it("保留四句诗的全部行，而不是只取最后一行", () => {
    const stdout = [
      "春风得意马蹄疾",
      "一日看尽长安花",
      "天生我材必有用",
      "千金散尽还复来",
    ].join("\n");

    assert.equal(
      extractComment(stdout),
      "春风得意马蹄疾\n一日看尽长安花\n天生我材必有用\n千金散尽还复来",
    );
  });

  it("去掉末尾 qwen 日志行", () => {
    const stdout = ["第一句七言诗啊", "第二句七言诗啊", "tokens: 42"].join("\n");

    assert.equal(extractComment(stdout), "第一句七言诗啊\n第二句七言诗啊");
  });

  it("单行输出保持不变", () => {
    assert.equal(extractComment("单行评语测试\n"), "单行评语测试");
  });
});
