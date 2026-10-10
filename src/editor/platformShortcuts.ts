/** Platform-aware shortcut labels for menus and status copy. */
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

/** Update [data-mod-shortcut] nodes (S | Shift+S) to the current platform. */
export function syncMenuShortcuts(root: ParentNode, platform?: string) {
  root.querySelectorAll<HTMLElement>('[data-mod-shortcut]').forEach(node => {
    const combo = node.dataset.modShortcut;
    if (combo === 'S' || combo === 'Shift+S') node.textContent = menuShortcut(combo, platform);
  });
}
