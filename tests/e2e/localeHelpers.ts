import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export async function openLanguageSettings(page: Page) {
  const panel = page.locator('.interface-language-panel');
  if (await panel.isVisible()) return;
  await page.locator('.file-menu-toggle').click();
  await page.locator('.interface-language-entry').click();
  await expect(panel).toBeVisible();
}

export async function chooseLanguage(page: Page, locale: string) {
  await openLanguageSettings(page);
  await page.locator(`.interface-language-option[data-locale="${locale}"]`).click();
  await page.keyboard.press('Escape');
}
