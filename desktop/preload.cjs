// 桌面端 preload：把主进程的原生文件能力以 window.mojianDesktop 暴露给渲染层。
// 接口契约见 src/editor/desktopFileHandle.ts 的 MojianDesktopApi。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mojianDesktop', {
  openMarkdownFile: () => ipcRenderer.invoke('desktop:open-file'),
  openMarkdownPath: (path) => ipcRenderer.invoke('desktop:open-file-path', path),
  saveMarkdownFileAs: (suggestedName, content) =>
    ipcRenderer.invoke('desktop:save-file-as', suggestedName, content),
  readFile: (path) => ipcRenderer.invoke('desktop:read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('desktop:write-file', path, content),
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
