// 把 16MB 的仓耳今楷 woff 裁剪成 GB2312 全字符集的 woff2 子集。
// 编辑器渲染的是用户任意输入，所以按固定字符集（GB2312 一、二级汉字
// 6763 个 + 符号区 + ASCII）裁剪，覆盖日常中文 99.8%+；生僻字由字体栈
// 里的系统楷体（Kaiti SC 等）逐字兜底。
// 结果是确定的：只有换字体源文件时才需要重跑（npm run font:subset），
// 生成的 public/fonts/**/cejk-subset.woff2 直接提交入库。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "fonts-src", "canger-jinkai-04", "cejk.woff");
const outputPath = path.join(root, "public", "fonts", "canger-jinkai-04", "cejk-subset.woff2");

function buildCharset() {
  const decoder = new TextDecoder("gb18030", { fatal: false });
  const chars = new Set();

  for (let code = 0x20; code <= 0x7e; code++) {
    chars.add(String.fromCharCode(code));
  }

  const addGbRange = (hiStart, hiEnd) => {
    for (let hi = hiStart; hi <= hiEnd; hi++) {
      for (let lo = 0xa1; lo <= 0xfe; lo++) {
        const char = decoder.decode(new Uint8Array([hi, lo]));
        if (char && char !== "�") {
          chars.add(char);
        }
      }
    }
  };

  addGbRange(0xa1, 0xa9); // GB2312 符号区：中文标点、全角字符等
  addGbRange(0xb0, 0xf7); // GB2312 一、二级汉字（6763 个）

  return chars;
}

const chars = buildCharset();
const source = await readFile(sourcePath);
const subset = await subsetFont(source, [...chars].join(""), { targetFormat: "woff2" });
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, subset);

console.log(
  `Font subset: ${chars.size} chars, ${(source.length / 1024 / 1024).toFixed(1)}MB -> ${(subset.length / 1024).toFixed(0)}KB -> ${path.relative(root, outputPath)}`
);
