import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveCommentGeneratorMode } from "./comment-generator-factory.js";

describe("resolveCommentGeneratorMode", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.COMMENT_GENERATOR;
    delete process.env.QWEN_API_KEY;
  });

  afterEach(() => {
    process.env = env;
  });

  it("有 QWEN_API_KEY 时默认 api", () => {
    process.env.QWEN_API_KEY = "sk-test";
    assert.equal(resolveCommentGeneratorMode(), "api");
  });

  it("无 key 时默认 cli", () => {
    assert.equal(resolveCommentGeneratorMode(), "cli");
  });

  it("COMMENT_GENERATOR=cli 强制 cli", () => {
    process.env.QWEN_API_KEY = "sk-test";
    process.env.COMMENT_GENERATOR = "cli";
    assert.equal(resolveCommentGeneratorMode(), "cli");
  });
});
