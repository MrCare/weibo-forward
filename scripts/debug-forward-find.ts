import { chromium } from "playwright";
import { storageStatePath } from "../src/paths.js";

const mid = process.argv[2] ?? "R0oKM38Xd";
const uid = process.argv[3] ?? "1234567890";
const url = `https://weibo.com/${uid}/${mid}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: storageStatePath("default"),
  viewport: { width: 1280, height: 900 },
  locale: "zh-CN",
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(3000);

const d = await page.evaluate(() => ({
  url: location.href,
  hasForwardText: !!document.evaluate(
    "//*[normalize-space(text())='转发']",
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue,
  toolbars: [...document.querySelectorAll('[class*="_left_"], [class*="_main_198"], [class*="_main_18"]')]
    .map((el) => ({
      cls: (el as HTMLElement).className?.toString().slice(0, 120),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
      retweet: !!el.querySelector('[class*="_retweet_"]'),
      cursors: el.querySelectorAll('[class*="_cursor_"]').length,
    }))
    .filter((x) => x.cursors > 0 || /评论|赞|分享/.test(x.text)),
}));

console.log(JSON.stringify(d, null, 2));

const strategies = [
  {
    name: "old filter 转发+评论",
    loc: page
      .locator('[class*="_left_"][class*="_main_"]')
      .filter({ hasText: /转发/ })
      .filter({ hasText: /评论/ }),
  },
  {
    name: "评论+赞",
    loc: page
      .locator('[class*="_left_"][class*="_main_"]')
      .filter({ hasText: /评论/ })
      .filter({ hasText: /赞/ }),
  },
  {
    name: "has _retweet_",
    loc: page.locator('[class*="_left_"][class*="_main_"]').filter({
      has: page.locator('[class*="_retweet_"]'),
    }),
  },
];

for (const s of strategies) {
  const n = await s.loc.count();
  const vis = n > 0 && (await s.loc.first().isVisible().catch(() => false));
  console.log(s.name, "count=", n, "visible=", vis);
}

const bar = page
  .locator('[class*="_left_"][class*="_main_"]')
  .filter({ has: page.locator('[class*="_retweet_"]') })
  .first();
await bar.waitFor({ state: "visible", timeout: 20_000 });
await bar.locator('[class*="_cursor_"]').first().click();
await page.waitForTimeout(2500);
const ok = await page
  .locator('textarea[placeholder*="说说分享心得"]')
  .first()
  .isVisible()
  .catch(() => false);
console.log("retweet bar + first cursor -> composer:", ok);

await browser.close();
