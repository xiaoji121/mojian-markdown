// 本地文件/文件夹句柄持久化。File System Access API 的句柄可结构化克隆，
// 存进 IndexedDB 后，刷新页面或从最近文档列表重开时可以恢复与本地文件的关联；
// 文件夹句柄用于把文件解析成「文件夹名/相对路径」展示。
// 环境不支持（无 indexedDB、句柄不可克隆）时静默降级为不持久化。

const DB_NAME = 'mojian-local-files';
const DB_VERSION = 2;
const FILE_STORE = 'file-handles';
const FOLDER_STORE = 'folder-handles';

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
        if (!db.objectStoreNames.contains(FOLDER_STORE)) db.createObjectStore(FOLDER_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> {
  return openDatabase().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const request = run(db.transaction(storeName, mode).objectStore(storeName));
        request.onsuccess = () => { db.close(); resolve(request.result as T); };
        request.onerror = () => { db.close(); resolve(null); };
      } catch {
        db.close();
        resolve(null);
      }
    });
  });
}

// getAllKeys/getAll 都按键升序返回，一一对应组成 {name, handle} 列表。
async function listEntries(storeName: string): Promise<Array<{ name: string; handle: unknown }>> {
  const keys = await withStore<IDBValidKey[]>(storeName, 'readonly', (store) => store.getAllKeys());
  const values = await withStore<unknown[]>(storeName, 'readonly', (store) => store.getAll());
  if (!keys || !values || keys.length !== values.length) return [];
  return keys.map((key, index) => ({ name: String(key), handle: values[index] }));
}

export async function saveFileHandle(fileName: string, handle: unknown): Promise<void> {
  if (!fileName) return;
  await withStore(FILE_STORE, 'readwrite', (store) => store.put(handle, fileName));
}

export async function loadFileHandle(fileName: string): Promise<unknown> {
  if (!fileName) return null;
  return withStore(FILE_STORE, 'readonly', (store) => store.get(fileName));
}

export async function deleteFileHandle(fileName: string): Promise<void> {
  if (!fileName) return;
  await withStore(FILE_STORE, 'readwrite', (store) => store.delete(fileName));
}

export function listFileHandles(): Promise<Array<{ name: string; handle: unknown }>> {
  return listEntries(FILE_STORE);
}

export async function saveFolderHandle(name: string, handle: unknown): Promise<void> {
  if (!name) return;
  await withStore(FOLDER_STORE, 'readwrite', (store) => store.put(handle, name));
}

export function loadFolderHandles(): Promise<Array<{ name: string; handle: unknown }>> {
  return listEntries(FOLDER_STORE);
}
