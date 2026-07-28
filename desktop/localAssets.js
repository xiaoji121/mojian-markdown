// 桌面端本地图片资产读取：把 Markdown 里的相对路径图片解析到文档所在目录，
// 只放行常见图片扩展名，读出后编码为 data URL 供预览 <img> 直接展示。
// 授权校验（引用图片的文档必须是用户打开过的文件）由 main.js 的 IPC 层负责。
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
};

export async function readLocalAsset(docPath, src) {
  if (!docPath || !src) return null;
  let relative = String(src);
  try { relative = decodeURIComponent(relative); } catch {}
  const target = resolve(dirname(String(docPath)), relative);
  const mime = IMAGE_MIME[extname(target).toLowerCase()];
  if (!mime) return null;
  try {
    const bytes = await readFile(target);
    return { dataUrl: 'data:' + mime + ';base64,' + bytes.toString('base64') };
  } catch {
    return null;
  }
}
