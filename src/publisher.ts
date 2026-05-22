import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Locator, Page } from "playwright";
import type { WeiboPost } from "./types.js";
import { SELECTORS } from "./selectors.js";
import { DATA_DIR } from "./paths.js";
import { captureLatestMyWeiboUrl, getLoggedInUid } from "./weibo-user.js";

const ERRORS_DIR = path.join(DATA_DIR, "errors");

export function randomDelay(minMs = 3000, maxMs = 8000): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}

/** 多种详情页互动栏形态（文字「转发」或仅图标+数字） */
function postActionBarCandidates(page: Page): Locator[] {
  const base = page.locator(SELECTORS.postActionBar);
  return [
    base.filter({ has: page.locator(SELECTORS.forwardRetweetRegion) }).first(),
    base.filter({ hasText: /转发/ }).filter({ hasText: /评论/ }).first(),
    base.filter({ hasText: /评论/ }).filter({ hasText: /赞/ }).first(),
  ];
}

function forwardCommentTextarea(page: Page): Locator {
  return page.locator(SELECTORS.forwardCommentTextarea).first();
}

async function waitForPostActionBar(page: Page, timeoutMs = 20_000): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const bar of postActionBarCandidates(page)) {
      if (await bar.isVisible().catch(() => false)) {
        return bar;
      }
    }
    await page.waitForTimeout(400);
  }
  throw new Error("未找到博文互动栏");
}

async function clickForwardButton(page: Page): Promise<void> {
  const legacy = page.locator(SELECTORS.forwardLinks.join(", ")).first();
  if (await legacy.isVisible({ timeout: 2000 }).catch(() => false)) {
    await legacy.scrollIntoViewIfNeeded();
    await legacy.click({ timeout: 10_000 });
    return;
  }

  await page
    .locator(SELECTORS.forwardRetweetRegion)
    .first()
    .scrollIntoViewIfNeeded()
    .catch(() => {});

  const bar = await waitForPostActionBar(page);

  const byText = bar.getByText("转发", { exact: true }).first();
  if (await byText.isVisible({ timeout: 2000 }).catch(() => false)) {
    await byText.scrollIntoViewIfNeeded();
    await byText.click({ timeout: 10_000 });
    return;
  }

  const firstAction = bar.locator('[class*="_cursor_"]').first();
  if (await firstAction.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstAction.scrollIntoViewIfNeeded();
    await firstAction.click({ timeout: 10_000 });
    return;
  }

  const retweet = bar.locator(SELECTORS.forwardRetweetRegion).first();
  if (await retweet.isVisible({ timeout: 2000 }).catch(() => false)) {
    await retweet.click({ timeout: 10_000 });
    return;
  }

  throw new Error("未找到「转发」按钮");
}

async function openForwardComposer(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickForwardButton(page);

  try {
    await forwardCommentTextarea(page).waitFor({ state: "visible", timeout: 12_000 });
  } catch {
    throw new Error("未打开转发弹层");
  }
}

async function fillForwardComment(page: Page, comment: string): Promise<void> {
  const textarea = forwardCommentTextarea(page);
  await textarea.click();
  await textarea.fill(comment);
}

async function confirmForward(page: Page): Promise<void> {
  const submit = page
    .locator(SELECTORS.forwardSubmitButton)
    .filter({ hasText: /^转发$/ })
    .first();
  if (!(await submit.isVisible({ timeout: 5000 }).catch(() => false))) {
    throw new Error("未找到确认「转发」按钮");
  }
  await submit.click({ timeout: 10_000 });
}

async function saveErrorScreenshot(page: Page, mid: string): Promise<string> {
  await mkdir(ERRORS_DIR, { recursive: true });
  const filePath = path.join(ERRORS_DIR, `${mid}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

/** 在已登录的 BrowserContext 中执行转发，返回「我的转发」链接 */
export async function repostWeibo(
  context: BrowserContext,
  post: WeiboPost,
  comment: string,
): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(post.detailUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    await openForwardComposer(page);
    await fillForwardComment(page, comment);
    await confirmForward(page);

    await page.waitForTimeout(3000);

    const myUid = await getLoggedInUid(page);
    await page.waitForTimeout(1500);
    return captureLatestMyWeiboUrl(context, myUid);
  } catch (err) {
    const screenshot = await saveErrorScreenshot(page, post.mid).catch(() => null);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `转发失败 mid=${post.mid}: ${msg}${screenshot ? ` (截图: ${screenshot})` : ""}`,
    );
  } finally {
    await page.close();
  }
}
