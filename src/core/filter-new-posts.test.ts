import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterNewPosts } from "./filter-new-posts.js";

describe("filterNewPosts", () => {
  const posts = [
    { mid: "1", text: "a", detailUrl: "https://weibo.com/1/1" },
    { mid: "2", text: "b", detailUrl: "https://weibo.com/1/2" },
    { mid: "3", text: "c", detailUrl: "https://weibo.com/1/3" },
  ];

  it("排除已转发并限制条数", () => {
    const forwarded = new Set(["1"]);
    const result = filterNewPosts(posts, forwarded, 1);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.mid, "2");
  });

  it("全部已转发时返回空数组", () => {
    const forwarded = new Set(["1", "2", "3"]);
    assert.deepEqual(filterNewPosts(posts, forwarded, 5), []);
  });
});
