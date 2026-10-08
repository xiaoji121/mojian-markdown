import type { Page } from '@playwright/test';

export async function freezeRendererClock(page: Pick<Page, 'clock'>) {
  // Use a synthetic day of headroom, longer than the entire 60-second test
  // deadline. A host timestamp can already be in the renderer's past when the
  // pause RPC arrives. Both operations finish before the final input is sent.
  await page.clock.install({ time: new Date('2020-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2020-01-02T00:00:00Z'));
}
