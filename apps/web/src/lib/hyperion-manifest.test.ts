import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// M449: the installed Hyperion app opens on Hyperion but counts the whole site as its own, so the owner console,
// Messages, Collaborate and Settings (in Hyperion's top bar) open inside it without the browser's "you left the app"
// bar with the address and a close button.
describe('Hyperion’s installed app', () => {
  it('starts on Hyperion and keeps every UniVerse page inside the app', () => {
    const m = JSON.parse(readFileSync(new URL('../../public/hyperion/manifest.json', import.meta.url), 'utf8'));
    expect(m.start_url).toBe('/hyperion');
    expect(m.id).toBe('/hyperion');
    expect(m.scope).toBe('/');
  });
});
