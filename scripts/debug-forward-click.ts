import { chromium } from "playwright";
import { storageStatePath } from "../src/paths.js";

const url = "https://weibo.com/7936844360/R0p9sy5UW";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: storageStatePath("default"),
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
});
const page = await ctx.newPage();

async function open(label: string, locator: import("playwright").Locator) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2000);
  console.log(label, "visible:", await locator.isVisible().catch(() => false));
  await locator.click({ timeout: 10_000 }).catch((e) => console.log("  err:", e));
  await page.waitForTimeout(2500);
  const ok = await page.locator('textarea[placeholder*="说说分享心得"]').first().isVisible().catch(() => false);
  console.log("  composer:", ok);
}

const bar = page.locator('[class*="_left_"][class*="_main_"]').filter({ hasText: /转发/ }).first();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await bar.waitFor({ state: "visible", timeout: 20_000 }).catch(() => console.log("bar wait failed"));
console.log("bar after wait:", await bar.isVisible().catch(() => false));

await open("retweet icon", page.locator('[class*="_retweet_"]').first());
await open("first cursor in bar", bar.locator('[class*="_cursor_"]').first());
await open("text 转发 in bar", bar.getByText("转发", { exact: true }).first());

await browser.close();
