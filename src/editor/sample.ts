import { LOCALES, type Locale } from './i18n.ts';

// Examples are document content, not interface strings. Never replace them when
// the interface language changes; a restored draft (even empty) always wins.
const samples: Record<Locale, { fileName: string; lines: string[] }> = {
  'zh-CN': {
    fileName: '未命名.md',
    lines: [
      '# 欢迎使用 Markdown 编辑器', '',
      '在左侧编辑 **Markdown 原文**，右侧文章会**实时更新**。右侧用于阅读、划线和批注；修改文字时，请切换到编辑或分屏视图。', '',
      '## 划词批注怎么用', '',
      '在右侧预览里**选中任意一句或一段**，会浮出工具条：', '',
      '1. **马克笔 / 波浪线 / 直线** — 三种划线样式',
      '2. **写想法** — 给这段写下你的疑问或评注',
      '3. **复制与整理** — 批注可以逐条复制，也可以和全文一起导出', '',
      '> 划线和想法会收进「批注」面板。网页草稿保存在此浏览器；桌面版保存到本机桌面草稿。重要内容请另存为文件。', '',
      '## 可选的 AI 助手', '',
      '阅读、编辑和批注不需要 AI。使用 AI 需要桌面版或本地 Agent Bridge，以及已安装并登录的 Claude / Codex CLI，或已配置的 Gemini API Key。提问会把相关内容发送给所选服务商；可能产生服务费用。', '',
      '### 试试这些语法', '',
      '行内 `code`、[链接](https://example.com)、*斜体* 与 ~~删除线~~。', '',
      '```js', 'function greet(name) {', '  return `你好，${name}`;', '}', '```', '',
      '| 快捷键 | 功能 |', '| --- | --- |', '| {save} | 保存到文件 |', '| {bold} | 加粗选区 |', '',
      '---', '', '开始阅读与批注吧。'
    ]
  },
  'zh-TW': {
    fileName: '未命名.md',
    lines: [
      '# 歡迎使用 Markdown 編輯器', '',
      '在左側編輯 **Markdown 原文**，右側文章會**即時更新**。右側用於閱讀、畫線和註解；修改文字時，請切換到編輯或分割檢視。', '',
      '## 如何選取文字並加註', '',
      '在右側預覽中**選取一句或一段文字**，即可開啟工具列：', '',
      '1. **螢光筆 / 波浪線 / 直線** — 三種標記樣式',
      '2. **寫想法** — 記下這段文字帶來的疑問或註解',
      '3. **複製與整理** — 註解可以逐條複製，也可以與全文一起匯出', '',
      '> 標記與想法會收進「註解」面板。網頁草稿儲存在此瀏覽器；桌面版儲存至本機桌面草稿。重要內容請另存為檔案。', '',
      '## 選用的 AI 助手', '',
      '閱讀、編輯與註解不需要 AI。使用 AI 需要桌面版或本機 Agent Bridge，以及已安裝並登入的 Claude / Codex CLI，或已設定的 Gemini API Key。提問會將相關內容傳送給所選服務商；可能產生服務費用。', '',
      '### 試試這些語法', '',
      '行內 `code`、[連結](https://example.com)、*斜體* 與 ~~刪除線~~。', '',
      '```js', 'function greet(name) {', '  return `你好，${name}`;', '}', '```', '',
      '| 快速鍵 | 功能 |', '| --- | --- |', '| {save} | 儲存至檔案 |', '| {bold} | 將選取文字加粗 |', '',
      '---', '', '開始閱讀與加註吧。'
    ]
  },
  en: {
    fileName: 'Untitled.md',
    lines: [
      '# Welcome to Mojian', '',
      'Edit **Markdown source** on the left and see the article **update live** on the right. The preview is for reading, highlighting and annotations. To change text, use Editor or Split view.', '',
      '## Highlight and annotate', '',
      '**Select a sentence or paragraph** in the preview to reveal the toolbar:', '',
      '1. **Marker / Wavy / Underline** — three ways to mark a passage',
      '2. **Add a thought** — write a question or comment about your selection',
      '3. **Copy and collect** — copy annotations individually or export them with the full text', '',
      '> Your highlights and thoughts appear in the Annotations panel. Web drafts stay in this browser; the desktop app keeps a local desktop draft. Save important work to a file as well.', '',
      '## Optional AI assistant', '',
      'Reading, editing and annotations work without AI. AI requires the desktop app or a local Agent Bridge, plus an installed and signed-in Claude / Codex CLI, or a configured Gemini API key. Asking a question sends relevant content to your chosen provider and may incur provider charges.', '',
      '### Try some Markdown', '',
      'Inline `code`, a [link](https://example.com), *italics* and ~~strikethrough~~.', '',
      '```js', 'function greet(name) {', '  return `Hello, ${name}`;', '}', '```', '',
      '| Shortcut | Action |', '| --- | --- |', '| {save} | Save to a file |', '| {bold} | Bold the selection |', '',
      '---', '', 'Make room for a little thoughtful reading.'
    ]
  },
  ja: {
    fileName: '無題.md',
    lines: [
      '# 墨笺へようこそ', '',
      '左側で **Markdown の原文**を編集すると、右側の記事が**リアルタイムに更新**されます。プレビューは閲覧、ハイライト、注釈のための画面です。文章の変更は編集表示または分割表示で行ってください。', '',
      '## ハイライトと注釈', '',
      'プレビューで**文や段落を選択**すると、ツールバーが表示されます。', '',
      '1. **マーカー / 波線 / 下線** — 3 種類のスタイルで印を付ける',
      '2. **考えを書く** — 選択した文章への疑問やコメントを残す',
      '3. **コピーと整理** — 注釈を個別にコピーしたり、全文と一緒に書き出したりする', '',
      '> ハイライトと考えは「注釈」パネルにまとまります。Web 版の下書きはこのブラウザーに、デスクトップ版の下書きはこの端末に保存されます。大切な文章はファイルにも保存してください。', '',
      '## 任意の AI アシスタント', '',
      '閲覧、編集、注釈に AI は不要です。AI を使うにはデスクトップ版またはローカルの Agent Bridge に加え、インストールとログインが済んだ Claude / Codex CLI、または設定済みの Gemini API キーが必要です。質問すると関連する内容が選択したサービスに送信され、利用料金が発生する場合があります。', '',
      '### Markdown を試す', '',
      'インラインの `code`、[リンク](https://example.com)、*斜体*、~~取り消し線~~。', '',
      '```js', 'function greet(name) {', '  return `こんにちは、${name}`;', '}', '```', '',
      '| ショートカット | 操作 |', '| --- | --- |', '| {save} | ファイルに保存 |', '| {bold} | 選択範囲を太字にする |', '',
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
