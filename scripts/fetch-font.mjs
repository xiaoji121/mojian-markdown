// 下载仓耳今楷 04 字体并校验（可选步骤）。
// 字体不随仓库分发：源文件来自微信读书官方 CDN（见 fonts-src/canger-jinkai-04/SOURCE.md），
// 使用与再分发受字体所有者许可条款约束。不下载字体项目也能运行，
// 界面会回退到系统楷体（Kaiti SC / 楷体）。
// 用法：npm run font:fetch  （下载 + 校验 + 自动裁剪出 GB2312 子集）
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const SOURCE_URL = "https://cdn.weread.qq.com/app/assets/app_fonts_web/cejk.zip";
const SOURCE_SHA256 = "92174bb9f750a3c67888c87246522b8118acd68fddd4e54770f1c951e726c0ad";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(root, "fonts-src", "canger-jinkai-04", "cejk.woff");

async function findWoff(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findWoff(full);
      if (found) return found;
    } else if (entry.name.endsWith(".woff")) {
      return full;
    }
  }
  return null;
}

console.log(`Downloading ${SOURCE_URL} ...`);
const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Download failed: HTTP ${response.status}`);
}
const zipBuffer = Buffer.from(await response.arrayBuffer());

const tmpDir = await import("node:fs/promises").then((fs) => fs.mkdtemp(path.join(os.tmpdir(), "cejk-")));
const zipPath = path.join(tmpDir, "cejk.zip");
await writeFile(zipPath, zipBuffer);
await execFileAsync("unzip", ["-o", zipPath, "-d", tmpDir]);

const woffPath = await findWoff(tmpDir);
if (!woffPath) {
  throw new Error("No .woff file found in downloaded archive");
}

const woff = await readFile(woffPath);
const hash = createHash("sha256").update(woff).digest("hex");
if (hash !== SOURCE_SHA256) {
  throw new Error(`SHA-256 mismatch: expected ${SOURCE_SHA256}, got ${hash}`);
}

await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(targetPath, woff);
await rm(tmpDir, { recursive: true, force: true });

console.log(`Saved ${(woff.length / 1024 / 1024).toFixed(1)}MB font to ${path.relative(root, targetPath)} (sha256 verified)`);
