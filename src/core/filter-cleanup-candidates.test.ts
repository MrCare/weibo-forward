import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterCleanupCandidates,
  splitCleanupPosts,
  textContainsAllTags,
  textContainsAnyTag,
  textContainsTag,
} from "./filter-cleanup-candidates.js";
import type { WeiboPost } from "../types.js";

const basePost: WeiboPost = {
  mid: "1",
  text: "测试 #追觅[话题]# 和 #俞浩 视频内容",
  detailUrl: "https://weibo.com/1/abc",
  mediaType: "video",
};

describe("textContainsTag", () => {
  it("匹配 #tag 与纯文本", () => {
    assert.equal(textContainsTag("#追觅[话题]# 内容", "追觅"), true);
    assert.equal(textContainsTag("关于俞浩的发言", "俞浩"), true);
    assert.equal(textContainsTag("无关内容", "追觅"), false);
  });
});

describe("textContainsAnyTag", () => {
  it("任一 tag 命中", () => {
    assert.equal(textContainsAnyTag("只有 #追觅", ["追觅", "俞浩"]), true);
    assert.equal(textContainsAnyTag("无关", ["追觅", "俞浩"]), false);
  });
});

describe("splitCleanupPosts", () => {
  it("tag 命中进 toDelete，未命中跳过", () => {
    const posts: WeiboPost[] = [
      basePost,
      { ...basePost, mid: "2", text: "只有 #追觅 的内容" },
      { ...basePost, mid: "3", text: "普通日常分享" },
    ];
    const { toDelete, skippedNoTag } = splitCleanupPosts(posts, {
      postTypes: [],
      autoDeleteTags: ["追觅", "俞浩"],
      processedMids: new Set(),
    });
    assert.equal(toDelete.length, 2);
    assert.equal(skippedNoTag, 1);
  });
});

describe("filterCleanupCandidates", () => {
  it("legacy：要求全部 tag 且匹配 postTypes", () => {
    const posts: WeiboPost[] = [
      basePost,
      { ...basePost, mid: "2", mediaType: "image" },
      { ...basePost, mid: "3", text: "只有追觅" },
    ];
    const { candidates } = filterCleanupCandidates(posts, {
      postTypes: ["video"],
      requiredTags: ["追觅", "俞浩"],
      processedMids: new Set(),
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]!.mid, "1");
  });

  it("跳过已处理 mid", () => {
    const { candidates, skippedProcessed } = filterCleanupCandidates([basePost], {
      postTypes: ["video"],
      requiredTags: ["追觅", "俞浩"],
      processedMids: new Set(["1"]),
    });
    assert.equal(candidates.length, 0);
    assert.equal(skippedProcessed, 1);
  });

  it("textContainsAllTags 辅助", () => {
    assert.equal(textContainsAllTags(basePost.text, ["追觅", "俞浩"]), true);
  });
});
