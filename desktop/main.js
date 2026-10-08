// 墨笺 Markdown 桌面端（Electron 主进程）。
// 职责：
//   1. 内嵌启动 Agent Bridge——随机端口 + 静态托管 dist，前端与 API 同源，
//      不再暴露带 CORS 的固定本机端口；
//   2. 原生文件对话框与读写——真实绝对路径，授权一次永久有效
//      （授权清单持久化在 userData，重启后恢复的文档仍可直接同步）；
//   3. 应用菜单、macOS「双击 .md 打开」、单实例与命令行参数接管。
import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell, safeStorage } from 'electron';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createSettingsStore } from '../scripts/agent-bridge-settings.js';
import { createSafeStorageAdapter } from './credentialStore.js';
import { desktopRequestHeaders, invokeSettings } from './credentialBoundary.js';
import { testAiConnection } from './testAiConnection.js';
import { fileURLToPath } from 'node:url';
import { startAgentBridge } from '../scripts/agent-bridge.js';
import { readLocalAsset } from './localAssets.js';
import { createEditorStateStore, isTrustedEditorSender } from './editorState.js';
import { createCloseCoordinator } from './closeCoordinator.js';
import { desktopLocales, initialDesktopLocale, nativeText, nativeMenuTemplate } from './locale.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

// 自动化测试隔离用户数据目录（含授权清单）；必须在 ready 之前设置。
if (process.env.MOJIAN_USER_DATA) app.setPath('userData', process.env.MOJIAN_USER_DATA);

let activeLocale = 'en';
const t = (key, values) => nativeText(activeLocale, key, values);
let mainWindow = null;
let bridge = null;
let editorStateStore = null;
let aiSettingsStore = null;
const desktopCapability = randomBytes(32).toString('hex');
let closeCoordinator = null;
let quittingRequested = false;
const pendingWrites = new Set();

function trackWrite(work) {
  const promise = Promise.resolve().then(work);
  pendingWrites.add(promise);
  promise.then(() => pendingWrites.delete(promise), () => pendingWrites.delete(promise));
  return promise;
}

async function waitForWrites() {
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
}

function registerEditorStateIpc() {
  const trusted = (event) => isTrustedEditorSender(event, mainWindow, bridge?.url);
  ipcMain.on('desktop:load-editor-state', (event) => {
    event.returnValue = trusted(event) ? editorStateStore.load() : { ok: false, error: t('untrusted') };
  });
  ipcMain.on('desktop:save-editor-state', (event, state) => {
    const result = trusted(event) ? editorStateStore.save(state) : { ok: false, error: t('untrusted') };
    if (result.ok && desktopLocales.includes(state.locale) && state.locale !== activeLocale) {
      activeLocale = state.locale;
      Menu.setApplicationMenu(buildMenu());
    }
    event.returnValue = result;
  });
  ipcMain.on('desktop:close-ready', (event, token, success) => {
    if (trusted(event)) void closeCoordinator?.complete(token, success);
  });
}

function protectWindowClose(window) {
  let allowed = false;
  let closing = false;
  closeCoordinator = createCloseCoordinator({
    prepare: (token) => {
      closing = true;
      window.webContents.send('desktop:prepare-close', token);
    },
    onCancel: (token) => {
      closing = false;
      window.webContents.send('desktop:close-cancelled', token);
    },
    waitForWrites,
    close: () => {
      allowed = true;
      if (quittingRequested) app.quit();
      else window.close();
    },
    confirmLoss: async () => {
      const result = await dialog.showMessageBox(window, {
        type: 'warning', title: t('draftTitle'),
        message: t('draftMessage'),
        detail: t('draftDetail'),
        buttons: [t('stay'), t('exit')], defaultId: 0, cancelId: 0, noLink: true
      });
      if (result.response !== 1) quittingRequested = false;
      return result.response === 1;
    }
  });
  const coordinator = closeCoordinator;
  window.webContents.on('before-input-event', (event) => {
    if (closing) event.preventDefault();
  });
  window.on('close', (event) => {
    if (allowed) return;
    event.preventDefault();
    coordinator.request();
  });
  window.on('closed', () => {
    coordinator.dispose();
    if (closeCoordinator === coordinator) closeCoordinator = null;
  });
}
// 渲染层注册完事件监听（调用 consume-pending-open）之前，外部打开请求先排队。
let rendererReady = false;
let pendingOpen = null;
// 只允许读写用户通过对话框或系统「打开方式」明确指定过的文件。
const grantedPaths = new Set();

function workspaceRoot() {
  if (process.env.AGENT_BRIDGE_WORKSPACE) return process.env.AGENT_BRIDGE_WORKSPACE;
  return app.isPackaged
    ? join(app.getPath('userData'), 'reading-workspace')
    : join(app.getAppPath(), '.reading-workspace');
}

// ===== 文件授权清单 =====

function grantsFile() {
  return join(app.getPath('userData'), 'granted-paths.json');
}

async function loadGrantedPaths() {
  try {
    const stored = JSON.parse(await readFile(grantsFile(), 'utf8'));
    if (Array.isArray(stored)) stored.forEach((item) => grantedPaths.add(String(item)));
  } catch {}
}

function grantPath(filePath) {
  grantedPaths.add(resolve(filePath));
  trackWrite(() => writeFile(grantsFile(), JSON.stringify([...grantedPaths], null, 2))).catch(() => {});
}

function assertGranted(filePath) {
  if (!grantedPaths.has(resolve(String(filePath)))) {
    throw new Error(t('ungrantedPath', { detail: filePath }));
  }
}

// ===== 外部打开（双击 .md / 打开方式 / 命令行参数） =====

async function readPickedFile(filePath) {
  const [content, info] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
  return { path: filePath, name: basename(filePath), content, lastModified: info.mtimeMs };
}

function deliverOpenFile(payload) {
  pendingOpen = payload;
  if (mainWindow && rendererReady) {
    mainWindow.webContents.send('desktop:open-path', payload);
    pendingOpen = null;
  }
}

async function openExternalPath(filePath) {
  if (!MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase())) return;
  try {
    const payload = await readPickedFile(filePath);
    grantPath(filePath);
    deliverOpenFile(payload);
  } catch {}
}

function collectMarkdownArgs(argv, cwd) {
  return argv
    .filter((arg) => !arg.startsWith('-') && MARKDOWN_EXTENSIONS.has(extname(arg).toLowerCase()))
    .map((arg) => resolve(cwd, arg));
}

// ===== IPC =====

function registerIpcHandlers() {
  registerEditorStateIpc();
  ipcMain.handle('desktop:ai-settings', (event, operation, payload) => trackWrite(() =>
    invokeSettings(event, mainWindow, bridge?.url, aiSettingsStore, operation, payload,
      (input) => testAiConnection(aiSettingsStore, input))));
  const handleWrite = (channel, handler) => ipcMain.handle(channel, (...args) => trackWrite(() => handler(...args)));
  ipcMain.handle('desktop:read-clipboard-text', () => clipboard.readText());

  ipcMain.handle('desktop:open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('openTitle'),
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    grantPath(result.filePaths[0]);
    return readPickedFile(result.filePaths[0]);
  });

  ipcMain.handle('desktop:open-file-path', async (_event, inputPath) => {
    let filePath = String(inputPath || '').trim();
    if ((filePath.startsWith('"') && filePath.endsWith('"'))
      || (filePath.startsWith("'") && filePath.endsWith("'"))) filePath = filePath.slice(1, -1).trim();
    if (!isAbsolute(filePath)) throw new Error(t('absolutePath'));
    if (!MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase())) {
      throw new Error(t('markdownOnly'));
    }
    const normalized = resolve(filePath);
    const picked = await readPickedFile(normalized);
    grantPath(normalized);
    return picked;
  });

  handleWrite('desktop:save-file-as', async (_event, suggestedName, content) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: t('saveTitle'),
      defaultPath: String(suggestedName || 'document.md'),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, String(content ?? ''), 'utf8');
    grantPath(result.filePath);
    const info = await stat(result.filePath);
    return { path: result.filePath, name: basename(result.filePath), lastModified: info.mtimeMs };
  });

  ipcMain.handle('desktop:read-file', async (_event, filePath) => {
    assertGranted(filePath);
    try {
      const { content, lastModified } = await readPickedFile(String(filePath));
      return { content, lastModified };
    } catch {
      return null;
    }
  });

  handleWrite('desktop:write-file', async (_event, filePath, content) => {
    assertGranted(filePath);
    await writeFile(String(filePath), String(content ?? ''), 'utf8');
    return { lastModified: (await stat(String(filePath))).mtimeMs };
  });

  handleWrite('desktop:rename-file', async (_event, filePath, requestedName) => {
    assertGranted(filePath);
    const sourcePath = resolve(String(filePath));
    const nextName = String(requestedName || '').trim();
    if (!nextName || basename(nextName) !== nextName || !MARKDOWN_EXTENSIONS.has(extname(nextName).toLowerCase())) {
      throw new Error(t('validName'));
    }
    const targetPath = resolve(dirname(sourcePath), nextName);
    if (targetPath === sourcePath) return readPickedFile(sourcePath);

    const sourceInfo = await stat(sourcePath);
    try {
      const targetInfo = await stat(targetPath);
      const sameFile = sourceInfo.dev === targetInfo.dev && sourceInfo.ino === targetInfo.ino;
      if (!sameFile) throw new Error(t('nameExists'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    await rename(sourcePath, targetPath);
    grantedPaths.delete(sourcePath);
    grantPath(targetPath);
    return readPickedFile(targetPath);
  });

  // 预览里的相对路径图片：以已授权的文档为根解析读取，返回 data URL。
  ipcMain.handle('desktop:read-asset', async (_event, docPath, src) => {
    assertGranted(docPath);
    return readLocalAsset(String(docPath), String(src ?? ''));
  });

  ipcMain.handle('desktop:stat-file', async (_event, filePath) => {
    assertGranted(filePath);
    try {
      return { lastModified: (await stat(String(filePath))).mtimeMs };
    } catch {
      return null;
    }
  });

  ipcMain.handle('desktop:consume-pending-open', () => {
    rendererReady = true;
    const payload = pendingOpen;
    pendingOpen = null;
    return payload;
  });
}

// ===== 菜单 =====

function sendMenu(action) {
  if (mainWindow) mainWindow.webContents.send('desktop:menu', action);
}

function buildMenu() {
  return Menu.buildFromTemplate(nativeMenuTemplate(activeLocale, process.platform === 'darwin', sendMenu));
}

// ===== 窗口与生命周期 =====

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: '墨笺 Markdown',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true
    }
  });
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: desktopRequestHeaders(details, mainWindow, bridge.url, desktopCapability) });
  });
  protectWindowClose(mainWindow);
  mainWindow.webContents.on('did-start-loading', () => { rendererReady = false; });
  // 文章里的链接一律交给系统浏览器：target=_blank 不自开 Electron 窗口，
  // 普通链接不把编辑器导航走；http/https/mailto 之外的协议直接丢弃。
  const openExternally = (url) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin === new URL(bridge.url).origin && new URL(url).pathname === '/') return;
    } catch {}
    event.preventDefault();
    openExternally(url);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  // 直达编辑器（跳过落地页）。
  await mainWindow.loadURL(`${bridge.url}/#editor`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, cwd) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    collectMarkdownArgs(argv, cwd).forEach((filePath) => openExternalPath(filePath));
  });

  // macOS 双击 .md / 拖到 Dock 图标；ready 之前也可能触发，openExternalPath 会排队。
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    openExternalPath(filePath);
  });

  app.whenReady().then(async () => {
    try {
      activeLocale = initialDesktopLocale(null, app.getLocale());
      editorStateStore = createEditorStateStore(app.getPath('userData'), undefined, () => activeLocale);
      const savedState = editorStateStore.load();
      activeLocale = initialDesktopLocale(savedState.ok ? savedState.state : null, app.getLocale());
      aiSettingsStore = createSettingsStore(workspaceRoot(), {
        credentialAdapter: createSafeStorageAdapter({ safeStorage, app, platform: process.platform })
      });
      await loadGrantedPaths();
      bridge = await startAgentBridge({
        root: workspaceRoot(),
        staticDir: join(app.getAppPath(), 'dist'),
        cors: false,
        settingsStore: aiSettingsStore,
        desktopCapability
      });
    } catch (error) {
      dialog.showErrorBox(t('startupFailure'), error.message || String(error));
      app.quit();
      return;
    }
    registerIpcHandlers();
    Menu.setApplicationMenu(buildMenu());
    await createWindow();
    collectMarkdownArgs(process.argv, process.cwd()).forEach((filePath) => openExternalPath(filePath));
    app.on('activate', () => { if (!mainWindow) createWindow(); });
  });

  app.on('before-quit', () => { quittingRequested = true; });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
