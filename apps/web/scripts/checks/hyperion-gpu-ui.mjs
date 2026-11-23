// M478 Hyperion's GPU computing: with WebGPU (here the software adapter Chromium ships, so no graphics card is needed)
// a gpuArray's matrix product, element-wise maths, sums and transpose match the CPU's to single precision, and
// gather brings them back after its pause. Prints the device and the largest difference from the CPU.
//   BASE=http://localhost:3000 node scripts/checks/hyperion-gpu-ui.mjs
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { signedIn } from '../browser-session.mjs';
const require = createRequire(new URL('../../package.json', import.meta.url));
const base = process.env.BASE ?? 'http://localhost:8787';
const browser = await require('playwright').chromium.launch({
  ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}),
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'],
});
const out = {}, errors = [];
try {
  const ctx = await signedIn(browser, base, 'alice@student.com', { width: 1280, height: 900 });
  await ctx.addInitScript(() => { localStorage.setItem('uv-cookies', 'essential'); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`${base}/hyperion`, { waitUntil: 'load', timeout: 240_000 });
  const cmd = page.getByPlaceholder(/Type a command/);
  await cmd.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  const say = async (line, until) => { await cmd.fill(line); await cmd.press('Enter'); await page.getByText(until).first().waitFor({ timeout: 120_000 }).catch(async () => { console.log((await page.evaluate(() => document.body.innerText)).slice(-1500)); throw new Error(`no ${until}`); }); };
  await say("d = gpuDevice; fprintf('device: %s\\n', d.Name)", /^device: /m);
  await say("A = rand(300, 200); B = rand(200, 250); G = gpuArray(A); H = gpuArray(B); fprintf('made %s\\n', class(G))", /^made gpuArray/m);
  await say("e1 = max(max(abs(gather(G*H) - A*B))); fprintf('matmul diff %.3g\\n', e1)", /^matmul diff/m);
  await say("e2 = max(max(abs(gather(exp(G) .* G - G/3 + 2) - (exp(A) .* A - A/3 + 2)))); fprintf('elementwise diff %.3g\\n', e2)", /^elementwise diff/m);
  await say("s1 = gather(sum(H)); s2 = sum(B); e3 = max(abs(s1 - s2)) / max(s2); e4 = max(max(abs(gather(transpose(G)) - A'))); fprintf('sum rel diff %.3g, transpose diff %.3g, first sums %.10f and %.10f\\n', e3, e4, s1(1), s2(1))", /^sum rel diff/m);
  const text = await page.evaluate(() => document.body.innerText);
  out.lines = text.match(/^(device|matmul|elementwise|sum rel).*$/gm);
  await ctx.close();
} finally { await browser.close(); }
console.log(JSON.stringify({ out, errors }, null, 1));
