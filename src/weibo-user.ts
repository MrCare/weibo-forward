import type { BrowserContext, Page } from "playwright";

const STATUS_HREF_RE = /weibo\.com\/(\d+)\/([A-Za-z0-9]+)/;

/** 从当前登录态页面解析自己的 UID */
export async function getLoggedInUid(page: Page): Promise<string> {
  const uid = await page.evaluate(() => {
    const w = window as Window & { $CONFIG?: { uid?: string | number } };
    if (w.$CONFIG?.uid) return String(w.$CONFIG.uid);

    const candidates: string[] = [];
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = a.href;
      const u = href.match(/weibo\.com\/u\/(\d+)/);
      if (u?.[1]) candidates.push(u[1]);
      const direct = href.match(/weibo\.com\/(\d+)(?:\/|$|\?)/);
      if (direct?.[1] && direct[1].length >= 5) candidates.push(direct[1]);
    }

    return candidates[0] ?? null;
  });

  if (!uid) {
    throw new Error("无法获取当前登录用户 UID，请确认已登录微博");
  }
  return uid;
}

async function gotoWithRetry(page: Page, url: string, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      return;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("ERR_ABORTED") ||
        msg.includes("detached") ||
        msg.includes("interrupted");
      if (!retryable || i === attempts - 1) throw err;
      await page.waitForTimeout(1500 * (i + 1));
    }
  }
  throw lastError;
}

/**
 * 在新标签页打开个人主页，取最新一条微博链接。
 * 转发页常会触发 SPA 跳转，在同一 page 上 goto 容易 ERR_ABORTED，故使用独立 page。
 */
export async function captureLatestMyWeiboUrl(
  context: BrowserContext,
  myUid: string,
): Promise<string> {
  const page = await context.newPage();
  try {
    await gotoWithRetry(page, `https://weibo.com/u/${myUid}`);
    await page.waitForTimeout(2500);

    const url = await page.evaluate((uid) => {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/"]');
      for (const a of links) {
        const m = a.href.match(/weibo\.com\/(\d+)\/([A-Za-z0-9]+)/);
        if (m && m[1] === uid) {
          return `https://weibo.com/${m[1]}/${m[2]}`;
        }
      }
      return null;
    }, myUid);

    if (!url) {
      throw new Error("未在个人主页找到最新微博链接");
    }
    return url;
  } finally {
    await page.close();
  }
}

export function parseStatusUrl(url: string): { uid: string; mid: string } | null {
  const m = url.match(STATUS_HREF_RE);
  if (!m) return null;
  return { uid: m[1]!, mid: m[2]! };
}
