import type { BrowserContext, Page } from "playwright";
import { SELECTORS } from "./selectors.js";

export function isLoginPageUrl(url: string): boolean {
  return /passport\.weibo|\/newlogin|\/login|signin/i.test(url);
}

/** 检测页面是否已处于微博登录态 */
export async function probeLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (isLoginPageUrl(url)) {
    return false;
  }

  const hasUid = await page.evaluate(() => {
    const w = window as Window & {
      $CONFIG?: { uid?: string | number; islogin?: string | number };
    };
    if (w.$CONFIG?.uid && String(w.$CONFIG.uid) !== "0") return true;
    if (w.$CONFIG?.islogin === 1 || w.$CONFIG?.islogin === "1") return true;
    return false;
  });
  if (hasUid) return true;

  if (!url.includes("weibo.com")) return false;

  for (const sel of SELECTORS.loggedInIndicators) {
    if (await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false)) {
      return true;
    }
  }
  return false;
}

/**
 * 扫码后必须在 weibo.com 完成会话，再保存 storageState。
 * 仅在 passport 保存会导致转发时首页仍跳转登录页。
 */
export async function finalizeWeiboLoginAndSave(
  context: BrowserContext,
  page: Page,
  storagePath: string,
): Promise<boolean> {
  try {
    await page.goto("https://weibo.com", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  } catch {
    /* 偶发导航中断，再试一次 */
    await page.goto("https://weibo.com", { waitUntil: "commit", timeout: 60_000 }).catch(() => {});
  }

  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    if (await probeLoggedIn(page)) {
      await context.storageState({ path: storagePath });
      return true;
    }
    if (page.url().includes("passport")) {
      await page.goto("https://weibo.com", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
    }
  }
  return false;
}
