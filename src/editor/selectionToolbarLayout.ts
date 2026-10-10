// Selection toolbar: which secondary tools sit on the main bar vs overflow.
// Spec: designer/规格-选区工具条主条与折行.md (2026-10-10)

export const SEL_TOOL_PRIORITY = ['copy', 'translate', 'askAI', 'image'] as const;
export type SelToolId = (typeof SEL_TOOL_PRIORITY)[number];

export type SelToolbarPlan = {
  main: SelToolId[];
  overflow: SelToolId[];
  showMore: boolean;
  wrap: boolean;
};

export type SelToolbarLayoutInput = {
  availableWidth: number;
  annotateWidth: number;
  toolWidth: (id: SelToolId) => number;
  dividerWidth: number;
  moreWidth: number;
  chromePad: number;
  bridgeOnline: boolean;
};

/** Tools that may occupy a slot (Bridge-gated entries omitted when offline). */
export function visibleSelTools(bridgeOnline: boolean): SelToolId[] {
  return SEL_TOOL_PRIORITY.filter((id) => {
    if (id === 'translate' || id === 'askAI') return !!bridgeOnline;
    return true;
  });
}

function sumTools(ids: SelToolId[], toolWidth: (id: SelToolId) => number): number {
  return ids.reduce((sum, id) => sum + toolWidth(id), 0);
}

/**
 * Greedy fill by priority. If not everything fits, reserve room for「更多」
 * so we never leave empty main-bar space while a higher-priority tool sits in overflow.
 */
function fillTools(
  candidates: SelToolId[],
  budget: number,
  dividerWidth: number,
  moreWidth: number,
  toolWidth: (id: SelToolId) => number
): { main: SelToolId[]; overflow: SelToolId[]; showMore: boolean } {
  if (!candidates.length) {
    return { main: [], overflow: [], showMore: false };
  }

  const allNeed = dividerWidth + sumTools(candidates, toolWidth);
  if (allNeed <= budget) {
    return { main: [...candidates], overflow: [], showMore: false };
  }

  // Need overflow: reserve「更多」; optional leading divider still counted.
  let left = budget - dividerWidth - moreWidth;
  const main: SelToolId[] = [];
  const overflow: SelToolId[] = [];
  for (const id of candidates) {
    const w = toolWidth(id);
    if (left >= w) {
      main.push(id);
      left -= w;
    } else {
      overflow.push(id);
    }
  }
  if (!overflow.length) {
    return { main, overflow: [], showMore: false };
  }
  return { main, overflow, showMore: true };
}

/**
 * Budget for the floating bar: min(window, preview pane), minus side padding each edge.
 * Pane-narrow split must collapse even when the window is still wide.
 */
export function selectionToolbarBudgetWidth(opts: {
  windowWidth: number;
  paneWidth?: number | null;
  /** Padding on each side (spec ≥8px). */
  sidePad?: number;
}): number {
  const pad = opts.sidePad ?? 8;
  const win = Math.max(0, (opts.windowWidth || 0) - pad * 2);
  const paneRaw = opts.paneWidth;
  if (paneRaw == null || !Number.isFinite(paneRaw) || paneRaw <= 0) return win;
  const pane = Math.max(0, paneRaw - pad * 2);
  return Math.min(win, pane);
}

/**
 * Plan main vs overflow for secondary tools (copy / translate / askAI / image).
 * Annotate quartet stays on the main bar (caller keeps them fixed in DOM).
 *
 * R2: when「四钮 + 复制」fits in one row, copy must not sit only in「更多」.
 * If reserving「更多」would push copy out, wrap so row2 keeps copy first.
 */
export function planSelectionToolbarLayout(input: SelToolbarLayoutInput): SelToolbarPlan {
  const {
    availableWidth,
    annotateWidth,
    toolWidth,
    dividerWidth,
    moreWidth,
    chromePad,
    bridgeOnline
  } = input;
  const candidates = visibleSelTools(bridgeOnline);
  const copyW = toolWidth('copy');
  const base = chromePad + annotateWidth;
  // Single-row minimum for「四钮 + 复制」(spec ≈ 320px usable).
  const oneRowCopy = base + dividerWidth + copyW;

  if (availableWidth < oneRowCopy) {
    // Narrow: row1 = annotate; row2 fills by priority (copy first). No leading divider on row2.
    const row2Budget = Math.max(0, availableWidth - chromePad);
    const filled = fillTools(candidates, row2Budget, 0, moreWidth, toolWidth);
    return { ...filled, wrap: true };
  }

  const toolsBudget = Math.max(0, availableWidth - base);
  const filled = fillTools(candidates, toolsBudget, dividerWidth, moreWidth, toolWidth);

  // oneRowCopy fits ⇒ copy belongs on the main cluster. If more-reserve ate that slot,
  // wrap instead of leaving empty main space with copy only in「更多」(S4 / R5).
  if (candidates.includes('copy') && !filled.main.includes('copy')) {
    const row2Budget = Math.max(0, availableWidth - chromePad);
    const wrapped = fillTools(candidates, row2Budget, 0, moreWidth, toolWidth);
    return { ...wrapped, wrap: true };
  }

  return { ...filled, wrap: false };
}

/** Default widths when DOM is unavailable (unit tests / first paint). */
export const SEL_TOOLBAR_DEFAULTS = {
  annotateWidth: 232,
  toolWidth: 58,
  dividerWidth: 7,
  moreWidth: 58,
  chromePad: 12,
  /** Spec suggestion: four + copy roughly ≥ 320px usable. */
  wideMinForCopy: 320,
  sidePad: 8
} as const;
