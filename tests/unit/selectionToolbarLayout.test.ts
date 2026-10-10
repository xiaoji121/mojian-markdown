import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  planSelectionToolbarLayout,
  selectionToolbarBudgetWidth,
  visibleSelTools,
  SEL_TOOL_PRIORITY,
  SEL_TOOLBAR_DEFAULTS
} from '../../src/editor/selectionToolbarLayout.ts';

const tw = () => SEL_TOOLBAR_DEFAULTS.toolWidth;

function plan(partial: Partial<Parameters<typeof planSelectionToolbarLayout>[0]> = {}) {
  return planSelectionToolbarLayout({
    availableWidth: 640,
    annotateWidth: SEL_TOOLBAR_DEFAULTS.annotateWidth,
    toolWidth: tw,
    dividerWidth: SEL_TOOLBAR_DEFAULTS.dividerWidth,
    moreWidth: SEL_TOOLBAR_DEFAULTS.moreWidth,
    chromePad: SEL_TOOLBAR_DEFAULTS.chromePad,
    bridgeOnline: true,
    ...partial
  });
}

test('priority order is copy → translate → askAI → image', () => {
  assert.deepEqual([...SEL_TOOL_PRIORITY], ['copy', 'translate', 'askAI', 'image']);
});

test('no Bridge hides translate and askAI from candidates', () => {
  assert.deepEqual(visibleSelTools(false), ['copy', 'image']);
  assert.deepEqual(visibleSelTools(true), ['copy', 'translate', 'askAI', 'image']);
});

test('budget width uses min(window, pane) minus side pads', () => {
  assert.equal(
    selectionToolbarBudgetWidth({ windowWidth: 1280, paneWidth: 207, sidePad: 8 }),
    207 - 16
  );
  assert.equal(
    selectionToolbarBudgetWidth({ windowWidth: 333, paneWidth: 333, sidePad: 8 }),
    333 - 16
  );
  assert.equal(
    selectionToolbarBudgetWidth({ windowWidth: 900, paneWidth: null, sidePad: 8 }),
    900 - 16
  );
  assert.equal(
    selectionToolbarBudgetWidth({ windowWidth: 800, paneWidth: 1200, sidePad: 8 }),
    800 - 16
  );
});

test('wide bar promotes all tools and hides more', () => {
  const p = plan({ availableWidth: 900, bridgeOnline: true });
  assert.equal(p.wrap, false);
  assert.equal(p.showMore, false);
  assert.deepEqual(p.main, ['copy', 'translate', 'askAI', 'image']);
  assert.deepEqual(p.overflow, []);
});

test('wide bar without Bridge still promotes copy (and image); no askAI/translate', () => {
  const p = plan({ availableWidth: 900, bridgeOnline: false });
  assert.equal(p.showMore, false);
  assert.deepEqual(p.main, ['copy', 'image']);
  assert.deepEqual(p.overflow, []);
});

test('medium width keeps copy on main; lower priority goes to overflow', () => {
  // base≈244, +divider7 +copy58 = 309; room for maybe one more before needing more btn
  // available such that copy fits but not all four tools
  const annotate = 232;
  const chrome = 12;
  const div = 7;
  const tool = 58;
  const more = 58;
  // budget after annotate: need copy on main, rest overflow
  // oneRowCopy = 12+232+7+58 = 309
  // toolsBudget for 400 width = 400-244 = 156
  // all four = 7+58*4 = 239 > 156 → need more
  // left after reserve more+div = 156-7-58 = 91 → one tool (copy)
  const p = plan({
    availableWidth: 400,
    annotateWidth: annotate,
    chromePad: chrome,
    dividerWidth: div,
    moreWidth: more,
    toolWidth: () => tool,
    bridgeOnline: true
  });
  assert.equal(p.wrap, false);
  assert.ok(p.main.includes('copy'), 'copy must be on main when space allows');
  assert.equal(p.main[0], 'copy');
  assert.equal(p.showMore, true);
  assert.ok(p.overflow.length > 0);
  assert.ok(!p.overflow.includes('copy'));
});

test('never leave empty room for next candidate while showing more', () => {
  const tool = 58;
  const p = plan({
    availableWidth: 400,
    annotateWidth: 232,
    chromePad: 12,
    dividerWidth: 7,
    moreWidth: 58,
    toolWidth: () => tool,
    bridgeOnline: true
  });
  // After placing main + more, leftover should be < one tool width
  const base = 12 + 232;
  const used =
    base +
    7 +
    p.main.length * tool +
    (p.showMore ? 58 : 0);
  const leftover = 400 - used;
  assert.ok(leftover < tool, `leftover ${leftover} should be < tool ${tool}`);
});

test('when oneRowCopy fits but more-reserve would drop copy, wrap keeps copy on main', () => {
  // Mirrors QA ≈333px / measured annotate≈208 / tool≈58:
  // oneRowCopy fits, but after reserving「更多」copy would overflow → must not stuff copy into more.
  const annotate = 208;
  const chrome = 12;
  const div = 7;
  const tool = 58;
  const more = 58;
  const availableWidth = 317; // 333 - 16 side pads
  const oneRowCopy = chrome + annotate + div + tool; // 285
  assert.ok(availableWidth >= oneRowCopy);
  const toolsBudget = availableWidth - (chrome + annotate); // 97
  // allNeed copy+image = 7+116 = 123 > 97; left after more = 97-7-58 = 32 < 58
  const p = plan({
    availableWidth,
    annotateWidth: annotate,
    chromePad: chrome,
    dividerWidth: div,
    moreWidth: more,
    toolWidth: () => tool,
    bridgeOnline: false
  });
  assert.equal(p.wrap, true, 'should wrap rather than hide copy behind more');
  assert.ok(p.main.includes('copy'), 'copy stays on main (row2)');
  assert.equal(p.main[0], 'copy');
  assert.ok(!p.overflow.includes('copy'));
});

test('pane-narrow budget (~207) forces wrap even if window is wide', () => {
  const availableWidth = selectionToolbarBudgetWidth({
    windowWidth: 1280,
    paneWidth: 207,
    sidePad: 8
  });
  assert.equal(availableWidth, 191);
  const p = plan({
    availableWidth,
    annotateWidth: 208,
    chromePad: 12,
    dividerWidth: 7,
    moreWidth: 52,
    toolWidth: () => 52,
    bridgeOnline: false
  });
  assert.equal(p.wrap, true);
  assert.ok(p.main.includes('copy') || p.overflow.includes('copy'));
  // annotate stays out of overflow by contract (caller); copy prefers main of row2
  if (p.main.length) assert.equal(p.main[0], 'copy');
});

test('narrow width wraps; copy prefers row2 before overflow', () => {
  // oneRowCopy = 12+232+7+58 = 309; use 280 → wrap
  const p = plan({
    availableWidth: 280,
    annotateWidth: 232,
    chromePad: 12,
    dividerWidth: 7,
    moreWidth: 58,
    toolWidth: () => 58,
    bridgeOnline: true
  });
  assert.equal(p.wrap, true);
  // row2 budget = 280-12 = 268; all 4 = 232, with more reserve...
  // allNeed with divider 0 = 232; 232 <= 268 → all on main, no more
  assert.ok(p.main.includes('copy'));
  assert.equal(p.main[0], 'copy');
});

test('very narrow: copy may stay on main of row2 while image overflows', () => {
  // row2 budget small
  const p = plan({
    availableWidth: 200,
    annotateWidth: 232,
    chromePad: 12,
    dividerWidth: 7,
    moreWidth: 58,
    toolWidth: () => 58,
    bridgeOnline: true
  });
  assert.equal(p.wrap, true);
  // budget 188; allNeed 232 > 188 → reserve more: left = 188-58 = 130 → two tools
  assert.equal(p.main[0], 'copy');
  assert.equal(p.showMore, true);
  assert.ok(p.overflow.includes('image'));
});

test('index.html marks annotate + data-seltool ids and main-tools slot', () => {
  const html = readFileSync(resolve('index.html'), 'utf8');
  assert.match(html, /data-sel-annotate="marker"/);
  assert.match(html, /data-sel-annotate="idea"/);
  assert.match(html, /class="seltool-main-tools"/);
  assert.match(html, /seltool-tools-divider/);
  assert.match(html, /data-seltool="copy"/);
  assert.match(html, /data-seltool="translate"/);
  assert.match(html, /data-seltool="askAI"/);
  assert.match(html, /data-seltool="image"/);
  // overflow wrap starts hidden (shown only when needed)
  assert.match(html, /class="seltool-overflow" hidden/);
});

test('CSS: selection toolbar max-width and wrap class; no overflow-x auto', () => {
  const shell = readFileSync(resolve('src/editor/shell.css'), 'utf8');
  const styles = readFileSync(resolve('src/editor/styles.css'), 'utf8');
  assert.match(shell, /\.selection-toolbar\s*\{[^}]*max-width:\s*calc\(100vw - 16px\)/s);
  assert.match(shell, /\.selection-toolbar\.is-wrapped/);
  assert.match(shell, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(styles, /\.selection-toolbar\s*\{[^}]*overflow-x:\s*auto/s);
});

test('layout is invoked when selection bar shows', () => {
  const src = readFileSync(resolve('src/editor/commentMethods.ts'), 'utf8');
  assert.match(src, /_layoutSelectionToolbar/);
  const logic = readFileSync(resolve('src/editor/MarkdownEditorLogic.ts'), 'utf8');
  assert.match(logic, /SelectionToolbarMethods/);
});

test('_layoutSelectionToolbar promotes copy and hides more when wide + no Bridge', async () => {
  const { SelectionToolbarMethods } = await import('../../src/editor/selectionToolbarMethods.ts');

  function el(tag: string, attrs: Record<string, string> = {}, kids: any[] = []) {
    const node: any = {
      tagName: tag.toUpperCase(),
      className: attrs.class || '',
      hidden: attrs.hidden === '' || attrs.hidden === 'true',
      style: {} as Record<string, string>,
      parentElement: null as any,
      children: [] as any[],
      attributes: { ...attrs },
      offsetWidth: Number(attrs['data-w'] || 58),
      clientWidth: Number(attrs['data-cw'] || 0),
      textContent: '',
      setAttribute(k: string, v: string) { this.attributes[k] = v; },
      getAttribute(k: string) { return this.attributes[k] ?? null; },
      removeAttribute(k: string) { delete this.attributes[k]; },
      classList: {
        _s: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
        toggle(name: string, on?: boolean) {
          if (on) this._s.add(name); else this._s.delete(name);
          this.className = [...this._s].join(' ');
        },
        contains(name: string) { return this._s.has(name); }
      },
      querySelector(sel: string) {
        const all = collect(this);
        return all.find((n) => match(n, sel)) || null;
      },
      querySelectorAll(sel: string) {
        return collect(this).filter((n) => match(n, sel));
      },
      closest(sel: string) {
        let n: any = this;
        while (n) {
          if (match(n, sel)) return n;
          n = n.parentElement;
        }
        return null;
      },
      appendChild(child: any) {
        if (child.parentElement) {
          const arr = child.parentElement.children;
          const i = arr.indexOf(child);
          if (i >= 0) arr.splice(i, 1);
        }
        child.parentElement = this;
        this.children.push(child);
        return child;
      }
    };
    for (const k of kids) node.appendChild(k);
    return node;
  }

  function collect(root: any): any[] {
    const out = [root];
    for (const c of root.children || []) out.push(...collect(c));
    return out;
  }

  function match(n: any, sel: string) {
    if (sel.startsWith('.')) return (n.className || '').split(/\s+/).includes(sel.slice(1));
    if (sel.startsWith('[') && sel.includes('=')) {
      const m = sel.match(/\[([^=]+)="([^"]+)"\]/);
      if (!m) return false;
      return n.getAttribute(m[1]) === m[2];
    }
    return false;
  }

  const copy = el('button', { class: 'seltool', 'data-seltool': 'copy', 'data-w': '58' });
  const image = el('button', { class: 'seltool selection-image-entry', 'data-seltool': 'image', 'data-w': '58' });
  const translate = el('button', { class: 'seltool translate-entry', 'data-seltool': 'translate', 'data-w': '58' });
  const askAI = el('button', { class: 'seltool ai-entry', 'data-seltool': 'askAI', 'data-w': '58' });
  const menu = el('div', { class: 'seltool-overflow-menu' }, [copy, translate, askAI, image]);
  const more = el('button', { class: 'seltool seltool-more', 'data-w': '58' });
  const overflow = el('span', { class: 'seltool-overflow' }, [more, menu]);
  const mainSlot = el('span', { class: 'seltool-main-tools' });
  const divider = el('span', { class: 'seltool-divider seltool-tools-divider' });
  const a1 = el('button', { class: 'seltool', 'data-sel-annotate': 'marker', 'data-w': '58' });
  const a2 = el('button', { class: 'seltool', 'data-sel-annotate': 'wavy', 'data-w': '58' });
  const a3 = el('button', { class: 'seltool', 'data-sel-annotate': 'straight', 'data-w': '58' });
  const a4 = el('button', { class: 'seltool', 'data-sel-annotate': 'idea', 'data-w': '58' });
  const bar = el('div', { class: 'selection-toolbar' }, [a1, a2, a3, a4, divider, mainSlot, overflow]);

  const prevWin = globalThis.window;
  // @ts-ignore
  globalThis.window = { innerWidth: 900 };
  try {
    const editor = Object.assign(new SelectionToolbarMethods(), {
      agentBridgeEnabled: false,
      selBarRef: { current: bar },
      previewPaneRef: { current: el('section', { class: 'preview-pane', 'data-cw': '900' }) },
      previewRef: { current: null }
    });
    editor._layoutSelectionToolbar();
    assert.equal(copy.parentElement, mainSlot, 'copy promoted to main');
    assert.equal(image.parentElement, mainSlot, 'image promoted when no Bridge and wide');
    assert.equal(translate.hidden, true);
    assert.equal(askAI.hidden, true);
    assert.equal(overflow.hidden, true, '更多 hidden when overflow empty');
    assert.equal(more.hidden, true);
    assert.equal(divider.hidden, false);
    assert.equal(bar.style.maxWidth, '884px'); // 900 - 16
  } finally {
    // @ts-ignore
    globalThis.window = prevWin;
  }
});

test('_layoutSelectionToolbar uses pane width not window when preview is narrow', async () => {
  const { SelectionToolbarMethods } = await import('../../src/editor/selectionToolbarMethods.ts');

  function el(tag: string, attrs: Record<string, string> = {}, kids: any[] = []) {
    const node: any = {
      tagName: tag.toUpperCase(),
      className: attrs.class || '',
      hidden: attrs.hidden === '' || attrs.hidden === 'true',
      style: {} as Record<string, string>,
      parentElement: null as any,
      children: [] as any[],
      attributes: { ...attrs },
      offsetWidth: Number(attrs['data-w'] || 52),
      clientWidth: Number(attrs['data-cw'] || 0),
      setAttribute(k: string, v: string) { this.attributes[k] = v; },
      getAttribute(k: string) { return this.attributes[k] ?? null; },
      removeAttribute(k: string) { delete this.attributes[k]; },
      classList: {
        _s: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
        toggle(name: string, on?: boolean) {
          if (on === false) this._s.delete(name);
          else if (on === true) this._s.add(name);
          else if (this._s.has(name)) this._s.delete(name);
          else this._s.add(name);
          this.className = [...this._s].join(' ');
        },
        contains(name: string) { return this._s.has(name); }
      },
      querySelector(sel: string) {
        return collect(this).find((n) => match(n, sel)) || null;
      },
      querySelectorAll(sel: string) {
        return collect(this).filter((n) => match(n, sel));
      },
      closest(sel: string) {
        let n: any = this;
        while (n) {
          if (match(n, sel)) return n;
          n = n.parentElement;
        }
        return null;
      },
      appendChild(child: any) {
        if (child.parentElement) {
          const i = child.parentElement.children.indexOf(child);
          if (i >= 0) child.parentElement.children.splice(i, 1);
        }
        child.parentElement = this;
        this.children.push(child);
        return child;
      }
    };
    for (const k of kids) node.appendChild(k);
    return node;
  }
  function collect(root: any): any[] {
    const out = [root];
    for (const c of root.children || []) out.push(...collect(c));
    return out;
  }
  function match(n: any, sel: string) {
    if (sel.startsWith('.')) return (n.className || '').split(/\s+/).includes(sel.slice(1));
    if (sel.startsWith('[') && sel.includes('=')) {
      const m = sel.match(/\[([^=]+)="([^"]+)"\]/);
      return !!(m && n.getAttribute(m[1]) === m[2]);
    }
    return false;
  }

  const copy = el('button', { class: 'seltool', 'data-seltool': 'copy', 'data-w': '0' });
  const image = el('button', { class: 'seltool', 'data-seltool': 'image', 'data-w': '0' });
  const translate = el('button', { class: 'seltool', 'data-seltool': 'translate', 'data-w': '0' });
  const askAI = el('button', { class: 'seltool', 'data-seltool': 'askAI', 'data-w': '0' });
  const menu = el('div', { class: 'seltool-overflow-menu' }, [copy, translate, askAI, image]);
  const more = el('button', { class: 'seltool seltool-more', 'data-w': '52' });
  const overflow = el('span', { class: 'seltool-overflow' }, [more, menu]);
  const mainSlot = el('span', { class: 'seltool-main-tools' });
  const divider = el('span', { class: 'seltool-divider seltool-tools-divider', 'data-w': '7' });
  const a1 = el('button', { class: 'seltool', 'data-sel-annotate': 'marker', 'data-w': '52' });
  const a2 = el('button', { class: 'seltool', 'data-sel-annotate': 'wavy', 'data-w': '52' });
  const a3 = el('button', { class: 'seltool', 'data-sel-annotate': 'straight', 'data-w': '52' });
  const a4 = el('button', { class: 'seltool', 'data-sel-annotate': 'idea', 'data-w': '52' });
  const bar = el('div', { class: 'selection-toolbar' }, [a1, a2, a3, a4, divider, mainSlot, overflow]);
  const pane = el('section', { class: 'preview-pane', 'data-cw': '207' });

  const prevWin = globalThis.window;
  // @ts-ignore
  globalThis.window = { innerWidth: 1280 };
  try {
    const editor = Object.assign(new SelectionToolbarMethods(), {
      agentBridgeEnabled: false,
      selBarRef: { current: bar },
      previewPaneRef: { current: pane },
      previewRef: { current: null }
    });
    assert.equal(editor._selectionToolbarAvailableWidth(), 191);
    editor._layoutSelectionToolbar();
    assert.equal(bar.style.maxWidth, '191px');
    assert.ok(bar.classList.contains('is-wrapped'), 'narrow pane must wrap');
    assert.equal(copy.parentElement, mainSlot, 'copy on main (row2) even when pane ≪ window');
  } finally {
    // @ts-ignore
    globalThis.window = prevWin;
  }
});
