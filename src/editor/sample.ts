import { LOCALES, type Locale } from './i18n.ts';

// Examples are document content, not interface strings. Never replace them when
// the interface language changes; a restored draft (even empty) always wins.
const samples: Record<Locale, { fileName: string; lines: string[] }> = {
  'zh-CN': {
    fileName: '欢迎.md',
    lines: [
      '# 欢迎使用墨笺', '',
      '这是一篇**沉浸阅读**样例。右侧预览用于划线与写想法；改文字请切到「编辑」或「分屏」。', '',
      '划线与想法收在「批注」面板，**不会写回这篇源文**——源文始终保持干净。', '',
      '## 三步开始', '',
      '1. 在预览里**划一句**（选中后点马克笔）',
      '2. 点**写想法**，记下疑问或评注',
      '3. 打开顶栏「导出」，点**下载全文+批注备份包**带走', '',
      '> 草稿会自动保存在此浏览器。清除缓存可能丢失，重要内容请下载备份包。阅读与批注无需 AI。', '',
      '### 试试这些语法', '',
      '行内 `code`、[链接](https://example.com)、*斜体* 与 ~~删除线~~。', '',
      '```js', 'function greet(name) {', '  return `你好，${name}`;', '}', '```', '',
      '| 快捷键 | 功能 |', '| --- | --- |', '| {save} | 下载备份包（浏览器）/ 保存到文件（桌面） |', '| {bold} | 加粗选区 |', '',
      '---', '', '开始阅读与批注吧。'
    ]
  },
  'zh-TW': {
    fileName: '歡迎.md',
    lines: [
      '# 歡迎使用墨箋', '',
      '這是一篇**沉浸閱讀**樣例。右側預覽用於畫線與寫想法；改文字請切到「編輯」或「分割」。', '',
      '畫線與想法收在「註解」面板，**不會寫回這篇原文**——原文始終保持乾淨。', '',
      '## 三步開始', '',
      '1. 在預覽裡**畫一句**（選取後點螢光筆）',
      '2. 點**寫想法**，記下疑問或評註',
      '3. 打開頂欄「匯出」，點**下載全文+註解備份包**帶走', '',
      '> 草稿會自動儲存在此瀏覽器。清除快取可能遺失，重要內容請下載備份包。閱讀與註解無需 AI。', '',
      '### 試試這些語法', '',
      '行內 `code`、[連結](https://example.com)、*斜體* 與 ~~刪除線~~。', '',
      '```js', 'function greet(name) {', '  return `你好，${name}`;', '}', '```', '',
      '| 快速鍵 | 功能 |', '| --- | --- |', '| {save} | 下載備份包（瀏覽器）/ 儲存至檔案（桌面） |', '| {bold} | 將選取文字加粗 |', '',
      '---', '', '開始閱讀與加註吧。'
    ]
  },
  en: {
    fileName: 'Welcome.md',
    lines: [
      '# Welcome to Mojian', '',
      'This is a short **immersive reading** sample. Use the preview to highlight and add thoughts. To edit text, switch to Editor or Split.', '',
      'Highlights and thoughts live in the Annotations panel and **never write back into this source**—the markdown stays clean.', '',
      '## Three steps', '',
      '1. **Highlight a sentence** in the preview (select, then Marker)',
      '2. Tap **Add a thought** to leave a note',
      '3. Open Export and **Download text + annotations backup** to take it with you', '',
      '> Drafts autosave in this browser. Clearing cache can delete them—download a backup for important work. Reading and annotations need no AI.', '',
      '### Try some Markdown', '',
      'Inline `code`, a [link](https://example.com), *italics* and ~~strikethrough~~.', '',
      '```js', 'function greet(name) {', '  return `Hello, ${name}`;', '}', '```', '',
      '| Shortcut | Action |', '| --- | --- |', '| {save} | Download backup (browser) / Save to file (desktop) |', '| {bold} | Bold the selection |', '',
      '---', '', 'Make room for a little thoughtful reading.'
    ]
  },
  ja: {
    fileName: 'ようこそ.md',
    lines: [
      '# 墨笺へようこそ', '',
      'これは短い**集中閲覧**のサンプルです。プレビューでハイライトや考えを残せます。文章の変更は編集表示または分割表示で。', '',
      'ハイライトと考えは「注釈」パネルに入り、**この原文には書き戻しません**——Markdown は常にきれいなままです。', '',
      '## 3 ステップ', '',
      '1. プレビューで**一文をハイライト**（選択してマーカー）',
      '2. **考えを書く**でメモを残す',
      '3. 「書き出し」から**全文+注釈バックアップをダウンロード**して持ち出す', '',
      '> 下書きはこのブラウザーに自動保存されます。キャッシュ削除で消えることがあるので、大切な内容はバックアップをダウンロードしてください。閲覧と注釈に AI は不要です。', '',
      '### Markdown を試す', '',
      'インラインの `code`、[リンク](https://example.com)、*斜体*、~~取り消し線~~。', '',
      '```js', 'function greet(name) {', '  return `こんにちは、${name}`;', '}', '```', '',
      '| ショートカット | 操作 |', '| --- | --- |', '| {save} | バックアップをダウンロード（ブラウザー）/ ファイルに保存（デスクトップ） |', '| {bold} | 選択範囲を太字にする |', '',
      '---', '', 'じっくり読んで、気づきを残しましょう。'
    ]
  }
};

export function getSample(locale: Locale, platform = '') {
  const sample = samples[locale];
  const command = /Mac|iPhone|iPad|iPod/i.test(platform);
  return {
    fileName: sample.fileName,
    markdown: sample.lines.join('\n').replaceAll('{save}', command ? '⌘S' : 'Ctrl+S')
      .replaceAll('{bold}', command ? '⌘B' : 'Ctrl+B')
  };
}

const sampleLanguages = new Map(LOCALES.flatMap(locale =>
  ['MacIntel', 'Win32'].map(platform => [getSample(locale, platform).markdown, locale] as const)));

// Explicitly unknown prevents an arbitrary user document from inheriting the
// UI language. Only unmodified, known examples can be tagged with certainty.
export function sampleLanguage(markdown: string): Locale | '' {
  return sampleLanguages.get(markdown) || '';
}

export function isPristineSample(markdown: string, fileName: string): boolean {
  const language = sampleLanguage(markdown);
  return !!language && samples[language].fileName === fileName;
}
