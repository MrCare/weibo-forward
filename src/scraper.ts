import type { Page } from "playwright";
import type { WeiboPost } from "./types.js";
import { SELECTORS } from "./selectors.js";

const STATUS_URL_RE = /weibo\.com\/\d+\/([A-Za-z0-9]+)/;

export interface ScrapeOptions {
  /** 至少需要找到多少条未转发微博才停止滚动 */
  neededCount?: number;
  forwardedMids?: Set<string>;
  maxScrolls?: number;
}

async function extractPostsFromPage(page: Page): Promise<WeiboPost[]> {
  return page.evaluate((textSelectors) => {
    const seen = new Set<string>();
    const results: { mid: string; text: string; detailUrl: string }[] = [];

    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/"]');
    for (const a of links) {
      const href = a.href;
      const m = href.match(/weibo\.com\/(\d+)\/([A-Za-z0-9]+)/);
      if (!m) continue;

      const mid = m[2]!;
      if (seen.has(mid)) continue;
      seen.add(mid);

      let card: Element | null = a;
      for (let up = 0; up < 8 && card; up++) {
        card = card.parentElement;
        if (card?.getAttribute("action-type") === "feed_list_item") break;
        if (card?.tagName === "ARTICLE") break;
      }

      let text = "";
      const root = card ?? a.closest("article") ?? a.parentElement?.parentElement;
      if (root) {
        for (const sel of textSelectors) {
          const node = root.querySelector(sel);
          if (node?.textContent?.trim()) {
            text = node.textContent.trim();
            break;
          }
        }
        if (!text) {
          const clone = root.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll("a, button, [class*='toolbar'], [class*='action']")
            .forEach((el) => el.remove());
          text = (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
        }
      }

      results.push({
        mid,
        text: text || "(无正文)",
        detailUrl: `https://weibo.com/${m[1]}/${mid}`,
      });
    }

    return results;
  }, [...SELECTORS.postText]);
}

function mergePosts(existing: WeiboPost[], batch: WeiboPost[]): WeiboPost[] {
  const mids = new Set(existing.map((p) => p.mid));
  const merged = [...existing];
  for (const p of batch) {
    if (!mids.has(p.mid)) {
      mids.add(p.mid);
      merged.push(p);
    }
  }
  return merged;
}

/**
 * 抓取源账号时间线；若最新几条已转发，则继续向下滚动查找未转发的微博。
 */
export async function scrapeSourceTimeline(
  page: Page,
  sourceUid: string,
  options: ScrapeOptions = {},
): Promise<WeiboPost[]> {
  const {
    neededCount = 1,
    forwardedMids = new Set(),
    maxScrolls = 10,
  } = options;

  const url = `https://weibo.com/u/${sourceUid}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  let allPosts: WeiboPost[] = [];

  for (let scroll = 0; scroll <= maxScrolls; scroll++) {
    const batch = await extractPostsFromPage(page);
    allPosts = mergePosts(allPosts, batch);

    const unforwarded = allPosts.filter((p) => !forwardedMids.has(p.mid));
    if (unforwarded.length >= neededCount) break;

    if (scroll < maxScrolls) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await page.waitForTimeout(1500);
    }
  }

  return allPosts;
}

export function parseMidFromUrl(url: string): string | null {
  const m = url.match(STATUS_URL_RE);
  return m?.[1] ?? null;
}
