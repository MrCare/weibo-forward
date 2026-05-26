import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractComment, generateForwardComment } from "./generator.js";

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

describe("generateForwardComment", () => {
  it("自定义 system prompt 不应回退到李白模板 user prompt", async () => {
    const binDir = mkdtempSync(join(tmpdir(), "qwen-bin-"));
    const binPath = join(binDir, "qwen");
    const oldPath = process.env.PATH ?? "";
    writeFileSync(
      binPath,
      `#!/bin/sh
last=""
for arg in "$@"; do
  last="$arg"
done
printf '%s' "$last"
`,
    );
    chmodSync(binPath, 0o755);
    process.env.PATH = `${binDir}:${oldPath}`;

    try {
      const comment = await generateForwardComment(
        "测试微博正文",
        "你是一位普通中文写手，写 1 到 2 句自然转发评语。",
      );
      assert.match(comment, /只输出评语正文/);
      assert.doesNotMatch(comment, /只输出四句七言诗/);
    } finally {
      process.env.PATH = oldPath;
      rmSync(binDir, { recursive: true, force: true });
    }
  });
});
