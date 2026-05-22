import { chromium } from "playwright";
import path from "node:path";
import { storageStatePath } from "../src/paths.js";

const mid = process.argv[2] ?? "R0p9sy5UW";
const uid = process.argv[3] ?? "7936844360";
const url = `https://weibo.com/${uid}/${mid}`;
const headless = process.env.HEADLESS !== "false";

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  storageState: storageStatePath("default"),
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
});
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(3000);

const info = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  hasForwardText: !!document.evaluate(
    "//*[normalize-space(text())='转发']",
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue,
  bars: [...document.querySelectorAll('[class*="_main_"]')].slice(0, 5).map((el) => ({
    className: (el as HTMLElement).className?.toString().slice(0, 120),
    text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    items: [...el.querySelectorAll('[class*="_item_"], [class*="_cursor_"]')].slice(0, 5).map(
      (c) => ({
        className: (c as HTMLElement).className?.toString().slice(0, 80),
        text: (c.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30),
      }),
    ),
  })),
}));

console.log(JSON.stringify(info, null, 2));

async function tryOpen(label: string, click: () => Promise<void>) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
  console.log("\n---", label);
  await click();
  await page.waitForTimeout(2500);
  const ok = await page
    .locator('textarea[placeholder*="说说分享心得"]')
    .first()
    .isVisible()
    .catch(() => false);
  console.log("composer:", ok);
}

const bar = () =>
  page
    .locator('[class*="_main_"]')
    .filter({ has: page.getByText("评论", { exact: true }) })
    .first();

await tryOpen("text 转发", async () => {
  await bar().getByText("转发", { exact: true }).first().click();
});
await tryOpen("first _cursor_", async () => {
  await bar().locator('[class*="_cursor_"]').first().click();
});
await tryOpen("first _item_", async () => {
  await bar().locator('[class*="_item_"]').first().click();
});

await page.screenshot({ path: path.join("data/errors", `debug-${mid}-final.png`), fullPage: true });
await browser.close();
