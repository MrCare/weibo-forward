import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Locator, Page } from "playwright";
import type { WeiboPost } from "./types.js";
import { SELECTORS } from "./selectors.js";
import { DATA_DIR } from "./paths.js";
import { assertWeiboLoggedIn } from "./weibo-auth.js";
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

/** 仅匹配含评语输入框的转发弹层，避免误点详情页其它「转发」按钮 */
function forwardComposerRoot(page: Page): Locator {
  const textarea = SELECTORS.forwardCommentTextarea;
  return page
    .locator(SELECTORS.forwardComposerRoots.join(", "))
    .filter({ has: page.locator(textarea) })
    .first()
    .or(
      page
        .locator(textarea)
        .locator('xpath=ancestor::*[.//button[contains(@class,"woo-button-primary")]][1]'),
    );
}

function forwardSubmitButton(page: Page): Locator {
  return forwardComposerRoot(page)
    .locator(SELECTORS.forwardSubmitButton)
    .filter({ hasText: /^转发$/ })
    .first();
}

async function isForwardComposerOpen(page: Page): Promise<boolean> {
  const textarea = forwardCommentTextarea(page);
  const submit = forwardSubmitButton(page);
  return (
    (await textarea.isVisible().catch(() => false)) &&
    (await submit.isVisible().catch(() => false))
  );
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

async function setForwardCommentValue(textarea: Locator, comment: string): Promise<void> {
  await textarea.click();
  await textarea.fill("");
  await textarea.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, comment);
  await textarea.press("End");
  await textarea.press(" ");
  await textarea.press("Backspace");

  const actual = await textarea.inputValue().catch(() => "");
  if (!actual.trim()) {
    throw new Error("评语未能写入转发输入框");
  }
}

async function fillForwardComment(page: Page, comment: string): Promise<void> {
  await setForwardCommentValue(forwardCommentTextarea(page), comment);
}

async function waitForForwardSubmitEnabled(page: Page, timeoutMs = 8000): Promise<Locator> {
  const submit = forwardSubmitButton(page);
  if (!(await submit.isVisible({ timeout: 5000 }).catch(() => false))) {
    throw new Error("未在转发弹层中找到确认「转发」按钮");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await submit.isDisabled().catch(() => true))) return submit;
    await page.waitForTimeout(200);
  }

  throw new Error("转发按钮仍为禁用状态，评语可能未正确填入");
}

async function detectForwardFailureMessage(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const chunks: string[] = [];
    for (const el of document.querySelectorAll(
      '[class*="toast"], [class*="Toast"], [class*="tip"], [class*="Tip"], [class*="warn"], [class*="error"], [role="alert"]',
    )) {
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t.length >= 2 && t.length <= 120) chunks.push(t);
    }
    const body = document.body?.innerText ?? "";
    const joined = [...chunks, body].join("\n");
    const m = joined.match(
      /前方拥堵[，,]?\s*请登录后使用|请登录后查看|操作过于频繁|转发失败|发送失败|请稍后再试|验证码|账号异常|内容不符合|审核|字数|超出|重复转发|已转发过|禁止转发|涉嫌违规/,
    );
    return m?.[0] ?? null;
  });
}

async function collectForwardComposerHint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder*="说说分享心得"]',
    );
    const btn = [...document.querySelectorAll("button.woo-button-primary")].find(
      (b) => (b.textContent ?? "").trim() === "转发",
    ) as HTMLButtonElement | undefined;
    const toast = [...document.querySelectorAll('[class*="toast"], [class*="Toast"]')]
      .map((el) => (el.textContent ?? "").trim())
      .filter((t) => t.length > 0 && t.length < 100)
      .slice(0, 2)
      .join(" | ");
    return [
      ta ? `评语${ta.value.length}字` : "无输入框",
      btn ? (btn.disabled ? "按钮禁用" : "按钮可点") : "无确认按钮",
      toast ? `提示:${toast}` : "",
    ]
      .filter(Boolean)
      .join("，");
  });
}

/** 确认弹层关闭或出现成功提示，避免「点了按钮但实际未发出」 */
async function verifyForwardSubmitted(page: Page, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const err = await detectForwardFailureMessage(page);
    if (err) {
      if (/前方拥堵|请登录/.test(err)) {
        throw new Error(`微博登录态已失效（${err}），请在控制台重新扫码登录`);
      }
      throw new Error(`微博拒绝转发：${err}`);
    }

    const success = await page.evaluate(() => {
      const t = document.body?.innerText ?? "";
      return /转发成功|已转发/.test(t);
    });
    if (success) return;

    if (!(await isForwardComposerOpen(page))) return;

    await page.waitForTimeout(400);
  }

  const hint = await collectForwardComposerHint(page);
  throw new Error(
    `转发弹层未关闭，可能未成功提交（${hint || "请检查是否触发风控或频率限制"}）`,
  );
}

async function confirmForward(page: Page): Promise<void> {
  const submit = await waitForForwardSubmitEnabled(page);
  await submit.scrollIntoViewIfNeeded();
  await submit.click({ timeout: 10_000 });

  try {
    await verifyForwardSubmitted(page);
    return;
  } catch (firstErr) {
    if (!(await isForwardComposerOpen(page))) throw firstErr;

    await submit.click({ timeout: 10_000, force: true }).catch(() => {});
    await forwardCommentTextarea(page).press("Control+Enter").catch(() => {});
    await verifyForwardSubmitted(page);
  }
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
    await page.waitForTimeout(1500);
    await assertWeiboLoggedIn(page);

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
