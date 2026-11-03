import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// M88: every API request makes its own Prisma client (src/lib/db.ts), and each new client used to
// build Prisma's query compiler again from the whole schema: about half of a request's CPU time.
// patches/@prisma__client@6.19.3.patch keeps one compiler per Worker copy. If Prisma is upgraded
// without carrying the patch over, this fails, so the cost can't quietly come back.
describe('Prisma keeps one query compiler per Worker copy', () => {
  it('the installed runtime carries the patch', () => {
    const runtime = createRequire(import.meta.url).resolve('@prisma/client/runtime/wasm-compiler-edge.js');
    const code = readFileSync(runtime, 'utf8');
    expect(code).toContain('globalThis.__prismaQC={r,k:qcK,d:this.datamodel,q:qcQ}');
    expect(code).toContain('qcQ.free=()=>{}'); // the shared compiler is never freed by one client
    expect(code).toContain('globalThis.__prismaQC=void 0,n&&this.stop()'); // dropped after a panic
  });
});
