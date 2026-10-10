// @ts-nocheck
import {
  planSelectionToolbarLayout,
  selectionToolbarBudgetWidth,
  SEL_TOOL_PRIORITY,
  SEL_TOOLBAR_DEFAULTS
} from './selectionToolbarLayout.ts';

export class SelectionToolbarMethods {
  _selToolEls() {
    const bar = this.selBarRef?.current;
    if (!bar) return null;
    const byId = {};
    for (const id of SEL_TOOL_PRIORITY) {
      const el = bar.querySelector(`[data-seltool="${id}"]`);
      if (el) byId[id] = el;
    }
    return {
      bar,
      mainSlot: bar.querySelector('.seltool-main-tools'),
      overflowWrap: bar.querySelector('.seltool-overflow'),
      overflowMenu: bar.querySelector('.seltool-overflow-menu'),
      moreBtn: bar.querySelector('.seltool-more'),
      toolsDivider: bar.querySelector('.seltool-tools-divider'),
      byId
    };
  }

  _measureSelAnnotateWidth(bar) {
    let w = 0;
    bar.querySelectorAll('[data-sel-annotate]').forEach((el) => {
      w += el.offsetWidth || 0;
    });
    return w || SEL_TOOLBAR_DEFAULTS.annotateWidth;
  }

  /** Prefer a visible annotate .seltool width over the static fallback (hidden overflow nodes report 0). */
  _measureSelToolFallbackWidth(bar) {
    const ann = bar?.querySelector?.('[data-sel-annotate]');
    const w = ann?.offsetWidth;
    return w > 0 ? w : SEL_TOOLBAR_DEFAULTS.toolWidth;
  }

  _selToolWidth(el, fallback = SEL_TOOLBAR_DEFAULTS.toolWidth) {
    if (!el) return fallback;
    // hidden nodes report 0 — use fallback so planning still reserves a slot size
    const w = el.offsetWidth;
    return w > 0 ? w : fallback;
  }

  /**
   * Available width for the floating bar: min(window, preview pane) minus side pads.
   * Split-view narrow preview must drive collapse, not only window.innerWidth.
   */
  _selectionToolbarAvailableWidth() {
    const sidePad = SEL_TOOLBAR_DEFAULTS.sidePad;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 640;
    const pane =
      this.previewPaneRef?.current ||
      this.previewRef?.current?.closest?.('.preview-pane') ||
      this.previewRef?.current ||
      null;
    const paneWidth =
      pane && typeof pane.clientWidth === 'number' && pane.clientWidth > 0
        ? pane.clientWidth
        : null;
    return selectionToolbarBudgetWidth({ windowWidth, paneWidth, sidePad });
  }

  _closeSelOverflowMenu() {
    const parts = this._selToolEls();
    if (!parts?.overflowMenu || !parts.moreBtn) return;
    parts.overflowMenu.hidden = true;
    parts.moreBtn.setAttribute('aria-expanded', 'false');
    if (this._selOverflowDocH) {
      document.removeEventListener('mousedown', this._selOverflowDocH);
      this._selOverflowDocH = null;
    }
  }

  /**
   * Promote secondary tools onto the main bar by priority; hide「更多」when overflow empty.
   * Call after the bar is display:flex so measurements work.
   */
  _layoutSelectionToolbar() {
    const parts = this._selToolEls();
    if (!parts?.mainSlot || !parts.overflowMenu) return;

    const { bar, mainSlot, overflowWrap, overflowMenu, moreBtn, toolsDivider, byId } = parts;
    const bridgeOnline = !!this.agentBridgeEnabled;

    // Park every secondary tool in the overflow menu before measuring / promoting.
    for (const id of SEL_TOOL_PRIORITY) {
      const el = byId[id];
      if (!el) continue;
      if (el.parentElement !== overflowMenu) overflowMenu.appendChild(el);
      el.setAttribute('role', 'menuitem');
      if (id === 'translate' || id === 'askAI') el.hidden = !bridgeOnline;
      else el.hidden = false;
    }

    const maxW = this._selectionToolbarAvailableWidth();
    bar.style.maxWidth = `${maxW}px`;

    const annotateWidth = this._measureSelAnnotateWidth(bar);
    const toolFallback = this._measureSelToolFallbackWidth(bar);
    const dividerWidth = toolsDivider
      ? Math.max(toolsDivider.offsetWidth || 0, SEL_TOOLBAR_DEFAULTS.dividerWidth)
      : SEL_TOOLBAR_DEFAULTS.dividerWidth;
    const moreWidth = this._selToolWidth(moreBtn, toolFallback);

    const plan = planSelectionToolbarLayout({
      availableWidth: maxW,
      annotateWidth,
      toolWidth: (id) => this._selToolWidth(byId[id], toolFallback),
      dividerWidth,
      moreWidth,
      chromePad: SEL_TOOLBAR_DEFAULTS.chromePad,
      bridgeOnline
    });

    bar.classList.toggle('is-wrapped', plan.wrap);

    for (const id of plan.main) {
      const el = byId[id];
      if (!el || el.hidden) continue;
      el.removeAttribute('role');
      mainSlot.appendChild(el);
    }

    for (const id of plan.overflow) {
      const el = byId[id];
      if (!el || el.hidden) continue;
      el.setAttribute('role', 'menuitem');
      overflowMenu.appendChild(el);
    }

    const visibleOverflow = plan.overflow.filter((id) => byId[id] && !byId[id].hidden);
    const showMore = visibleOverflow.length > 0;
    const showToolsCluster =
      plan.main.some((id) => byId[id] && !byId[id].hidden) || showMore;

    if (toolsDivider) toolsDivider.hidden = !showToolsCluster || plan.wrap;
    if (overflowWrap) overflowWrap.hidden = !showMore;
    if (moreBtn) moreBtn.hidden = !showMore;
    if (!showMore) this._closeSelOverflowMenu();
  }
}
