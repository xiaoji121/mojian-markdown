// Native UI has no renderer dependency. Stored preferences use only these stable IDs.
export const desktopLocales = ['zh-CN', 'zh-TW', 'en', 'ja'];
export function canonicalDesktopLocale(value) {
  const parts = String(value || '').toLowerCase().replaceAll('_', '-').split('-');
  if (parts[0] === 'zh') return parts.some(part => ['hant', 'tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN';
  return parts[0] === 'ja' ? 'ja' : 'en';
}
export function initialDesktopLocale(state, platformLocale) {
  return desktopLocales.includes(state?.locale) ? state.locale : canonicalDesktopLocale(platformLocale);
}
const messages = {
  'zh-CN': {
    file: '文件', new: '新建', open: '打开…', openPath: '输入绝对路径打开…', save: '保存', saveAs: '另存为…',
    close: '关闭窗口', quit: '退出', edit: '编辑', cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选',
    view: '视图', reload: '重新加载', devTools: '开发者工具', resetZoom: '实际大小', zoomIn: '放大', zoomOut: '缩小',
    fullscreen: '全屏', window: '窗口', minimize: '最小化', zoom: '缩放', front: '全部置于顶层',
    about: '关于墨笺 Markdown', services: '服务', hide: '隐藏墨笺 Markdown', hideOthers: '隐藏其他', showAll: '显示全部',
    draftTitle: '草稿尚未安全保存', draftMessage: '无法确认最新修改已保存。现在退出可能丢失修改。',
    draftDetail: '请选择“留在编辑器”重试保存。只有选择“仍然退出”才会放弃本次保存保护。',
    stay: '留在编辑器', exit: '仍然退出', ungrantedPath: '未授权的文件路径：{detail}',
    absolutePath: '请输入文件的绝对路径', markdownOnly: '仅支持 .md、.markdown 或 .txt 文件',
    validName: '请使用有效的 Markdown 文件名', nameExists: '同名文件已存在，请换一个名称',
    startupFailure: '墨笺 Markdown 启动失败', draftReadFailure: '无法读取桌面草稿，原文件已保留：{detail}',
    untrusted: '不受信任的编辑器', openTitle: '打开 Markdown 文件', saveTitle: '保存 Markdown 文件'
  },
  'zh-TW': {
    file: '檔案', new: '新增', open: '開啟…', openPath: '輸入絕對路徑開啟…', save: '儲存', saveAs: '另存新檔…',
    close: '關閉視窗', quit: '結束', edit: '編輯', cut: '剪下', copy: '複製', paste: '貼上', selectAll: '全選',
    view: '檢視', reload: '重新載入', devTools: '開發者工具', resetZoom: '實際大小', zoomIn: '放大', zoomOut: '縮小',
    fullscreen: '全螢幕', window: '視窗', minimize: '最小化', zoom: '縮放', front: '全部移至最前',
    about: '關於墨笺 Markdown', services: '服務', hide: '隱藏墨笺 Markdown', hideOthers: '隱藏其他', showAll: '顯示全部',
    draftTitle: '草稿尚未安全儲存', draftMessage: '無法確認最新修改已儲存。現在結束可能遺失修改。',
    draftDetail: '請選擇「留在編輯器」重試儲存。只有選擇「仍然結束」才會放棄本次儲存保護。',
    stay: '留在編輯器', exit: '仍然結束', ungrantedPath: '未授權的檔案路徑：{detail}',
    absolutePath: '請輸入檔案的絕對路徑', markdownOnly: '僅支援 .md、.markdown 或 .txt 檔案',
    validName: '請使用有效的 Markdown 檔名', nameExists: '同名檔案已存在，請換一個名稱',
    startupFailure: '墨笺 Markdown 啟動失敗', draftReadFailure: '無法讀取桌面草稿，原始檔案已保留：{detail}',
    untrusted: '不受信任的編輯器', openTitle: '開啟 Markdown 檔案', saveTitle: '儲存 Markdown 檔案'
  },
  en: {
    file: 'File', new: 'New', open: 'Open…', openPath: 'Open absolute path…', save: 'Save', saveAs: 'Save As…',
    close: 'Close Window', quit: 'Quit', edit: 'Edit', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
    view: 'View', reload: 'Reload', devTools: 'Developer Tools', resetZoom: 'Actual Size', zoomIn: 'Zoom In', zoomOut: 'Zoom Out',
    fullscreen: 'Full Screen', window: 'Window', minimize: 'Minimize', zoom: 'Zoom', front: 'Bring All to Front',
    about: 'About 墨笺 Markdown', services: 'Services', hide: 'Hide 墨笺 Markdown', hideOthers: 'Hide Others', showAll: 'Show All',
    draftTitle: 'Draft not safely saved', draftMessage: 'Your latest changes may not be saved. Quitting now could lose them.',
    draftDetail: 'Choose “Stay in Editor” to retry saving. Only “Quit Anyway” skips this save protection.',
    stay: 'Stay in Editor', exit: 'Quit Anyway', ungrantedPath: 'File path not authorized: {detail}',
    absolutePath: 'Enter an absolute file path', markdownOnly: 'Only .md, .markdown, or .txt files are supported',
    validName: 'Use a valid Markdown file name', nameExists: 'A file with this name already exists. Choose another name.',
    startupFailure: '墨笺 Markdown failed to start', draftReadFailure: 'Unable to read the desktop draft; the original file was preserved: {detail}',
    untrusted: 'Untrusted editor', openTitle: 'Open Markdown File', saveTitle: 'Save Markdown File'
  },
  ja: {
    file: 'ファイル', new: '新規作成', open: '開く…', openPath: '絶対パスを指定して開く…', save: '保存', saveAs: '名前を付けて保存…',
    close: 'ウィンドウを閉じる', quit: '終了', edit: '編集', cut: '切り取り', copy: 'コピー', paste: '貼り付け', selectAll: 'すべて選択',
    view: '表示', reload: '再読み込み', devTools: '開発者ツール', resetZoom: '実際のサイズ', zoomIn: '拡大', zoomOut: '縮小',
    fullscreen: 'フルスクリーン', window: 'ウィンドウ', minimize: '最小化', zoom: 'ズーム', front: 'すべてを手前に移動',
    about: '墨笺 Markdown について', services: 'サービス', hide: '墨笺 Markdown を隠す', hideOthers: 'ほかを隠す', showAll: 'すべてを表示',
    draftTitle: '下書きが安全に保存されていません', draftMessage: '最新の変更が保存されたか確認できません。終了すると変更が失われる可能性があります。',
    draftDetail: '「エディターに戻る」を選んで保存を再試行してください。「終了する」を選ぶと今回の保存保護を省略します。',
    stay: 'エディターに戻る', exit: '終了する', ungrantedPath: '許可されていないファイルパス：{detail}',
    absolutePath: 'ファイルの絶対パスを入力してください', markdownOnly: '.md、.markdown、.txt ファイルのみ対応しています',
    validName: '有効な Markdown ファイル名を指定してください', nameExists: '同じ名前のファイルが存在します。別の名前を指定してください。',
    startupFailure: '墨笺 Markdown を起動できませんでした', draftReadFailure: 'デスクトップの下書きを読み込めません。元のファイルは保持されています：{detail}',
    untrusted: '信頼されていないエディター', openTitle: 'Markdown ファイルを開く', saveTitle: 'Markdown ファイルを保存'
  }
};
export function nativeText(locale, key, values = {}) {
  const text = messages[locale]?.[key] ?? messages.en[key];
  if (typeof text !== 'string') throw new Error(`Unknown native message: ${key}`);
  return text.replace(/\{(\w+)\}/g, (placeholder, name) => values[name] === undefined ? placeholder : String(values[name]));
}
export function nativeMenuTemplate(locale, isMac, sendMenu) {
  const t = (key) => nativeText(locale, key);
  const role = (name, key = name) => ({ role: name, label: t(key) });
  const action = (key, name, accelerator) => ({ label: t(key), accelerator, click: () => sendMenu(name) });
  const separator = { type: 'separator' };
  return [
    ...(isMac ? [{ role: 'appMenu', label: '墨笺 Markdown', submenu: [role('about'), separator, role('services'), separator,
      role('hide'), role('hideOthers'), role('unhide', 'showAll'), separator, role('quit')] }] : []),
    { label: t('file'), submenu: [action('new', 'new', 'CmdOrCtrl+N'), action('open', 'open', 'CmdOrCtrl+O'),
      action('openPath', 'open-path'), action('save', 'save', 'CmdOrCtrl+S'), action('saveAs', 'save-as', 'CmdOrCtrl+Shift+S'),
      separator, role(isMac ? 'close' : 'quit')] },
    { label: t('edit'), submenu: [role('cut'), role('copy'), role('paste'), role('selectAll')] },
    { label: t('view'), submenu: [role('reload'), role('toggleDevTools', 'devTools'), separator,
      role('resetZoom'), role('zoomIn'), role('zoomOut'), separator, role('togglefullscreen', 'fullscreen')] },
    { role: 'windowMenu', label: t('window'), submenu: [role('minimize'), role('zoom'), ...(isMac ? [separator, role('front')] : [role('close')])] }
  ];
}
