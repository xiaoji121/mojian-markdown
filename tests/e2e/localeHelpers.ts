import type { Page } from '@playwright/test';
import { openAppearance } from './fixtures';

export async function chooseLanguage(page: Page, locale: string) {
  if (!await page.locator('#reading-appearance-panel').isVisible()) await openAppearance(page);
  await page.locator(`.interface-language-option[data-locale="${locale}"]`).click();
  await page.keyboard.press('Escape');
}
