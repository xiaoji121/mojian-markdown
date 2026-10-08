# Canger JinKai 04

- Display name: 仓耳今楷 04
- WeRead font ID: `cejk`
- Source: `https://cdn.weread.qq.com/app/assets/app_fonts_web/cejk.zip`
- Source metadata: `https://weread.qq.com/feconfig/font/list?type=web_v2`
- Format: WOFF
- SHA-256: `92174bb9f750a3c67888c87246522b8118acd68fddd4e54770f1c951e726c0ad`

The source metadata marks this font as non-VIP. Usage and redistribution remain
subject to the font owner's and source platform's license terms.

## Fetching & Subsetting

- 字体文件不随仓库分发。运行 `npm run font:fetch` 会从上面的官方 CDN 下载
  `cejk.zip`、按 SHA-256 校验后把 `cejk.woff` 放入本目录，并自动裁剪出
  GB2312 字符集的 woff2 子集（约 2MB）写到 `public/fonts/canger-jinkai-04/`。
- 本目录的 `*.woff` 和 `public/fonts/` 已被 .gitignore 排除，请勿提交。
- 不获取字体时，界面自动回退到系统楷体（Kaiti SC / 楷体），功能不受影响。

## Local font preference

The application now prefers an already installed JinKai 04 W04 using a local-only
CSS face (`TsangerJinKai04-W04`, `TsangerJinKai04 W04`, or `仓耳今楷04 W04`).
This does not install fonts into the operating system or download them at startup.
If the local face cannot load, the existing system-font fallback remains usable.
Browser privacy restrictions may prevent detection even when a font is installed;
"not detected" therefore does not prove that it is absent.

For licensing and manual installation, see the foundry's product page:
https://www.tsanger.cn/product/43. Its personal noncommercial-use statement is not
an application redistribution license. The historical optional developer download
commands above do not grant embedding, subsetting or redistribution rights; their
output is no longer automatically loaded by the web application. Do not include
that output in distributed packages without appropriate authorization.
