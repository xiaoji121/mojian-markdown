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
    const paperKey = document.body.getAttribute('data-paper') || 'ink';
    const themeKey = (this.theme || 'dark') + ':' + paperKey;
    if (!mermaidReady || mermaidThemeKey !== themeKey) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: paperKey === 'ink' ? 'dark' : 'base',
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
    // 图渲染在纸面上：取 tokens.css 的 --paper-* 当前值，避免复制第二份色板
    const styles = getComputedStyle(document.body);
    const token = (name, fallback) => (styles.getPropertyValue(name) || '').trim() || fallback;
    return {
      background: token('--paper-bg', '#1c1a17'),
      primaryColor: token('--paper-code', '#24211d'),
      primaryBorderColor: token('--paper-border', '#3a332a'),
      primaryTextColor: token('--paper-text', '#f2ecdf'),
      lineColor: token('--paper-accent', '#f0a838'),
      secondaryColor: token('--paper-bg-soft', '#211e1a'),
      tertiaryColor: token('--paper-bg', '#1c1a17'),
      fontFamily: token('--sans', 'Inter Tight, Noto Sans SC, sans-serif')
    };
  }
}
