import { chromium } from "playwright";
import path from "node:path";
import { storageStatePath } from "../src/paths.js";

const mid = process.argv[2] ?? "";
const uid = process.argv[3] ?? "";
const headless = process.env.HEADLESS !== "false";

if (!mid || !uid) {
  console.error("用法: tsx scripts/debug-delete-dom.ts <mid> <uid>");
  process.exit(1);
}

const url = `https://weibo.com/${uid}/${mid}`;

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

const info = await page.evaluate(() => {
  const moreCandidates = [
    ...document.querySelectorAll('[action-type="fl_menu"]'),
    ...document.querySelectorAll('a[action-type="fl_menu"]'),
    ...document.querySelectorAll('[class*="_more_"]'),
    ...document.querySelectorAll('button[aria-label*="更多"]'),
  ];
  return {
    url: location.href,
    title: document.title,
    moreButtons: moreCandidates.slice(0, 8).map((el) => ({
      tag: el.tagName,
      className: (el as HTMLElement).className?.toString().slice(0, 120),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
      actionType: el.getAttribute("action-type"),
    })),
    deleteLinks: [...document.querySelectorAll("a, button, span, div")]
      .filter((el) => (el.textContent ?? "").trim() === "删除")
      .slice(0, 5)
      .map((el) => ({
        tag: el.tagName,
        className: (el as HTMLElement).className?.toString().slice(0, 120),
        visible: (el as HTMLElement).offsetParent !== null,
      })),
  };
});

console.log(JSON.stringify(info, null, 2));

async function tryOpenMore(label: string, click: () => Promise<void>) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
  console.log("\n---", label);
  await click();
  await page.waitForTimeout(2000);
  const deleteVisible = await page.getByText("删除", { exact: true }).first().isVisible().catch(() => false);
  console.log("delete menu item:", deleteVisible);
}

const moreLocators = [
  () => page.locator('[action-type="fl_menu"]').first(),
  () => page.locator('a[action-type="fl_menu"]').first(),
  () => page.locator('[class*="_more_"]').first(),
];

for (let i = 0; i < moreLocators.length; i++) {
  const loc = moreLocators[i]!;
  await tryOpenMore(`more candidate ${i}`, async () => {
    const el = loc();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click({ timeout: 10_000 });
    }
  });
}

await page.screenshot({
  path: path.join("data/errors", `debug-delete-${mid}.png`),
  fullPage: true,
});
await browser.close();
