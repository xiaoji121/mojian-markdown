// 桌面端 preload：把主进程的原生文件能力以 window.mojianDesktop 暴露给渲染层。
// 接口契约见 src/editor/desktopFileHandle.ts 的 MojianDesktopApi。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mojianDesktop', {
  readingFont: (operation, payload) => ipcRenderer.invoke('desktop:reading-font', operation, payload),
  aiSettings: (operation, payload) => ipcRenderer.invoke('desktop:ai-settings', operation, payload),
  loadEditorState: () => ipcRenderer.sendSync('desktop:load-editor-state'),
  saveEditorState: (state) => ipcRenderer.sendSync('desktop:save-editor-state', state),
  onBeforeClose: (callback) => {
    let activeToken = null;
    let previousInert = false;
    const restore = (_event, token) => {
      if (token !== activeToken) return;
      activeToken = null;
      if (typeof document !== 'undefined') document.documentElement.inert = previousInert;
    };
    const listener = async (_event, token) => {
      if (activeToken === null && typeof document !== 'undefined') {
        previousInert = document.documentElement.inert;
      }
      activeToken = token;
      if (typeof document !== 'undefined') document.documentElement.inert = true;
      let success = false;
      try { success = (await callback()) === true; } catch {}
      ipcRenderer.send('desktop:close-ready', token, success);
    };
    ipcRenderer.on('desktop:prepare-close', listener);
    ipcRenderer.on('desktop:close-cancelled', restore);
    return () => {
      ipcRenderer.removeListener('desktop:prepare-close', listener);
      ipcRenderer.removeListener('desktop:close-cancelled', restore);
      if (activeToken !== null) restore(null, activeToken);
    };
  },
  openMarkdownFile: () => ipcRenderer.invoke('desktop:open-file'),
  openMarkdownPath: (path) => ipcRenderer.invoke('desktop:open-file-path', path),
  readClipboardText: () => ipcRenderer.invoke('desktop:read-clipboard-text'),
  saveMarkdownFileAs: (suggestedName, content) =>
    ipcRenderer.invoke('desktop:save-file-as', suggestedName, content),
  readFile: (path) => ipcRenderer.invoke('desktop:read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('desktop:write-file', path, content),
  renameMarkdownFile: (path, name) => ipcRenderer.invoke('desktop:rename-file', path, name),
  statFile: (path) => ipcRenderer.invoke('desktop:stat-file', path),
  readAsset: (docPath, src) => ipcRenderer.invoke('desktop:read-asset', docPath, src),
  consumePendingOpen: () => ipcRenderer.invoke('desktop:consume-pending-open'),
  onMenu: (callback) => {
    ipcRenderer.on('desktop:menu', (_event, action) => callback(action));
  },
  onOpenPath: (callback) => {
    ipcRenderer.on('desktop:open-path', (_event, file) => callback(file));
  }
});
