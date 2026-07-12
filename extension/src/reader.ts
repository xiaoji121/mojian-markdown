import './reader.css';
import { renderMarkdown } from './render.ts';
import { loadReaderDoc, type ReaderDoc } from './readerDoc.ts';
import { suggestFileName } from './convert.ts';

const THEME_KEY = 'mojian-reader-theme';
const SIZE_KEY = 'mojian-reader-size';
const SOURCE_KEY = 'mojian-reader-source';
const IMMERSIVE_KEY = 'mojian-reader-immersive';
const MIN_SIZE = 14;
const MAX_SIZE = 26;
const DEFAULT_SIZE = 16; // 与编辑器 .md-preview 的默认字号一致

const sourceEl = byId<HTMLTextAreaElement>('source');
const docTitleEl = byId<HTMLElement>('doc-title');
const docHeadEl = byId<HTMLElement>('doc-head');
const docBodyEl = byId<HTMLElement>('doc-body');
const panesEl = byId<HTMLElement>('panes');
const emptyEl = byId<HTMLElement>('empty');
const fontValueEl = byId<HTMLElement>('font-value');
const themeButton = byId<HTMLButtonElement>('toggle-theme');
const sourceButton = byId<HTMLButtonElement>('toggle-source');
const immersiveButton = byId<HTMLButtonElement>('immersive');
const barEl = document.querySelector('.bar') as HTMLElement;
const hintEl = byId<HTMLElement>('hint');

let doc: ReaderDoc | null = null;
let renderTimer: number | undefined;
let hintTimer: number | undefined;

init();

function init(): void {
  applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
  applyFontSize(Number(localStorage.getItem(SIZE_KEY)) || DEFAULT_SIZE);
  applySourceVisible(localStorage.getItem(SOURCE_KEY) !== '0');
  bindToolbar();
  bindImmersive();
  applyImmersive(localStorage.getItem(IMMERSIVE_KEY) === '1');

  doc = loadReaderDoc();
  if (!doc) {
    panesEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }
  document.title = doc.title ? `${doc.title} — 墨笺阅读` : '墨笺阅读';
  docTitleEl.textContent = doc.title;
  renderHead(doc);
  sourceEl.value = doc.markdown;
  renderPreview();
  sourceEl.addEventListener('input', () => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(renderPreview, 150);
  });
}

function renderHead(current: ReaderDoc): void {
  docHeadEl.textContent = '';
  const heading = document.createElement('h1');
  heading.textContent = current.title || '未命名网页';
  docHeadEl.appendChild(heading);
  const line = document.createElement('p');
  line.className = 'doc-meta';
  if (current.url) {
    const link = document.createElement('a');
    link.href = current.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = current.url;
    line.append('来源：', link);
  }
  if (current.capturedAt) {
    line.append(`${current.url ? ' · ' : ''}剪藏于 ${current.capturedAt.slice(0, 10)}`);
  }
  if (line.childNodes.length) docHeadEl.appendChild(line);
}

function renderPreview(): void {
  docBodyEl.innerHTML = renderMarkdown(sourceEl.value);
  for (const link of docBodyEl.querySelectorAll('a')) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
}

function bindToolbar(): void {
  themeButton.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  byId<HTMLButtonElement>('font-minus').addEventListener('click', () => nudgeFontSize(-1));
  byId<HTMLButtonElement>('font-plus').addEventListener('click', () => nudgeFontSize(1));
  sourceButton.addEventListener('click', () => {
    applySourceVisible(panesEl.classList.contains('source-hidden'));
  });
  byId<HTMLButtonElement>('copy').addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    void navigator.clipboard.writeText(sourceEl.value).then(() => flash(button, '已复制 ✓'));
  });
  byId<HTMLButtonElement>('download').addEventListener('click', () => {
    const blob = new Blob([sourceEl.value], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestFileName(doc?.title ?? '');
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
}

function bindImmersive(): void {
  immersiveButton.addEventListener('click', () => {
    applyImmersive(!document.body.classList.contains('immersive'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('immersive')) {
      applyImmersive(false);
    }
  });
  document.addEventListener('mousemove', (event) => {
    if (!document.body.classList.contains('immersive')) return;
    if (event.clientY <= 40) {
      document.body.classList.add('bar-peek');
    } else if (event.clientY > 160 && !barEl.matches(':hover')) {
      document.body.classList.remove('bar-peek');
    }
  });
}

function applyImmersive(on: boolean): void {
  document.body.classList.toggle('immersive', on);
  document.body.classList.remove('bar-peek');
  immersiveButton.classList.toggle('active', on);
  immersiveButton.textContent = on ? '退出沉浸' : '沉浸';
  sourceButton.disabled = on; // the source pane is force-hidden while immersive
  localStorage.setItem(IMMERSIVE_KEY, on ? '1' : '0');
  if (on) showHint();
}

function showHint(): void {
  hintEl.hidden = false;
  hintEl.classList.add('show');
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    hintEl.classList.remove('show');
    hintTimer = window.setTimeout(() => {
      hintEl.hidden = true;
    }, 400);
  }, 2600);
}

function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  themeButton.textContent = theme === 'dark' ? '亮色' : '暗色';
}

function currentFontSize(): number {
  return Number(fontValueEl.textContent) || DEFAULT_SIZE;
}

function nudgeFontSize(delta: number): void {
  applyFontSize(currentFontSize() + delta);
}

function applyFontSize(size: number): void {
  const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
  document.documentElement.style.setProperty('--doc-size', `${clamped}px`);
  fontValueEl.textContent = String(clamped);
  localStorage.setItem(SIZE_KEY, String(clamped));
}

function applySourceVisible(visible: boolean): void {
  panesEl.classList.toggle('source-hidden', !visible);
  sourceButton.classList.toggle('active', visible);
  localStorage.setItem(SOURCE_KEY, visible ? '1' : '0');
}

function flash(button: HTMLButtonElement, text: string): void {
  const original = button.dataset.label ?? button.textContent ?? '';
  button.dataset.label = original;
  button.textContent = text;
  setTimeout(() => {
    button.textContent = button.dataset.label ?? original;
  }, 1200);
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: #${id}`);
  return el as T;
}
