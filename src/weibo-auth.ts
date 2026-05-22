import type { BrowserContext, Page } from "playwright";
import { SELECTORS } from "./selectors.js";

export function isLoginPageUrl(url: string): boolean {
  return /passport\.weibo|\/newlogin|signin|\/login/i.test(url);
}

/** 在微博主站确认已登录（$CONFIG.uid 或头像） */
export async function isLoggedInOnWeibo(page: Page): Promise<boolean> {
  const url = page.url();
  if (isLoginPageUrl(url)) return false;

  const hasUid = await page.evaluate(() => {
    const w = window as Window & {
      $CONFIG?: { uid?: string | number; islogin?: string | number };
    };
    const uid = w.$CONFIG?.uid;
    if (uid && String(uid) !== "0") return true;
    return w.$CONFIG?.islogin === 1 || w.$CONFIG?.islogin === "1";
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

/** passport 扫码成功后通常会出现 weibo.com 的 SUB cookie */
export async function hasWeiboSubCookie(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies("https://weibo.com");
  return cookies.some(
    (c) => c.name === "SUB" && c.domain.includes("weibo") && c.value.length > 4,
  );
}

/** 打开微博首页并确认登录态有效 */
export async function ensureWeiboHomeLoggedIn(
  page: Page,
  context: BrowserContext,
): Promise<boolean> {
  await page.goto("https://weibo.com", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(3000);

  if (await isLoggedInOnWeibo(page)) return true;

  if (isLoginPageUrl(page.url())) return false;

  if (await hasWeiboSubCookie(context)) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    return isLoggedInOnWeibo(page);
  }

  return false;
}
