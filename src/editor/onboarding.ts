// N-D first-run guide helpers (spec: designer/规格-首登5分钟-ND.md).
// L1 sample text stays in sample.ts; this module only tracks S0–S4 / complete / L3 dismiss.

export const ND_COMPLETE_KEY = 'md-editor-nd-complete';
export const ND_HINT_DISMISSED_KEY = 'md-editor-nd-hint-dismissed';

export type NdGuideFlags = {
  complete: boolean;
  hintDismissed: boolean;
};

function readFlag(storage: Storage | null | undefined, key: string): boolean {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    return store.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(storage: Storage | null | undefined, key: string, on: boolean): boolean {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    if (on) store.setItem(key, '1');
    else store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadNdGuideFlags(storage?: Storage | null): NdGuideFlags {
  return {
    complete: readFlag(storage, ND_COMPLETE_KEY),
    hintDismissed: readFlag(storage, ND_HINT_DISMISSED_KEY)
  };
}

export function markNdComplete(storage?: Storage | null): boolean {
  return writeFlag(storage, ND_COMPLETE_KEY, true);
}

export function markNdHintDismissed(storage?: Storage | null): boolean {
  return writeFlag(storage, ND_HINT_DISMISSED_KEY, true);
}

/**
 * S0 guide window: first load with sample and never completed N-D.
 * S1/S2/S3 → false (no chrome guide). S4 = pristine sample + complete → L3 off.
 */
export function isNdGuideWindow(opts: {
  startedWithSample: boolean;
  complete: boolean;
  hasOpenFile?: boolean;
}): boolean {
  if (opts.complete) return false; // S3 / S4
  if (opts.hasOpenFile) return false; // S2
  return !!opts.startedWithSample; // S0 only (_startedWithSample false ⇒ S1)
}

/** L3 first-paragraph highlight: only inside S0 guide window and not dismissed. */
export function shouldShowNdFirstHighlight(opts: {
  startedWithSample: boolean;
  complete: boolean;
  hintDismissed: boolean;
  hasOpenFile?: boolean;
}): boolean {
  if (opts.hintDismissed) return false;
  return isNdGuideWindow(opts);
}

/** Completion: ≥1 annotation AND ≥1 takeaway export/backup. */
export function canCompleteNd(annotated: boolean, exported: boolean): boolean {
  return !!annotated && !!exported;
}
