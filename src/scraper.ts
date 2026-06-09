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

async function extractPostsFromPage(
  page: Page,
  sourceUid: string,
): Promise<WeiboPost[]> {
  return page.evaluate(
    ({ textSelectors, sourceUid }) => {
      const seen = new Set<string>();
      const results: { mid: string; text: string; detailUrl: string }[] = [];
      const postUrlRe = new RegExp(
        `weibo\\.com\\/${sourceUid}\\/([A-Za-z0-9]+)`,
        "i",
      );
      const cardSelector = '[action-type="feed_list_item"], article';
      const allCards = [
        ...document.querySelectorAll<Element>(cardSelector),
      ];
      const cards = allCards.filter(
        (card) =>
          !allCards.some((other) => other !== card && other.contains(card)),
      );

      for (const card of cards) {
        let mid: string | null = null;
        for (const a of card.querySelectorAll<HTMLAnchorElement>('a[href*="/"]')) {
          const m = a.href.match(postUrlRe);
          if (m) {
            mid = m[1]!;
            break;
          }
        }
        if (!mid || seen.has(mid)) continue;
        seen.add(mid);

        let text = "";
        for (const sel of textSelectors) {
          for (const node of card.querySelectorAll(sel)) {
            const quote = node.closest('[class*="quote"], [class*="Quote"]');
            if (quote && quote !== card) continue;
            const t = node.textContent?.trim();
            if (t) {
              text = t;
              break;
            }
          }
          if (text) break;
        }
        if (!text) {
          const clone = card.cloneNode(true) as HTMLElement;
          clone
            .querySelectorAll(
              '[class*="quote"], [class*="Quote"], a, button, [class*="toolbar"], [class*="action"]',
            )
            .forEach((el) => el.remove());
          text = (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
        }

        results.push({
          mid,
          text: text || "(无正文)",
          detailUrl: `https://weibo.com/${sourceUid}/${mid}`,
        });
      }

      return results;
    },
    { textSelectors: [...SELECTORS.postText], sourceUid },
  );
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
    const batch = await extractPostsFromPage(page, sourceUid);
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
