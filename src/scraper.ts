import type { Page } from "playwright";
import type { WeiboMediaType, WeiboPost } from "./types.js";
import { SELECTORS } from "./selectors.js";
import { weiboMidToIsoDate } from "./weibo-mid-time.js";

const STATUS_URL_RE = /weibo\.com\/\d+\/([A-Za-z0-9]+)/;

export interface ScrapeOptions {
  /** 至少需要找到多少条未转发微博才停止滚动 */
  neededCount?: number;
  forwardedMids?: Set<string>;
  maxScrolls?: number;
}

export interface ScrapeByDateOptions {
  sinceMs: number;
  untilMs: number;
  maxScrolls?: number;
}

async function extractPostsFromPage(
  page: Page,
  sourceUid: string,
): Promise<WeiboPost[]> {
  const raw = await page.evaluate(
    ({ textSelectors, sourceUid, videoSelectors }) => {
      const seen = new Set();
      const results = [];
      const postUrlRe = new RegExp(
        `weibo\\.com\\/${sourceUid}\\/([A-Za-z0-9]+)`,
        "i",
      );
      const cardSelector = '[action-type="feed_list_item"], article';
      const allCards = [...document.querySelectorAll(cardSelector)];
      const cards = allCards.filter(
        (card) =>
          !allCards.some((other) => other !== card && other.contains(card)),
      );

      for (const card of cards) {
        let mid = null;
        for (const a of card.querySelectorAll("a[href]")) {
          const href = (a as HTMLAnchorElement).href;
          const m = href.match(postUrlRe);
          if (m) {
            mid = m[1];
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
            .forEach((el: Element) => el.remove());
          text = (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
        }

        let mediaType = "text";
        for (let i = 0; i < videoSelectors.length; i++) {
          if (card.querySelector(videoSelectors[i])) {
            mediaType = "video";
            break;
          }
        }
        if (mediaType === "text") {
          const imgs = card.querySelectorAll("img[src]");
          for (let i = 0; i < imgs.length; i++) {
            const src = (imgs[i] as HTMLImageElement).src ?? "";
            if (src.includes("large") || src.includes("orj360") || src.includes("thumb")) {
              mediaType = "image";
              break;
            }
          }
        }

        let postedAt = null;
        for (const sel of ["time", '[class*="time"]', "a[title]"]) {
          for (const el of card.querySelectorAll(sel)) {
            const title = el.getAttribute("title") || el.getAttribute("datetime") || "";
            const m = title.match(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})/);
            if (m) {
              const y = m[1];
              const mo = String(m[2]).padStart(2, "0");
              const d = String(m[3]).padStart(2, "0");
              postedAt = `${y}-${mo}-${d}T12:00:00.000Z`;
              break;
            }
          }
          if (postedAt) break;
        }

        results.push({
          mid,
          text: text || "(无正文)",
          detailUrl: `https://weibo.com/${sourceUid}/${mid}`,
          mediaType,
          postedAt,
        });
      }

      return results;
    },
    {
      textSelectors: [...SELECTORS.postText],
      sourceUid,
      videoSelectors: [...SELECTORS.videoIndicators],
    },
  );
  return raw.map(normalizePost);
}

function normalizePost(raw: {
  mid: string;
  text: string;
  detailUrl: string;
  mediaType?: string;
  postedAt?: string | null;
}): WeiboPost {
  const mediaType = raw.mediaType as WeiboMediaType | undefined;
  const postedAt = raw.postedAt ?? weiboMidToIsoDate(raw.mid) ?? undefined;
  return {
    mid: raw.mid,
    text: raw.text,
    detailUrl: raw.detailUrl,
    mediaType: mediaType ?? "unknown",
    postedAt,
  };
}

function postTimestamp(post: WeiboPost): number | null {
  if (!post.postedAt) return null;
  const ts = Date.parse(post.postedAt);
  return Number.isNaN(ts) ? null : ts;
}

export function filterPostsByDateRange(
  posts: WeiboPost[],
  sinceMs: number,
  untilMs: number,
): WeiboPost[] {
  return posts.filter((post) => {
    const ts = postTimestamp(post);
    if (ts == null) return true;
    return ts >= sinceMs && ts <= untilMs;
  });
}

function oldestPostTimestamp(posts: WeiboPost[]): number | null {
  let oldest: number | null = null;
  for (const post of posts) {
    const ts = postTimestamp(post);
    if (ts == null) continue;
    if (oldest == null || ts < oldest) oldest = ts;
  }
  return oldest;
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

/** 抓取当前登录账号主页时间线 */
export async function scrapeMyTimeline(
  page: Page,
  myUid: string,
  options: ScrapeOptions = {},
): Promise<WeiboPost[]> {
  return scrapeSourceTimeline(page, myUid, options);
}

/** 按时间范围抓取本人时间线（向下滚动直到超出 since 或达到 maxScrolls） */
export async function scrapeMyTimelineByDateRange(
  page: Page,
  myUid: string,
  options: ScrapeByDateOptions,
): Promise<WeiboPost[]> {
  const { sinceMs, untilMs, maxScrolls = 30 } = options;
  const url = `https://weibo.com/u/${myUid}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  let allPosts: WeiboPost[] = [];

  for (let scroll = 0; scroll <= maxScrolls; scroll++) {
    const batch = await extractPostsFromPage(page, myUid);
    allPosts = mergePosts(allPosts, batch);

    const oldest = oldestPostTimestamp(allPosts);
    if (oldest != null && oldest < sinceMs) break;

    if (scroll < maxScrolls) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await page.waitForTimeout(1500);
    }
  }

  return filterPostsByDateRange(allPosts, sinceMs, untilMs);
}

export function parseMidFromUrl(url: string): string | null {
  const m = url.match(STATUS_URL_RE);
  return m?.[1] ?? null;
}
