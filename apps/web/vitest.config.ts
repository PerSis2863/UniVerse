import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for pure logic (Stage 5 · A6): `pnpm test`. Files next to the code, `*.test.ts`.
// Server modules that touch the database or other services are tested with those mocked
// (vi.mock), so no Worker, D1 or network is needed.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], environment: 'node', setupFiles: ['src/server/test-setup.ts'] },
});
