import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import type Database from "better-sqlite3";
import { getDatabase } from "../db/client.js";
import {
  createLoginSession,
  getLoginSession,
  updateLoginSession,
  getLoginSessionByToken,
} from "../db/login-session-store.js";
import { getAccount } from "../db/user-store.js";
import { SELECTORS } from "../selectors.js";
import { DATA_DIR } from "../paths.js";
import { ensureTenantAccountDir, tenantStorageStatePath } from "../tenancy/paths.js";
import {
  finalizeWeiboLoginAndSave,
  isLoginPageUrl,
  probeLoggedIn,
} from "../weibo-login-probe.js";

const LOGIN_URL =
  process.env.WEIBO_LOGIN_URL ??
  "https://passport.weibo.com/sso/signin?entry=miniblog&source=home";
const POLL_MS = 2500;
const MAX_WAIT_MS = Number(process.env.LOGIN_SESSION_TIMEOUT_MS ?? 600_000);

function loginSessionQrPath(
  userId: string,
  accountId: string,
  sessionId: string,
): string {
  return path.join(
    DATA_DIR,
    "tenants",
    userId,
    "accounts",
    accountId,
    "login-sessions",
    `${sessionId}.png`,
  );
}

async function openScanLoginTab(page: Page): Promise<void> {
  const tabTexts = ["扫码登录", "扫描二维码", "手机扫码"];
  for (const text of tabTexts) {
    const tab = page.getByText(text, { exact: false }).first();
    if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) {
      await tab.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return;
    }
  }
}

async function captureQrScreenshot(page: Page, dest: string): Promise<boolean> {
  await mkdir(path.dirname(dest), { recursive: true });
  await openScanLoginTab(page);

  for (const sel of SELECTORS.loginQrRegions) {
    const loc = page.locator(sel).first();
    if (!(await loc.isVisible({ timeout: 2000 }).catch(() => false))) continue;

    const box = await loc.boundingBox();
    if (!box || box.width < 80 || box.height < 80) continue;

    try {
      await loc.screenshot({ path: dest });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/** passport 页上出现「已扫码/登录成功」等信号 */
async function probeScanSucceededOnPassport(page: Page): Promise<boolean> {
  const url = page.url();
  if (!isLoginPageUrl(url) && url.includes("weibo.com")) {
    return probeLoggedIn(page);
  }

  const textHit = await page.evaluate(() => {
    const t = document.body?.innerText ?? "";
    return /登录成功|扫码成功|已登录|跳转中/.test(t);
  });
  if (textHit) return true;

  return probeLoggedIn(page);
}

async function runLoginBrowserJob(
  db: Database.Database,
  userId: string,
  accountId: string,
  sessionId: string,
): Promise<void> {
  const qrPath = loginSessionQrPath(userId, accountId, sessionId);
  const storagePath = tenantStorageStatePath(userId, accountId);
  const headless = process.env.LOGIN_HEADLESS !== "false";

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const page = await context.newPage();

    updateLoginSession(db, sessionId, { status: "pending", errorMessage: null });

    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3000);
    await openScanLoginTab(page);

    const deadline = Date.now() + MAX_WAIT_MS;
    let qrReady = false;

    while (Date.now() < deadline) {
      const session = getLoginSession(db, userId, sessionId);
      if (!session || session.status === "expired") return;

      if (await probeScanSucceededOnPassport(page) || !isLoginPageUrl(page.url())) {
        updateLoginSession(db, sessionId, {
          status: "awaiting_scan",
          errorMessage: "扫码成功，正在同步微博登录态…",
        });
        await ensureTenantAccountDir(userId, accountId);
        const ok = await finalizeWeiboLoginAndSave(context, page, storagePath);
        if (ok) {
          updateLoginSession(db, sessionId, {
            status: "succeeded",
            errorMessage: null,
          });
          console.log(`[login] 账号 ${accountId} 登录成功，已保存 ${storagePath}`);
          return;
        }
        updateLoginSession(db, sessionId, {
          status: "awaiting_scan",
          errorMessage: "扫码成功，正在等待微博首页确认，请稍候…",
        });
      } else if (!qrReady) {
        qrReady = await captureQrScreenshot(page, qrPath);
        if (qrReady) {
          updateLoginSession(db, sessionId, {
            status: "awaiting_scan",
            qrImagePath: qrPath,
            errorMessage: null,
          });
          console.log(`[login] 二维码已生成: ${qrPath}`);
        } else {
          updateLoginSession(db, sessionId, {
            status: "pending",
            errorMessage: "正在加载二维码，请稍候刷新页面…",
          });
        }
      } else {
        await captureQrScreenshot(page, qrPath);
        updateLoginSession(db, sessionId, {
          status: "awaiting_scan",
          qrImagePath: qrPath,
        });
      }

      await page.waitForTimeout(POLL_MS);
    }

    updateLoginSession(db, sessionId, {
      status: "failed",
      errorMessage: qrReady
        ? "登录超时：若已扫码，请关闭本页后重新发起"
        : "未能获取微博二维码，请检查网络或稍后重试",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateLoginSession(db, sessionId, {
      status: "failed",
      errorMessage: msg,
    });
    console.error(`[login] session ${sessionId} 失败:`, msg);
  } finally {
    await browser.close();
  }
}

export function startWeiboLoginSession(
  userId: string,
  forwardAccountId: string,
  baseUrl: string,
): { sessionId: string; loginToken: string; webUrl: string } {
  const db = getDatabase();
  const account = getAccount(db, userId, forwardAccountId);
  if (!account) {
    throw new Error("转发账号不存在");
  }

  const session = createLoginSession(db, userId, forwardAccountId);

  void runLoginBrowserJob(db, userId, forwardAccountId, session.id);

  return {
    sessionId: session.id,
    loginToken: session.login_token,
    webUrl: `${baseUrl}/web/login.html?sessionId=${session.id}&token=${session.login_token}`,
  };
}

export function getLoginSessionPublic(sessionId: string, loginToken: string) {
  const db = getDatabase();
  return getLoginSessionByToken(db, sessionId, loginToken);
}
