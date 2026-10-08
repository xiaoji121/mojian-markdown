// Capture the actual app; only document content and Bridge responses are fixtures.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const output = process.env.SCREENSHOT_OUTPUT || 'docs/images';
const markdown = `# 把阅读变成自己的知识

阅读的价值，不在于记住每一句话，而在于建立自己的理解。

> 慢下来，给重要的句子留一个位置。

## 一、带着问题阅读

先问自己：作者试图解决什么问题？再沿着文章的结构，寻找论点与证据之间的联系。

- **先看结构**：浏览标题，建立一张文章地图。
- **再读细节**：标出关键概念与值得推敲的判断。
- **最后复述**：合上原文，用自己的话写下理解。

## 二、留下思考的痕迹

划线是起点，批注才是对话。把「这句话很好」变成一个具体的问题，让下一次阅读有迹可循。

| 阅读动作 | 留下的线索 |
| --- | --- |
| 标记关键句 | 作者的核心观点 |
| 写下疑问 | 需要补充的证据 |
| 联系经验 | 可以尝试的行动 |

## 三、把理解变成行动

每读完一篇文章，选择一个小问题，写下可以在明天尝试的答案。

\`\`\`text
问题 → 证据 → 理解 → 行动
\`\`\`

---

本文为墨笺 README 截图专用的原创演示文档。
`;
const quote = '阅读的价值，不在于记住每一句话，而在于建立自己的理解。';
const stamp = '2026-10-08T08:30:00.000Z';
const documentId = 'readme-demo';
const doc = { documentId, fileName: '阅读与思考.md', title: '阅读与思考', content: markdown,
  updatedAt: stamp, annotationCount: 1, questionCount: 0, answerDocuments: [] };
const state = { content: markdown, fileName: doc.fileName, fontSize: 18, theme: 'dark',
  paperDark: 'ink', paperLight: 'parchment', comments: [], aiEngine: 'codex',
  bridgeDocumentId: documentId, aiPanelWidth: 420 };
const server = await createServer({ mode: 'bridge', server: { host: '127.0.0.1', port: 4750, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1,
  locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
await mkdir(output, { recursive: true });
const captured = [];
try {
  // Block all external services; no real provider, account, or private workspace is used.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.port === '4750' && url.hostname === '127.0.0.1') return route.continue();
    if (url.port !== '4317' || url.hostname !== '127.0.0.1') return route.abort();
    const json = (body) => route.fulfill({ json: body });
    if (url.pathname === '/api/readiness') return json({ bridgeAvailable: true,
      providers: { codex: { executable: 'found' }, claude: { executable: 'missing' },
        gemini: { configured: false, storage: 'plaintext' } } });
    if (url.pathname === '/api/documents' && route.request().method() === 'GET') return json({ documents: [doc] });
    if (url.pathname === '/api/documents') return json({ documentId });
    if (url.pathname === '/api/history') return json({ documentId, messages: [] });
    if (url.pathname === '/api/conversations') return json({ conversations: [] });
    if (url.pathname === '/api/chat') {
      const answer = '**演示回答（非实时 AI 输出）**\n\n可以用三个动作，把阅读转化为自己的理解：\n\n1. **提出问题**：先明确想从文章中获得什么。\n2. **连接证据**：对照上下文，说明观点为什么成立。\n3. **用自己的话复述**：写下一个能在明天尝试的小行动。\n\n划线保留线索，批注记录思考；两者一起，才能让重读更有收获。';
      const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
      return route.fulfill({ contentType: 'text/event-stream', body:
        event('meta', { requestId: 'readme-demo-answer', documentId, mode: 'chat', documentChars: markdown.length }) +
        event('delta', { text: answer }) + event('done', {}) });
    }
    return json({});
  });
  await context.addInitScript((initial) => localStorage.setItem('md-editor-warm-v1', JSON.stringify(initial)), state);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4750/#editor');
  await expect(page.locator('.md-preview h1')).toHaveText('把阅读变成自己的知识');
  await page.evaluate(() => document.fonts.ready);
  async function capture(name) {
    await page.mouse.move(1430, 940);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/${name}.jpg`, type: 'jpeg', quality: 92, animations: 'disabled' });
    captured.push(name);
  }
  // Exercise the real selection and toolbar handlers, not synthetic HTML or CSS.
  async function selectQuote() {
    const paragraph = page.locator('.md-preview p').filter({ hasText: quote }).first();
    await paragraph.scrollIntoViewIfNeeded();
    await paragraph.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.locator('.selection-toolbar')).toBeVisible();
  }
  await capture('editor-split-view');
  await selectQuote();
  await capture('selection-toolbar');
  await page.getByRole('button', { name: /写想法/ }).click();
  await expect(page.locator('.comments-panel')).toBeVisible();
  await expect(page.locator('.comments-panel .comment-quote')).toHaveCount(1);
  const note = page.locator('.comment-note-input');
  if (await note.count()) await note.first().fill('把关键句改写成自己的问题：这篇文章能改变我的哪个习惯？');
  await page.locator('[data-mode="preview"]').click();
  await capture('annotation-panel');
  await page.getByRole('button', { name: '批注', exact: true }).click();
  await page.getByRole('button', { name: '沉浸式阅读', exact: true }).click();
  for (const [paper, name] of [['羊皮纸', 'immersive-parchment'], ['豆沙绿', 'immersive-green']]) {
    await page.getByRole('button', { name: '阅读排版', exact: true }).click();
    await page.getByRole('button', { name: `纸色：${paper}`, exact: true }).click();
    await page.keyboard.press('Escape');
    await capture(name);
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '阅读排版', exact: true }).click();
  await page.getByRole('button', { name: '纸色：墨黑', exact: true }).click();
  await page.keyboard.press('Escape');
  await selectQuote();
  await page.locator('.selection-toolbar .ai-entry').click();
  await expect(page.locator('.ai-panel')).toBeVisible();
  await page.locator('.ai-input').fill('怎样把这句话变成可执行的阅读方法？');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.locator('.ai-message-assistant')).toContainText('演示回答（非实时 AI 输出）');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  await capture('ai-reading-assistant');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(`${output}/capture-manifest.json`, JSON.stringify({ sourceCommit:
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), viewport: { width: 1440, height: 960 },
    browser: await browser.version(), files: captured, syntheticData: true, liveAI: false }, null, 2) + '\n');
} finally {
  await context.close(); await browser.close(); await server.close();
}
