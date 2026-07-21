import { chromium } from "/Users/jidongming/.codex/skills/guizang-social-card-skill/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
await page.goto(pathToFileURL(new URL("./posters.html", import.meta.url).pathname).href);
await page.evaluate(() => document.fonts.ready);
await mkdir(new URL("./posters/", import.meta.url), { recursive: true });
for (const [selector, filename] of [
  ["#poster-immersive", "poster-01-immersive-reading.png"],
  ["#poster-annotation", "poster-02-annotation.png"],
  ["#poster-ai", "poster-03-ai-reading.png"],
]) await page.locator(selector).screenshot({ path: new URL(`./posters/${filename}`, import.meta.url).pathname });
await browser.close();
