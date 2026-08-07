// 墨笺 Markdown 桌面端（Electron 主进程）。
// 职责：
//   1. 内嵌启动 Agent Bridge——随机端口 + 静态托管 dist，前端与 API 同源，
//      不再暴露带 CORS 的固定本机端口；
//   2. 原生文件对话框与读写——真实绝对路径，授权一次永久有效
//      （授权清单持久化在 userData，重启后恢复的文档仍可直接同步）；
//   3. 应用菜单、macOS「双击 .md 打开」、单实例与命令行参数接管。
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAgentBridge } from '../scripts/agent-bridge.js';
import { readLocalAsset } from './localAssets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

// 自动化测试隔离用户数据目录（含授权清单）；必须在 ready 之前设置。
if (process.env.MOJIAN_USER_DATA) app.setPath('userData', process.env.MOJIAN_USER_DATA);

let mainWindow = null;
let bridge = null;
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
  writeFile(grantsFile(), JSON.stringify([...grantedPaths], null, 2)).catch(() => {});
}

function assertGranted(filePath) {
  if (!grantedPaths.has(resolve(String(filePath)))) {
    throw new Error('未授权的文件路径：' + filePath);
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
  ipcMain.handle('desktop:open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
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
    if (!isAbsolute(filePath)) throw new Error('请输入文件的绝对路径');
    if (!MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase())) {
      throw new Error('仅支持 .md、.markdown 或 .txt 文件');
    }
    const normalized = resolve(filePath);
    const picked = await readPickedFile(normalized);
    grantPath(normalized);
    return picked;
  });

  ipcMain.handle('desktop:save-file-as', async (_event, suggestedName, content) => {
    const result = await dialog.showSaveDialog(mainWindow, {
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

  ipcMain.handle('desktop:write-file', async (_event, filePath, content) => {
    assertGranted(filePath);
    await writeFile(String(filePath), String(content ?? ''), 'utf8');
    return { lastModified: (await stat(String(filePath))).mtimeMs };
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
  const isMac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new') },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open') },
        { label: '输入绝对路径打开…', click: () => sendMenu('open-path') },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('save-as') },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
      ]
    },
    {
      // 撤销/重做由编辑器自带的历史系统处理（⌘Z 直达渲染层），菜单只补齐剪贴板项。
      label: '编辑',
      submenu: [
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    { role: 'windowMenu', label: '窗口' }
  ]);
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
    if (url.startsWith(bridge.url)) return;
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
      await loadGrantedPaths();
      bridge = await startAgentBridge({
        root: workspaceRoot(),
        staticDir: join(app.getAppPath(), 'dist'),
        cors: false
      });
    } catch (error) {
      dialog.showErrorBox('墨笺 Markdown 启动失败', error.message || String(error));
      app.quit();
      return;
    }
    registerIpcHandlers();
    Menu.setApplicationMenu(buildMenu());
    await createWindow();
    collectMarkdownArgs(process.argv, process.cwd()).forEach((filePath) => openExternalPath(filePath));
    app.on('activate', () => { if (!mainWindow) createWindow(); });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
