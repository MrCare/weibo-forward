import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { repostWeibo } from "../publisher.js";
import { scrapeSourceTimeline } from "../scraper.js";
import { SELECTORS } from "../selectors.js";
import { storageStatePath } from "../paths.js";
import { probeLoggedIn } from "../weibo-login-probe.js";
import type { WeiboPost } from "../types.js";
import type { ScrapeTimelineOptions, WeiboClient } from "./interfaces.js";

const VIEWPORT = { width: 1280, height: 900 };
const NAV_TIMEOUT_MS = 60_000;

export class PlaywrightWeiboClient implements WeiboClient {
  constructor(
    private readonly forwardAccountId: string,
    private readonly storageStateOverride?: string,
  ) {}

  private get storagePath(): string {
    return this.storageStateOverride ?? storageStatePath(this.forwardAccountId);
  }

  async loginInteractive(): Promise<void> {
    await mkdir(path.dirname(this.storagePath), { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const page = await context.newPage();

    console.log("请在浏览器中完成微博登录（扫码或账号密码）…");
    await page.goto("https://weibo.com", { waitUntil: "domcontentloaded" });

    await waitForLogin(page, 300_000);
    await context.storageState({ path: this.storagePath });
    console.log(`登录态已保存: ${this.storagePath}`);

    await browser.close();
  }

  async withSession<T>(
    headless: boolean,
    fn: (context: BrowserContext) => Promise<T>,
  ): Promise<T> {
    const browser = await launchBrowser(headless);
    try {
      const context = await createAuthenticatedContext(browser, this.storagePath);
      await verifyLoggedInContext(context);
      return await fn(context);
    } finally {
      await browser.close();
    }
  }

  scrapeTimeline(
    page: Page,
    sourceUid: string,
    options?: ScrapeTimelineOptions,
  ): Promise<WeiboPost[]> {
    return scrapeSourceTimeline(page, sourceUid, options);
  }

  repost(context: BrowserContext, post: WeiboPost, comment: string): Promise<string> {
    return repostWeibo(context, post, comment);
  }
}

async function launchBrowser(headless: boolean): Promise<Browser> {
  return chromium.launch({ headless });
}

async function createAuthenticatedContext(
  browser: Browser,
  storagePath: string,
): Promise<BrowserContext> {
  try {
    const context = await browser.newContext({
      storageState: storagePath,
      viewport: VIEWPORT,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    context.setDefaultTimeout(NAV_TIMEOUT_MS);
    return context;
  } catch {
    throw new Error(
      `未找到登录态 ${storagePath}，请先运行: npm run auth:login`,
    );
  }
}

async function gotoWithRetry(page: Page, url: string, attempts = 3): Promise<void> {
  const waitStrategies = ["domcontentloaded", "commit"] as const;
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    for (const waitUntil of waitStrategies) {
      try {
        await page.goto(url, { waitUntil, timeout: NAV_TIMEOUT_MS });
        return;
      } catch (err) {
        lastError = err;
      }
    }
    await page.waitForTimeout(2000 * (i + 1));
  }
  throw lastError;
}

function shouldSkipHomeVerify(): boolean {
  return process.env.SKIP_WEIBO_HOME_VERIFY === "1";
}

async function verifyLoggedInContext(context: BrowserContext): Promise<void> {
  if (shouldSkipHomeVerify()) {
    console.log("已跳过首页登录校验（SKIP_WEIBO_HOME_VERIFY=1）");
    return;
  }

  const page = await context.newPage();
  try {
    console.log("校验登录态（访问微博首页）…");
    await gotoWithRetry(page, "https://weibo.com");
    await assertLoggedIn(page);
  } finally {
    await page.close();
  }
}

async function waitForLogin(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!url.includes("login") && !url.includes("passport")) {
      for (const sel of SELECTORS.loggedInIndicators) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          return;
        }
      }
      await page.waitForTimeout(3000);
      if (!page.url().includes("login")) return;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error("登录超时，请重新运行 npm run auth:login");
}

async function assertLoggedIn(page: Page): Promise<void> {
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes("login") || url.includes("passport")) {
    throw new Error(
      "登录态已失效或未在微博首页完成登录，请在控制台重新「扫码登录」",
    );
  }

  if (!(await probeLoggedIn(page))) {
    throw new Error(
      "登录态未通过校验（storageState 可能不完整），请重新扫码登录",
    );
  }
}
