import './popup.css';
import { capturePageSnapshot, type PageSnapshot } from './pageCapture.ts';
import { extractArticle, parseFragment, parseSnapshotDocument } from './extract.ts';
import { composeClipMarkdown, createTurndown, suggestFileName, type ClipMeta } from './convert.ts';
import { storeReaderDoc } from './readerDoc.ts';

type ClipMode = 'article' | 'full' | 'selection';

const MODE_KEY = 'mojian-clip-mode';
const META_KEY = 'mojian-clip-meta';

const previewEl = byId<HTMLTextAreaElement>('preview');
const statusEl = byId<HTMLElement>('status');
const messageEl = byId<HTMLElement>('message');
const pageTitleEl = byId<HTMLElement>('page-title');
const copyButton = byId<HTMLButtonElement>('copy');
const downloadButton = byId<HTMLButtonElement>('download');
const readButton = byId<HTMLButtonElement>('read');
const metaToggle = byId<HTMLInputElement>('front-matter');
const modeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="mode"]'));

let snapshot: PageSnapshot | null = null;
let markdown = '';
let fileName = '未命名网页.md';
let lastResult: { body: string; meta: ClipMeta } | null = null;

void init();

async function init(): Promise<void> {
  restorePreferences();
  bindEvents();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showFatal('没有找到当前标签页。');
    return;
  }
  let result: PageSnapshot | null = null;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: capturePageSnapshot
    });
    result = injection?.result ?? null;
  } catch {
    showFatal('无法读取此页面：浏览器内置页面、扩展商店等不允许访问。');
    return;
  }
  if (!result) {
    showFatal('页面内容读取失败，请刷新页面后重试。');
    return;
  }
  snapshot = result;
  pageTitleEl.textContent = result.title || result.url;
  const selectionInput = modeInputs.find((input) => input.value === 'selection');
  if (selectionInput) {
    selectionInput.disabled = !result.selectionHtml;
    if (result.selectionHtml) selectionInput.checked = true;
  }
  render();
}

function render(): void {
  if (!snapshot) return;
  const { body, meta, note } = convertSnapshot(snapshot, currentMode());
  lastResult = { body, meta };
  markdown = composeClipMarkdown(meta, body, metaToggle.checked);
  fileName = suggestFileName(meta.title);
  previewEl.value = markdown;
  const ready = markdown.trim().length > 0;
  copyButton.disabled = !ready;
  downloadButton.disabled = !ready;
  readButton.disabled = !ready;
  const stats = `${markdown.length} 字符 · ${markdown.split('\n').length} 行`;
  statusEl.textContent = note ? `${stats} · ${note}` : stats;
}

function convertSnapshot(
  snap: PageSnapshot,
  mode: ClipMode
): { body: string; meta: ClipMeta; note?: string } {
  const td = createTurndown();
  const meta: ClipMeta = { title: snap.title, url: snap.url, capturedAt: new Date() };
  let body = '';
  let note: string | undefined;
  if (mode === 'selection' && snap.selectionHtml) {
    body = td.turndown(parseFragment(snap.selectionHtml, snap.url));
  } else {
    const doc = parseSnapshotDocument(snap.html, snap.url);
    if (mode === 'article') {
      const article = extractArticle(doc);
      if (article) {
        body = td.turndown(article.html);
        if (article.title) meta.title = article.title;
        meta.byline = article.byline;
        meta.excerpt = article.excerpt;
      } else {
        note = '未能识别正文，已按整页转换';
      }
    }
    if (!body) body = td.turndown(doc.body ?? doc.documentElement);
  }
  if (!meta.title.trim()) meta.title = '未命名网页';
  return { body, meta, note };
}

function bindEvents(): void {
  for (const input of modeInputs) {
    input.addEventListener('change', () => {
      localStorage.setItem(MODE_KEY, currentMode());
      render();
    });
  }
  metaToggle.addEventListener('change', () => {
    localStorage.setItem(META_KEY, metaToggle.checked ? '1' : '0');
    render();
  });
  copyButton.addEventListener('click', () => {
    void navigator.clipboard.writeText(previewEl.value).then(() => flash(copyButton, '已复制 ✓'));
  });
  downloadButton.addEventListener('click', () => {
    const blob = new Blob([previewEl.value], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    flash(downloadButton, '已下载 ✓');
  });
  readButton.addEventListener('click', () => {
    if (!lastResult) return;
    const stored = storeReaderDoc({
      title: lastResult.meta.title,
      url: lastResult.meta.url,
      capturedAt: lastResult.meta.capturedAt.toISOString(),
      markdown: lastResult.body
    });
    if (!stored) {
      statusEl.textContent = '内容过大，无法打开阅读页';
      return;
    }
    void chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
    window.close();
  });
}

function restorePreferences(): void {
  const savedMode = localStorage.getItem(MODE_KEY);
  const saved =
    savedMode === 'selection' ? undefined : modeInputs.find((input) => input.value === savedMode);
  const target = saved ?? modeInputs[0];
  if (target) target.checked = true;
  metaToggle.checked = localStorage.getItem(META_KEY) !== '0';
}

function currentMode(): ClipMode {
  const checked = modeInputs.find((input) => input.checked);
  return (checked?.value as ClipMode | undefined) ?? 'article';
}

function flash(button: HTMLButtonElement, text: string): void {
  const original = button.dataset.label ?? button.textContent ?? '';
  button.dataset.label = original;
  button.textContent = text;
  setTimeout(() => {
    button.textContent = button.dataset.label ?? original;
  }, 1200);
}

function showFatal(text: string): void {
  messageEl.hidden = false;
  messageEl.textContent = text;
  previewEl.value = '';
  statusEl.textContent = '';
  copyButton.disabled = true;
  downloadButton.disabled = true;
  readButton.disabled = true;
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: #${id}`);
  return el as T;
}
