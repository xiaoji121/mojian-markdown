// 桌面端（Electron）本地文件句柄：实现 File System Access API 句柄的最小接口，
// 底层经 preload 暴露的 window.mojianDesktop 走主进程 Node fs。
// 与 localFileSyncMethods 的既有同步逻辑完全兼容，同时补上网页版做不到的部分：
// 真实绝对路径、授权一次永久有效（IndexedDB 只存 {desktopPath, name} 纯标记）。

export interface DesktopPickedFile { path: string; name: string; content: string; lastModified: number; }
export interface DesktopSavedFile { path: string; name: string; lastModified: number; }

export interface MojianDesktopApi {
  openMarkdownFile(): Promise<DesktopPickedFile | null>;
  openMarkdownPath(path: string): Promise<DesktopPickedFile | null>;
  readClipboardText(): Promise<string>;
  saveMarkdownFileAs(suggestedName: string, content: string): Promise<DesktopSavedFile | null>;
  readFile(path: string): Promise<{ content: string; lastModified: number } | null>;
  writeFile(path: string, content: string): Promise<{ lastModified: number }>;
  statFile(path: string): Promise<{ lastModified: number } | null>;
  readAsset(docPath: string, src: string): Promise<{ dataUrl: string } | null>;
  consumePendingOpen(): Promise<DesktopPickedFile | null>;
  onMenu(callback: (action: string) => void): void;
  onOpenPath(callback: (file: DesktopPickedFile) => void): void;
}

function desktopApi(): MojianDesktopApi | null {
  if (typeof window === 'undefined') return null;
  return (window as { mojianDesktop?: MojianDesktopApi }).mojianDesktop || null;
}

function requireDesktopApi(): MojianDesktopApi {
  const api = desktopApi();
  if (!api) throw new Error('桌面环境不可用');
  return api;
}

export function createDesktopFileHandle(desktopPath: string, name: string) {
  return {
    kind: 'file' as const,
    name,
    desktopPath,
    async getFile() {
      const api = requireDesktopApi();
      const stat = await api.statFile(desktopPath);
      if (!stat) throw new Error('文件不存在：' + desktopPath);
      return {
        name,
        lastModified: stat.lastModified,
        // 懒读正文：变更轮询只看 lastModified，避免每次读全文。
        text: async () => {
          const data = await api.readFile(desktopPath);
          if (!data) throw new Error('文件不可读：' + desktopPath);
          return data.content;
        }
      };
    },
    async createWritable() {
      let buffer = '';
      return {
        write: async (content: string) => { buffer = content; },
        close: async () => { await requireDesktopApi().writeFile(desktopPath, buffer); }
      };
    },
    async queryPermission() { return 'granted' as const; },
    async requestPermission() { return 'granted' as const; }
  };
}

export type DesktopFileHandle = ReturnType<typeof createDesktopFileHandle>;

function storedDesktopPath(value: unknown): string {
  const marker = value as { desktopPath?: unknown } | null;
  return marker && typeof marker.desktopPath === 'string' ? marker.desktopPath : '';
}

// IndexedDB 无法结构化克隆自定义句柄；存纯标记，读取时复原为可用句柄。
export function toStorable(handle: unknown): unknown {
  const path = storedDesktopPath(handle);
  if (!path) return handle;
  return { desktopPath: path, name: (handle as { name?: string }).name || '' };
}

export function fromStorable(stored: unknown): unknown {
  const path = storedDesktopPath(stored);
  if (!path) return stored;
  if (!desktopApi()) return null;
  return createDesktopFileHandle(path, (stored as { name?: string }).name || '');
}
