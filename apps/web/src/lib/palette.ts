/** Opens the command palette (Ctrl+K). Tiny on purpose: the palette itself loads on demand. */
export function openCommandPalette() {
  window.dispatchEvent(new Event('universe:open-palette'));
}
