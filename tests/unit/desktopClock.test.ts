import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freezeRendererClock } from '../desktop/freezeRendererClock.ts';

// Simulate renderer progress during cross-process clock calls without sleeping.
// The desktop test deadline is 60 seconds; even nearly that whole budget must
// not put pauseAt's target behind the running renderer clock.
for (const elapsed of [1, 250, 59_999]) {
  test(`desktop clock freezes before input despite ${elapsed}ms renderer progress`, async () => {
    let rendererTime = 0;
    let paused = false;
    const clock = {
      async install(options?: { time?: number | string | Date }) {
        rendererTime = options?.time === undefined ? Date.now() : new Date(options.time).getTime();
        rendererTime += elapsed;
      },
      async pauseAt(time: number | string | Date) {
        const target = new Date(time).getTime();
        assert.ok(target >= rendererTime, 'Cannot fast-forward to the past');
        rendererTime = target;
        paused = true;
      }
    };
    await freezeRendererClock({ clock } as Parameters<typeof freezeRendererClock>[0]);
    assert.equal(paused, true);
    assert.equal(rendererTime, Date.parse('2020-01-02T00:00:00Z'));
  });
}
