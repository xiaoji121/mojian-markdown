import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canCompleteNd,
  isNdGuideWindow,
  loadNdGuideFlags,
  markNdComplete,
  markNdHintDismissed,
  ND_COMPLETE_KEY,
  ND_HINT_DISMISSED_KEY,
  shouldShowNdFirstHighlight
} from '../../src/editor/onboarding.ts';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(key: string) { return map.has(key) ? map.get(key)! : null; },
    key(i: number) { return [...map.keys()][i] ?? null; },
    removeItem(key: string) { map.delete(key); },
    setItem(key: string, value: string) { map.set(key, String(value)); }
  };
}

test('S0 only: guide window when started with sample and not complete', () => {
  assert.equal(isNdGuideWindow({ startedWithSample: true, complete: false }), true);
  assert.equal(isNdGuideWindow({ startedWithSample: false, complete: false }), false); // S1
  assert.equal(isNdGuideWindow({ startedWithSample: true, complete: true }), false); // S3/S4
  assert.equal(isNdGuideWindow({ startedWithSample: true, complete: false, hasOpenFile: true }), false); // S2
});

test('L3 first highlight only in S0 and not dismissed', () => {
  assert.equal(shouldShowNdFirstHighlight({
    startedWithSample: true, complete: false, hintDismissed: false
  }), true);
  assert.equal(shouldShowNdFirstHighlight({
    startedWithSample: true, complete: false, hintDismissed: true
  }), false);
  assert.equal(shouldShowNdFirstHighlight({
    startedWithSample: false, complete: false, hintDismissed: false
  }), false);
});

test('completion needs annotate + export', () => {
  assert.equal(canCompleteNd(true, true), true);
  assert.equal(canCompleteNd(true, false), false);
  assert.equal(canCompleteNd(false, true), false);
});

test('nd-complete and hint-dismissed flags persist', () => {
  const store = memoryStorage();
  assert.deepEqual(loadNdGuideFlags(store), { complete: false, hintDismissed: false });
  markNdComplete(store);
  markNdHintDismissed(store);
  assert.equal(store.getItem(ND_COMPLETE_KEY), '1');
  assert.equal(store.getItem(ND_HINT_DISMISSED_KEY), '1');
  assert.deepEqual(loadNdGuideFlags(store), { complete: true, hintDismissed: true });
});
