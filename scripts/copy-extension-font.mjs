// Compatibility entry point for build:ext. Reading fonts are now local-only.
// Never copy restricted fonts into a distribution or delete local source files.
// The shared Vite build guard excludes any stale generated font copies.
console.log('extension font: local system fonts only; no font files copied');
