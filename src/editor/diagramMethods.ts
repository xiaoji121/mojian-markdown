// @ts-nocheck

let mermaidReady = false;
let mermaidRenderCount = 0;
let mermaidModulePromise = null;
let mermaidThemeKey = '';

export class DiagramMethods {
  _renderMermaidDiagrams(root) {
    const batch = ++this._mermaidBatch;
    root.querySelectorAll('pre code').forEach((code, index) => {
      const source = code.textContent || '';
      if (!this._isMermaidCodeBlock(code, source)) return;
      this._replaceMermaidBlock(code, this._normalizeMermaidSource(source), batch, index);
    });
  }

  _isMermaidCodeBlock(code, source) {
    const className = code.className || '';
    if (/\blanguage-mermaid\b/i.test(className)) return true;
    return /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context)\b/i.test(source);
  }

  async _replaceMermaidBlock(code, source, batch, index) {
    const pre = code.closest('pre');
    if (!pre || !pre.parentNode) return;
    const host = document.createElement('div');
    host.className = 'mermaid-rendered is-loading';
    host.textContent = '正在渲染流程图…';
    pre.replaceWith(host);
    try {
      const mermaid = await this._loadMermaid();
      const id = 'mermaid-' + Date.now() + '-' + batch + '-' + index + '-' + (++mermaidRenderCount);
      const result = await mermaid.render(id, source);
      if (batch !== this._mermaidBatch || !host.isConnected) return;
      host.classList.remove('is-loading');
      host.innerHTML = result.svg;
      if (result.bindFunctions) result.bindFunctions(host);
    } catch (error) {
      host.classList.remove('is-loading');
      host.classList.add('has-error');
      host.textContent = 'Mermaid 渲染失败：' + (error?.message || String(error));
    }
  }

  async _loadMermaid() {
    if (!mermaidModulePromise) mermaidModulePromise = import('mermaid').then((mod) => mod.default);
    const mermaid = await mermaidModulePromise;
    const themeKey = this.theme || 'dark';
    if (!mermaidReady || mermaidThemeKey !== themeKey) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: themeKey === 'light' ? 'base' : 'dark',
        themeVariables: this._mermaidThemeVariables()
      });
      mermaidReady = true;
      mermaidThemeKey = themeKey;
    }
    return mermaid;
  }

  _normalizeMermaidSource(source) {
    return String(source || '').replace(/→/g, '-->');
  }

  _mermaidThemeVariables() {
    // 取自 src/theme/tokens.css 的当前主题值，避免复制第二份色板
    const styles = getComputedStyle(document.body);
    const token = (name, fallback) => (styles.getPropertyValue(name) || '').trim() || fallback;
    return {
      background: token('--bg', '#14110d'),
      primaryColor: token('--bg-2', '#1c1814'),
      primaryBorderColor: token('--border', '#322a22'),
      primaryTextColor: token('--text', '#f4ebd9'),
      lineColor: token('--accent', '#f0a838'),
      secondaryColor: token('--bg-3', '#161310'),
      tertiaryColor: token('--bg', '#14110d'),
      fontFamily: token('--sans', 'Inter Tight, Noto Sans SC, sans-serif')
    };
  }
}
