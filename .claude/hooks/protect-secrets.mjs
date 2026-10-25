#!/usr/bin/env node
// UniVerse safety hook (Claude Code PreToolUse): never read, write or touch secret files.
// Real keys live only in the Cloudflare dashboard; local runs use placeholders on the command line
// (see AGENTS.md, "Safety"). Blocks any tool call that names .dev.vars or a .env
// file (.env.example and other *.example files are fine). Exit 2 = blocked, with the reason.
// No network, no other side effects.

let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let call;
  try {
    call = JSON.parse(input || '{}');
  } catch {
    process.exit(0); // not ours to judge
  }
  const t = call.tool_input ?? {};
  const text = [t.file_path, t.notebook_path, t.path, t.command, t.pattern].filter((v) => typeof v === 'string').join('\n');
  // A path-like mention (not a name in `backticks`, as notes and rules mention them).
  const secret = /(^|[\s/"'=:(])\.dev\.vars(?=$|[\s"';|&)<>])|(^|[\s/"'=:(])\.env(\.(?!example\b)[\w-]+)?(?=$|[\s"';|&)<>])/m;
  if (secret.test(text)) {
    console.error(
      'Blocked by the UniVerse safety rule: secret files (.dev.vars, .env*) are never read or written. ' +
        'Real keys live only in the Cloudflare dashboard; for local runs use placeholder values on the command line ' +
        '(e.g. pnpm local:serve --ai-placeholder / --test-secret).',
    );
    process.exit(2);
  }
  process.exit(0);
});
