/** Platform-aware shortcut labels for menus, toolbar titles, and status copy. */
import { t } from './i18n.ts';

export function isApplePlatform(platform: string = ''): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform || (typeof navigator !== 'undefined' ? navigator.platform : ''));
}

export function menuShortcut(combo: 'S' | 'Shift+S', platform?: string): string {
  const apple = isApplePlatform(platform);
  if (combo === 'S') return apple ? '⌘S' : 'Ctrl+S';
  return apple ? '⌘⇧S' : 'Ctrl+Shift+S';
}

export function saveShortcutPhrase(platform?: string): string {
  return menuShortcut('S', platform);
}

export type ModTitleKind = 'undo' | 'redo' | 'find' | 'toggle-replace';

/** zh source keys (and i18n entries) for toolbar title shortcuts — one per platform. */
export function modTitleKey(kind: ModTitleKind, platform?: string): string {
  const apple = isApplePlatform(platform);
  switch (kind) {
    case 'undo':
      return apple ? '撤销（⌘Z）' : '撤销（Ctrl+Z）';
    case 'redo':
      return apple ? '重做（⌘⇧Z）' : '重做（Ctrl+Y）';
    case 'find':
      return apple ? '搜索替换（⌘F）' : '搜索替换（Ctrl+F）';
    case 'toggle-replace':
      return apple ? '切换替换（⌘⌥F）' : '切换替换（Ctrl+H）';
  }
}

/** Update [data-mod-shortcut] nodes (S | Shift+S) to the current platform. */
export function syncMenuShortcuts(root: ParentNode, platform?: string) {
  root.querySelectorAll<HTMLElement>('[data-mod-shortcut]').forEach(node => {
    const combo = node.dataset.modShortcut;
    if (combo === 'S' || combo === 'Shift+S') node.textContent = menuShortcut(combo, platform);
  });
}

/** Update [data-mod-title] toolbar titles to platform-only shortcuts (no ⌘+Ctrl dual labels). */
export function syncModTitles(root: ParentNode, platform?: string) {
  root.querySelectorAll<HTMLElement>('[data-mod-title]').forEach(node => {
    const kind = node.dataset.modTitle as ModTitleKind | undefined;
    if (!kind || !['undo', 'redo', 'find', 'toggle-replace'].includes(kind)) return;
    const key = modTitleKey(kind, platform);
    const label = t(key);
    node.title = label;
    node.setAttribute('data-i18n-title', key);
  });
}
