import type { BrowserContext, Page } from "playwright";
import { SELECTORS } from "./selectors.js";

export function isLoginPageUrl(url: string): boolean {
  return /passport\.weibo|\/newlogin|\/login|signin/i.test(url);
}

/** 从页面或全局配置读取已登录 UID */
export async function detectLoggedInUid(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const w = window as Window & {
      $CONFIG?: { uid?: string | number; islogin?: string | number };
    };
    if (w.$CONFIG?.uid && String(w.$CONFIG.uid) !== "0") {
      return String(w.$CONFIG.uid);
    }
    if (w.$CONFIG?.islogin === 1 || w.$CONFIG?.islogin === "1") {
      return "logged-in";
    }
    return null;
  });
}

export async function hasWeiboAuthCookies(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies();
  return cookies.some(
    (c) =>
      (c.domain.includes("weibo.com") || c.domain.includes("sina.com.cn")) &&
      /^(SUB|SUBP|SCF|WBPSESS)$/i.test(c.name),
  );
}

/** 等待真正登录完成（扫码后 passport 回调或跳转） */
export async function waitForWeiboLogin(
  page: Page,
  context: BrowserContext,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const uid = await detectLoggedInUid(page);
    if (uid) return;

    if (await hasWeiboAuthCookies(context)) {
      await page.goto("https://weibo.com", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(2000);
      if (await detectLoggedInUid(page)) return;
      if (!isLoginPageUrl(page.url())) {
        for (const sel of SELECTORS.loggedInIndicators) {
          if (await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false)) {
            return;
          }
        }
      }
    }

    await page.waitForTimeout(1500);
  }

  throw new Error("扫码后登录超时，请重试");
}

/**
 * 扫码成功后：打开微博首页确认登录，再写入 storageState。
 */
export async function finalizeAndSaveStorageState(
  context: BrowserContext,
  page: Page,
  storagePath: string,
): Promise<string | null> {
  await waitForWeiboLogin(page, context);

  await page.goto("https://weibo.com", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);

  const uid = await detectLoggedInUid(page);
  if (!uid && isLoginPageUrl(page.url())) {
    throw new Error("未能完成微博登录，请重新扫码");
  }

  await context.storageState({ path: storagePath });
  return uid === "logged-in" ? null : uid;
}

/** 使用已保存的 storageState 校验是否仍能访问微博 */
export async function assertStorageStateValid(page: Page): Promise<void> {
  await page.goto("https://weibo.com", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);

  const url = page.url();
  if (isLoginPageUrl(url)) {
    throw new Error("登录态已失效，请在控制台重新扫码登录");
  }

  const uid = await detectLoggedInUid(page);
  if (uid) return;

  for (const sel of SELECTORS.loggedInIndicators) {
    if (await page.locator(sel).first().isVisible({ timeout: 3000 }).catch(() => false)) {
      return;
    }
  }

  throw new Error("登录态已失效，请在控制台重新扫码登录");
}
