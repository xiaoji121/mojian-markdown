import { chromium } from "/Users/jidongming/.codex/skills/guizang-social-card-skill/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(new URL("./index.html", import.meta.url).pathname).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(700);
await mkdir(new URL("./output/", import.meta.url), { recursive: true });

const targets = [
  ["#xhs-01", "xhs-01-cover.png"],
  ["#xhs-02", "xhs-02-problem.png"],
  ["#xhs-03", "xhs-03-workflow.png"],
  ["#xhs-04", "xhs-04-product-landing.png"],
  ["#xhs-05", "xhs-05-product-editor.png"],
  ["#xhs-06", "xhs-06-cta.png"],
];

for (const [selector, filename] of targets) {
  await page.locator(selector).screenshot({ path: new URL(`./output/${filename}`, import.meta.url).pathname });
}

await browser.close();
