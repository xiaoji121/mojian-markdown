// @ts-nocheck
// 「保存长图」：把预览原样渲染成一张可分享的长图。
//
// 做法是把预览节点搬进一张海报（页眉 · 正文 · 页脚），再交给 SVG <foreignObject>
// 让浏览器自己排版并光栅化——排版、字体、纸色都与预览同源，不另写一套渲染。
// 两条硬约束决定了这里的绕路：
//   1. SVG 作为 <img> 加载时是隔离上下文，拿不到页面的字体和图片，
//      @font-face 的 woff2 与远程图都必须先内联成 data URL；
//   2. 画布有单边与总面积上限，长文要按设备像素整切成多片分别光栅化再拼。
// 弹窗里的预览与最终长图共用同一份抽取出来的 CSS，所见即所得。
import {
  LONG_IMAGE_PRESETS,
  DEFAULT_LONG_IMAGE_PRESET,
  longImageWidth,
  pickLongImageScale,
  planLongImageTiles,
  longImageDate,
  longImageFileName,
  formatByteSize,
  extractPosterCss,
  collectCssVariableNames,
  cssVariableBlock
} from './longImageComposer.ts';

// 弹窗里海报缩略图的显示宽度（CSS px），两档宽度共用同一个视觉尺寸。
const STAGE_WIDTH = 360;

let posterFontCssPromise = null;

export class LongImageMethods {
  openLongImage() {
    const overlay = this._buildLongImageModal();
    overlay.style.display = 'flex';
    this._refreshLongImagePoster();
  }


  closeLongImage() {
    if (this._longImageEl) this._longImageEl.style.display = 'none';
  }


  setLongImageWidth(id) {
    if (this.longImageWidth === id) return;
    this.longImageWidth = id;
    this._persist();
    this._refreshLongImagePoster();
  }


  toggleLongImageMarks() {
    this.longImageMarks = !this.longImageMarks;
    this._persist();
    this._refreshLongImagePoster();
  }

  // ===== 弹窗骨架 =====

  _buildLongImageModal() {
    if (this._longImageEl) return this._longImageEl;
    const overlay = document.createElement('div');
    overlay.className = 'longimg-overlay';
    const modal = document.createElement('div');
    modal.className = 'longimg-modal';
    const box = document.createElement('div');
    box.className = 'longimg-stage-box';
    const stage = document.createElement('div');
    stage.className = 'longimg-stage';
    box.appendChild(stage);
    const wrap = document.createElement('div');
    wrap.className = 'longimg-stage-wrap';
    wrap.appendChild(box);
    modal.append(this._buildLongImageHead(), wrap, this._buildLongImageFoot());
    overlay.appendChild(modal);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.closeLongImage(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this._longImageEl) return;
      if (this._longImageEl.style.display !== 'flex') return;
      e.preventDefault();
      this.closeLongImage();
    });
    document.body.appendChild(overlay);
    this._longImageEl = overlay;
    this._longImageStageEl = stage;
    this._longImageBoxEl = box;
    return overlay;
  }


  _buildLongImageHead() {
    const head = document.createElement('div');
    head.className = 'longimg-modal-head';
    const title = document.createElement('strong');
    title.className = 'longimg-modal-title';
    title.textContent = '保存长图';
    const hint = document.createElement('p');
    hint.className = 'longimg-modal-hint';
    hint.textContent = '排版、字体与纸色都跟随预览；表格和代码会自动折行，不会被裁掉。';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'longimg-modal-close';
    close.textContent = '×';
    close.title = '关闭（Esc）';
    close.setAttribute('aria-label', '关闭');
    close.addEventListener('click', () => this.closeLongImage());
    head.append(title, hint, close);
    return head;
  }


  _buildLongImageFoot() {
    const foot = document.createElement('div');
    foot.className = 'longimg-modal-foot';
    const options = document.createElement('div');
    options.className = 'longimg-options';
    const widths = document.createElement('div');
    widths.className = 'longimg-segmented';
    widths.setAttribute('role', 'group');
    widths.setAttribute('aria-label', '长图宽度');
    LONG_IMAGE_PRESETS.forEach((preset) => widths.appendChild(this._longImageWidthOption(preset)));
    const marks = document.createElement('button');
    marks.type = 'button';
    marks.className = 'longimg-mark-toggle';
    marks.textContent = '含划线批注';
    marks.title = '关掉后导出干净的正文，不带划线和批注编号';
    marks.addEventListener('click', () => this.toggleLongImageMarks());
    options.append(widths, marks);
    const meta = document.createElement('span');
    meta.className = 'longimg-modal-meta';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'abtn primary longimg-save';
    save.textContent = '下载长图';
    save.addEventListener('click', () => this.downloadLongImage());
    foot.append(options, meta, save);
    this._longImageWidthsEl = widths;
    this._longImageMarksEl = marks;
    this._longImageMetaEl = meta;
    this._longImageSaveEl = save;
    return foot;
  }


  _longImageWidthOption(preset) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'longimg-segment';
    option.dataset.longimgWidth = preset.id;
    option.textContent = preset.label;
    option.title = preset.hint;
    option.addEventListener('click', () => this.setLongImageWidth(preset.id));
    return option;
  }


  _syncLongImageControls() {
    const active = this.longImageWidth || DEFAULT_LONG_IMAGE_PRESET;
    if (this._longImageWidthsEl) {
      this._longImageWidthsEl.querySelectorAll('[data-longimg-width]').forEach((option) => {
        const on = option.dataset.longimgWidth === active;
        option.classList.toggle('is-active', on);
        option.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    if (this._longImageMarksEl) {
      this._longImageMarksEl.classList.toggle('is-active', !!this.longImageMarks);
      this._longImageMarksEl.setAttribute('aria-pressed', this.longImageMarks ? 'true' : 'false');
    }
    if (this._longImageSaveEl) {
      this._longImageSaveEl.disabled = !!this._longImageBusy;
      if (!this._longImageBusy) this._longImageSaveEl.textContent = '下载长图';
    }
  }

  // ===== 海报节点 =====

  async _refreshLongImagePoster() {
    const stage = this._longImageStageEl;
    if (!stage) return;
    this._syncLongImageControls();
    this._ensurePosterStyle();
    const width = longImageWidth(this.longImageWidth || DEFAULT_LONG_IMAGE_PRESET);
    const poster = this._buildPosterNode(width);
    stage.replaceChildren(poster);
    stage.style.width = width + 'px';
    this._longImagePoster = poster;
    // 字体没就位时量到的高度会偏小，导致长图底部被切掉
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch {}
    }
    this._layoutLongImageStage();
  }


  _layoutLongImageStage() {
    const stage = this._longImageStageEl;
    const box = this._longImageBoxEl;
    const poster = this._longImagePoster;
    if (!stage || !box || !poster) return;
    const width = poster.offsetWidth || longImageWidth(this.longImageWidth);
    const height = poster.offsetHeight;
    const ratio = STAGE_WIDTH / width;
    // 缩放挂在 stage 上（海报本身不带 transform，序列化进 SVG 时才是原始尺寸）；
    // transform 不占布局，外层 box 显式占住缩放后的尺寸。
    stage.style.transform = 'scale(' + ratio + ')';
    box.style.width = Math.round(width * ratio) + 'px';
    box.style.height = Math.round(height * ratio) + 'px';
    this._updateLongImageMeta(width, height);
  }


  _updateLongImageMeta(width, height, bytes) {
    if (!this._longImageMetaEl) return;
    const scale = pickLongImageScale(width, height);
    if (!scale) {
      this._longImageMetaEl.textContent = '文章太长，超出画布上限 · 换「手机」宽度或拆篇再导出';
      return;
    }
    const parts = [
      Math.round(width * scale) + ' × ' + Math.round(height * scale) + ' px',
      scale + 'x'
    ];
    if (bytes) parts.push(formatByteSize(bytes));
    this._longImageMetaEl.textContent = parts.join(' · ');
  }


  _buildPosterNode(width) {
    const preview = this.previewRef.current;
    const poster = document.createElement('div');
    poster.className = 'longimg-poster';
    poster.style.width = width + 'px';
    // 正文与页眉页脚都按阅读字号缩放（页眉页脚用 em），长图与预览观感一致
    poster.style.fontSize = this.fontSize + 'px';
    const content = document.createElement('div');
    content.className = 'longimg-prose';
    content.innerHTML = preview ? preview.innerHTML : '';
    if (!this.longImageMarks) this._stripPosterMarks(content);
    const title = this._takePosterTitle(content);
    this._posterTitle = title;
    poster.append(this._buildPosterHead(title, content), content, this._buildPosterFoot());
    return poster;
  }


  // 正文首个 h1 升格为海报标题，避免长图顶部出现两个标题。
  _takePosterTitle(content) {
    const first = content.firstElementChild;
    if (first && first.tagName === 'H1') {
      const text = (first.textContent || '').trim();
      if (text) {
        first.remove();
        return text;
      }
    }
    return String(this.fileName || '').replace(/\.md$/i, '') || '未命名';
  }


  _stripPosterMarks(content) {
    content.querySelectorAll('[data-comment-badge]').forEach((badge) => badge.remove());
    content.querySelectorAll('[data-comment-id]').forEach((span) => {
      span.replaceWith(...span.childNodes);
    });
  }


  _buildPosterHead(title, content) {
    const head = document.createElement('div');
    head.className = 'longimg-head';
    const brand = document.createElement('div');
    brand.className = 'longimg-brand';
    brand.textContent = '墨笺 Markdown';
    const heading = document.createElement('h1');
    heading.className = 'longimg-title';
    heading.textContent = title;
    const rule = document.createElement('div');
    rule.className = 'longimg-rule';
    const meta = document.createElement('div');
    meta.className = 'longimg-meta';
    meta.textContent = this._posterMetaText(content);
    head.append(brand, heading, rule, meta);
    return head;
  }


  _posterMetaText(content) {
    const parts = [this._posterWordCount(content).toLocaleString('zh-CN') + ' 字'];
    if (this.longImageMarks) {
      const ids = new Set();
      content.querySelectorAll('[data-comment-id]')
        .forEach((span) => ids.add(span.getAttribute('data-comment-id')));
      if (ids.size) parts.push(ids.size + ' 处划线');
    }
    parts.push(longImageDate());
    return parts.join(' · ');
  }


  // 只数正文：mermaid 渲染出的 SVG 里塞着整段 <style>，textContent 会把 CSS 也算成字。
  _posterWordCount(content) {
    const clone = content.cloneNode(true);
    clone.querySelectorAll('svg, style, script').forEach((node) => node.remove());
    return (clone.textContent || '').replace(/\s/g, '').length;
  }


  _buildPosterFoot() {
    const foot = document.createElement('div');
    foot.className = 'longimg-foot';
    const left = document.createElement('span');
    left.textContent = '墨笺 Markdown · READ · ANNOTATE · SAVE';
    const right = document.createElement('span');
    right.textContent = this.fileName || '';
    foot.append(left, right);
    return foot;
  }

  // ===== 样式与资源内联 =====

  // 页面里的海报预览与 SVG 栅格共用这一份样式：先把当前主题/纸色的 CSS 变量
  // 落定成字面值，再抄一份预览排版规则（.md-preview → .longimg-prose）。
  _ensurePosterStyle() {
    if (!this._posterStyleEl) {
      this._posterStyleEl = document.createElement('style');
      this._posterStyleEl.setAttribute('data-longimg-style', '');
      document.head.appendChild(this._posterStyleEl);
    }
    const sheets = document.styleSheets;
    const computed = getComputedStyle(document.body);
    const variables = cssVariableBlock(
      '.longimg-poster',
      collectCssVariableNames(sheets),
      (name) => (computed.getPropertyValue(name) || '').trim()
    );
    this._posterCssText = variables + '\n' + extractPosterCss(sheets);
    this._posterStyleEl.textContent = this._posterCssText;
  }


  _posterFontCss() {
    if (!posterFontCssPromise) posterFontCssPromise = this._buildPosterFontCss();
    return posterFontCssPromise;
  }


  async _buildPosterFontCss() {
    const faces = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules = null;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules || [])) {
        if (rule && rule.style && !rule.selectorText && /^@font-face/.test(rule.cssText || '')) {
          faces.push(rule.cssText);
        }
      }
    }
    const inlined = await Promise.all(faces.map((face) => this._inlineFontFace(face)));
    return inlined.filter(Boolean).join('\n');
  }


  // 字体文件取不回来时整条 @font-face 丢掉，让 font-family 回退链接管系统楷体，
  // 而不是留一条指向取不到的 URL、在 SVG 里渲染成默认无衬线。
  async _inlineFontFace(cssText) {
    const match = /url\((['"]?)([^'")]+)\1\)/.exec(cssText);
    if (!match) return cssText;
    const dataUrl = await this._fetchAsDataUrl(match[2]);
    return dataUrl ? cssText.replace(match[0], 'url(' + dataUrl + ')') : '';
  }


  async _fetchAsDataUrl(url) {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) return '';
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  }


  // 取不回来的图（跨源、断链）换成一块占位：宁可写明缺图，也不留一段错位空白。
  async _inlinePosterImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(async (img) => {
      img.removeAttribute('srcset');
      img.removeAttribute('loading');
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;
      const dataUrl = await this._fetchAsDataUrl(src);
      if (dataUrl) {
        img.setAttribute('src', dataUrl);
        return;
      }
      const missing = document.createElement('div');
      missing.className = 'longimg-missing';
      missing.textContent = '图片未能载入 · ' + (img.getAttribute('alt') || src);
      img.replaceWith(missing);
    }));
  }

  // ===== 光栅化与下载 =====

  async downloadLongImage() {
    if (this._longImageBusy || !this._longImagePoster) return;
    this._longImageBusy = true;
    this._syncLongImageControls();
    try {
      const result = await this._rasterizePoster(this._longImagePoster, (done, total) => {
        if (!this._longImageSaveEl) return;
        this._longImageSaveEl.textContent = total > 1
          ? '正在生成 ' + (done + 1) + '/' + total + '…'
          : '正在生成…';
      });
      const blob = await new Promise((resolve) => result.canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('长图导出失败 · 图片超出浏览器可编码的上限');
      const name = longImageFileName(this._posterTitle, longImageDate());
      this._saveLongImageBlob(blob, name);
      this._updateLongImageMeta(result.width, result.height, blob.size);
      this._setStatus('✓ 已保存长图 ' + name + ' · ' + formatByteSize(blob.size));
      this.closeLongImage();
    } catch (error) {
      const message = (error && error.message) || '长图生成失败';
      if (this._longImageMetaEl) this._longImageMetaEl.textContent = message;
      this._setStatus(message);
    } finally {
      this._longImageBusy = false;
      this._syncLongImageControls();
    }
  }


  _saveLongImageBlob(blob, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }


  async _rasterizePoster(poster, onProgress) {
    const width = poster.offsetWidth;
    const height = poster.offsetHeight;
    const scale = pickLongImageScale(width, height);
    if (!scale) throw new Error('文章太长，超出画布上限 · 换「手机」宽度或拆篇再导出');
    const clone = poster.cloneNode(true);
    await this._inlinePosterImages(clone);
    const css = (await this._posterFontCss()) + '\n' + (this._posterCssText || '');
    const markup = new XMLSerializer().serializeToString(clone);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    // 先铺满纸色：切片高度取整后末尾可能差一两个像素，别露出透明底
    context.fillStyle = this._posterPaperColor();
    context.fillRect(0, 0, canvas.width, canvas.height);
    const tiles = planLongImageTiles(height, scale);
    for (let index = 0; index < tiles.length; index += 1) {
      onProgress(index, tiles.length);
      const image = await this._loadPosterTile(tiles[index], { width, scale, css, markup });
      context.drawImage(image, 0, Math.round(tiles[index].top * scale));
    }
    return { canvas, width, height, scale };
  }


  _posterPaperColor() {
    const value = getComputedStyle(document.body).getPropertyValue('--paper-bg');
    return (value || '').trim() || '#ffffff';
  }


  // 一片切片 = 一张按设备像素定尺、viewBox 回到 CSS px 的 SVG：
  // viewBox 缩放让 foreignObject 里的文字直接以输出分辨率光栅化，不是放大位图。
  // 必须走 data: URL —— Chrome 把 blob: 来源的 SVG 视为跨源，画上去的画布会被污染，
  // 随后 toBlob 直接抛 "Tainted canvases may not be exported"。
  _loadPosterTile(tile, options) {
    const { width, scale, css, markup } = options;
    const widthPx = Math.round(width * scale);
    const heightPx = Math.ceil(tile.height * scale);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + widthPx + '" height="' + heightPx
      + '" viewBox="0 0 ' + width + ' ' + (heightPx / scale) + '">'
      + '<foreignObject x="0" y="0" width="100%" height="100%">'
      + '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + width + 'px">'
      + '<style><![CDATA[' + String(css).replace(/\]\]>/g, '') + ']]></style>'
      + '<div style="transform:translateY(' + -tile.top + 'px)">' + markup + '</div>'
      + '</div></foreignObject></svg>';
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('长图渲染失败 · 请稍后重试'));
      image.src = url;
    });
  }
}
