import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BrowserContext } from "playwright";
import { DefaultJobRunner } from "./job-runner.js";
import type {
  CommentGenerator,
  ForwardRepository,
  WeiboClient,
} from "./interfaces.js";
import type { WeiboPost } from "../types.js";

const samplePost: WeiboPost = {
  mid: "abc",
  text: "hello",
  detailUrl: "https://weibo.com/1/abc",
};

function createMocks() {
  const marked: unknown[] = [];
  const links: string[] = [];

  const weiboClient: WeiboClient = {
    async loginInteractive() {},
    async withSession(_headless, fn) {
      const context = {
        newPage: async () => ({ close: async () => {} }),
      } as unknown as BrowserContext;
      return fn(context);
    },
    async scrapeTimeline() {
      return [samplePost];
    },
    async repost() {
      return "https://weibo.com/me/xyz";
    },
    async scrapeMyTimeline() {
      return [];
    },
    async scrapeMyTimelineByDateRange() {
      return [];
    },
    async deletePost() {},
  };

  const commentGenerator: CommentGenerator = {
    async generate() {
      return "测试评语";
    },
  };

  const forwardRepository: ForwardRepository = {
    async getForwardedMids() {
      return new Set();
    },
    async markForwarded(input) {
      marked.push(input);
    },
    async appendMyRepostLink(_accountId, url) {
      links.push(url);
    },
    getForwardedPostsCsvPath: () => "/tmp/forwarded.csv",
    getMyRepostLinksCsvPath: () => "/tmp/links.csv",
  };

  return { marked, links, weiboClient, commentGenerator, forwardRepository };
}

describe("DefaultJobRunner", () => {
  it("dry-run 不写记录", async () => {
    const { marked, links, weiboClient, commentGenerator, forwardRepository } =
      createMocks();
    const runner = new DefaultJobRunner({
      weiboClient,
      commentGenerator,
      forwardRepository,
    });

    const result = await runner.run({
      forwardAccountId: "default",
      sourceUid: "111",
      limit: 1,
      dryRun: true,
      headless: true,
    });

    assert.equal(result.processed, 1);
    assert.equal(result.forwarded, 0);
    assert.equal(marked.length, 0);
    assert.equal(links.length, 0);
  });

  it("正常转发会写入记录", async () => {
    const { marked, links, weiboClient, commentGenerator, forwardRepository } =
      createMocks();
    const runner = new DefaultJobRunner({
      weiboClient,
      commentGenerator,
      forwardRepository,
    });

    const result = await runner.run({
      forwardAccountId: "default",
      sourceUid: "111",
      limit: 1,
      dryRun: false,
      headless: true,
    });

    assert.equal(result.forwarded, 1);
    assert.equal(marked.length, 1);
    assert.deepEqual(marked[0], {
      forwardAccountId: "default",
      mid: "abc",
      sourceUid: "111",
      sourceUrl: "https://weibo.com/1/abc",
      comment: "测试评语",
      myRepostUrl: "https://weibo.com/me/xyz",
    });
    assert.equal(links.length, 1);
    assert.equal(links[0], "https://weibo.com/me/xyz");
  });
});
