import { chromium } from "playwright";
import { storageStatePath } from "../src/paths.js";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: storageStatePath("default"),
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
});
const page = await ctx.newPage();
await page.goto("https://weibo.com/7936844360/R0p9sy5UW", {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.waitForTimeout(3000);
await page.locator('[class*="_main_"]').getByText("转发", { exact: true }).first().click();
await page.waitForTimeout(2000);

const ta = page.locator('textarea[placeholder*="说说分享心得"]').first();
const btn = page.locator("button.woo-button-primary").filter({ hasText: /^转发$/ }).first();

async function state(label: string) {
  console.log(label, {
    ta: await ta.inputValue().catch(() => ""),
    btnClass: await btn.getAttribute("class"),
    disabled: await btn.isDisabled().catch(() => null),
  });
}

await state("before fill");
await ta.click();
await ta.fill("测试转发评语ABC");
await state("after fill");
await ta.press(" ");
await ta.press("Backspace");
await state("after keystroke");
await page.waitForTimeout(500);
await btn.click({ timeout: 5000 }).catch((e) => console.log("click failed:", e));
await page.waitForTimeout(3000);
console.log("url:", page.url());

await browser.close();
