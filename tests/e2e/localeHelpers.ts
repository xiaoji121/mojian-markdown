import type { Page } from '@playwright/test';
import { expect, openAppearance } from './fixtures';

export async function openLanguageSettings(page: Page) {
  const panel = page.locator('.interface-language-panel');
  if (await panel.isVisible()) return;
  await openAppearance(page);
  await page.locator('[data-settings-tab=general]').click();
  await expect(panel).toBeVisible();
}

export async function chooseLanguage(page: Page, locale: string) {
  await openLanguageSettings(page);
  await page.locator(`.interface-language-option[data-locale="${locale}"]`).click();
  await page.keyboard.press('Escape');
}
