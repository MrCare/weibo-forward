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

/** 未登录时微博常展示的软墙文案 */
export async function detectWeiboLoginWall(page: Page): Promise<string | null> {
  const wall = await page.evaluate(() => {
    const t = document.body?.innerText ?? "";
    const m = t.match(
      /前方拥堵[，,]?\s*请登录后使用|请登录后查看|登录后可见|登录后使用/,
    );
    return m?.[0] ?? null;
  });
  if (wall) return wall;

  const guestNav = await page.evaluate(() => {
    const nav = document.querySelector("header, nav, [class*='Nav']");
    if (!nav) return false;
    return [...nav.querySelectorAll("a, button")].some(
      (el) => (el.textContent ?? "").trim() === "登录",
    );
  });
  if (guestNav && !(await isLoggedInOnWeibo(page))) {
    return "页面显示「登录」入口，当前未登录";
  }

  return null;
}

/** 转发/互动前确认已登录，避免在未登录页空点转发 */
export async function assertWeiboLoggedIn(page: Page): Promise<void> {
  if (await isLoggedInOnWeibo(page)) return;

  const wall = await detectWeiboLoginWall(page);
  if (wall) {
    throw new Error(`微博登录态已失效（${wall}），请在控制台重新扫码登录`);
  }

  if (isLoginPageUrl(page.url())) {
    throw new Error("微博登录态已失效（已跳转登录页），请在控制台重新扫码登录");
  }

  throw new Error("微博登录态已失效或未识别到已登录用户，请在控制台重新扫码登录");
}
