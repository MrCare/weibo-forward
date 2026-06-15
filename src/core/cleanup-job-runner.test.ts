import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BrowserContext } from "playwright";
import { DefaultCleanupJobRunner } from "./cleanup-job-runner.js";
import type { CleanupRepository, WeiboClient } from "./interfaces.js";
import type { WeiboPost, WeiboMediaType } from "../types.js";

const taggedPost: WeiboPost = {
  mid: "tagged",
  text: "#追觅 娱乐八卦",
  detailUrl: "https://weibo.com/1/tagged",
  mediaType: "video",
};

const plainPost: WeiboPost = {
  mid: "plain",
  text: "普通日常吐槽",
  detailUrl: "https://weibo.com/1/plain",
  mediaType: "text",
};

const baseInput = {
  forwardAccountId: "default",
  since: "2025-05-01",
  until: "2025-06-15",
  postTypes: [] as WeiboMediaType[],
  requiredTags: ["追觅", "俞浩"],
  dryRun: true,
  headless: true,
};

function createMocks() {
  const marked: unknown[] = [];
  const stats = { deleteCalls: 0 };

  const mockPage = {
    url: () => "about:blank",
    goto: async () => {},
    close: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => "123456",
  };

  const weiboClient: WeiboClient = {
    async loginInteractive() {},
    async withSession(_headless, fn) {
      const context = {
        newPage: async () => mockPage,
      } as unknown as BrowserContext;
      return fn(context);
    },
    async scrapeTimeline() {
      return [];
    },
    async repost() {
      return "";
    },
    async scrapeMyTimeline() {
      return [taggedPost, plainPost];
    },
    async scrapeMyTimelineByDateRange() {
      return [taggedPost, plainPost];
    },
    async deletePost() {
      stats.deleteCalls++;
    },
  };

  const cleanupRepository: CleanupRepository = {
    async getProcessedMids() {
      return new Set();
    },
    async markProcessed(input) {
      marked.push(input);
    },
    async getJudgment() {
      return null;
    },
    async saveJudgment() {},
  };

  return { marked, stats, weiboClient, cleanupRepository };
}

describe("DefaultCleanupJobRunner", () => {
  it("tag 命中则删除", async () => {
    const { stats, weiboClient, cleanupRepository } = createMocks();
    weiboClient.scrapeMyTimelineByDateRange = async () => [taggedPost];
    const runner = new DefaultCleanupJobRunner({ weiboClient, cleanupRepository });

    const result = await runner.run({ ...baseInput, dryRun: true });

    assert.equal(result.deleted, 1);
    assert.equal(stats.deleteCalls, 0);
  });

  it("未命中 tag 不删除", async () => {
    const { stats, weiboClient, cleanupRepository } = createMocks();
    weiboClient.scrapeMyTimelineByDateRange = async () => [plainPost];
    const runner = new DefaultCleanupJobRunner({ weiboClient, cleanupRepository });

    const result = await runner.run({ ...baseInput, dryRun: false });

    assert.equal(result.deleted, 0);
    assert.equal(stats.deleteCalls, 0);
    assert.ok(result.skipped >= 1);
  });

  it("混合列表只删 tag 命中", async () => {
    const { stats, weiboClient, cleanupRepository } = createMocks();
    const runner = new DefaultCleanupJobRunner({ weiboClient, cleanupRepository });

    const result = await runner.run({ ...baseInput, dryRun: true });

    assert.equal(result.deleted, 1);
    assert.equal(stats.deleteCalls, 0);
  });
});
