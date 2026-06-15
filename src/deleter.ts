import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Locator, Page } from "playwright";
import type { WeiboPost } from "./types.js";
import { SELECTORS } from "./selectors.js";
import { DATA_DIR } from "./paths.js";
import { assertWeiboLoggedIn } from "./weibo-auth.js";

const ERRORS_DIR = path.join(DATA_DIR, "errors");

function deleteConfirmRoot(page: Page): Locator {
  return page.locator(SELECTORS.deleteConfirmRoots.join(", ")).first();
}

async function clickMoreMenu(page: Page): Promise<void> {
  for (const sel of SELECTORS.postMoreMenu) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ timeout: 10_000 });
      return;
    }
  }

  const byText = page.getByText("更多", { exact: true }).first();
  if (await byText.isVisible({ timeout: 2000 }).catch(() => false)) {
    await byText.click({ timeout: 10_000 });
    return;
  }

  throw new Error("未找到「更多」菜单按钮");
}

async function clickDeleteMenuItem(page: Page): Promise<void> {
  const deleteItem = page.getByText("删除", { exact: true }).first();
  if (!(await deleteItem.isVisible({ timeout: 5000 }).catch(() => false))) {
    throw new Error("未找到「删除」菜单项");
  }
  await deleteItem.click({ timeout: 10_000 });
}

async function confirmDelete(page: Page): Promise<void> {
  const root = deleteConfirmRoot(page);
  const confirmInRoot = root
    .locator("button.woo-button-primary, button")
    .filter({ hasText: /^(确定|删除)$/ })
    .first();
  if (await confirmInRoot.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirmInRoot.click({ timeout: 10_000 });
    return;
  }

  const globalConfirm = page
    .locator("button.woo-button-primary, button")
    .filter({ hasText: /^(确定|删除)$/ })
    .first();
  if (await globalConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
    await globalConfirm.click({ timeout: 10_000 });
    return;
  }

  throw new Error("未找到删除确认按钮");
}

async function detectDeleteFailureMessage(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const body = document.body?.innerText ?? "";
    const m = body.match(
      /删除失败|操作过于频繁|请稍后再试|验证码|账号异常|无权|不能删除|审核/,
    );
    return m?.[0] ?? null;
  });
}

async function verifyDeleteSubmitted(page: Page, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const err = await detectDeleteFailureMessage(page);
    if (err) {
      throw new Error(`微博拒绝删除：${err}`);
    }

    const success = await page.evaluate(() => {
      const t = document.body?.innerText ?? "";
      return /删除成功|已删除/.test(t);
    });
    if (success) return;

    const confirmOpen = await deleteConfirmRoot(page).isVisible().catch(() => false);
    if (!confirmOpen) return;

    await page.waitForTimeout(400);
  }

  throw new Error("删除确认弹层未关闭，可能未成功删除");
}

async function saveErrorScreenshot(page: Page, mid: string): Promise<string> {
  await mkdir(ERRORS_DIR, { recursive: true });
  const filePath = path.join(ERRORS_DIR, `delete-${mid}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

/** 在已登录的 BrowserContext 中删除一条本人微博 */
export async function deleteWeiboPost(
  context: BrowserContext,
  post: WeiboPost,
): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(post.detailUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await assertWeiboLoggedIn(page);

    await clickMoreMenu(page);
    await page.waitForTimeout(800);
    await clickDeleteMenuItem(page);
    await page.waitForTimeout(800);
    await confirmDelete(page);
    await verifyDeleteSubmitted(page);
    await page.waitForTimeout(1500);
  } catch (err) {
    const screenshot = await saveErrorScreenshot(page, post.mid).catch(() => null);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `删除失败 mid=${post.mid}: ${msg}${screenshot ? ` (截图: ${screenshot})` : ""}`,
    );
  } finally {
    await page.close();
  }
}
