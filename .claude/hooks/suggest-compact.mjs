// Strategic compact reminder (after ECC's suggest-compact, fitted 24 Oct 2026; see
// .claude/skills/strategic-compact/SKILL.md). Counts this session's tool calls and, at the threshold
// and every 30 after, adds a one-line hint for Claude. Never blocks a tool call; stores only a count.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no input: count anyway */ }
const session = String(input.session_id ?? 'default').replace(/[^\w-]/g, '').slice(0, 80) || 'default';
const file = join(tmpdir(), `universe-tool-count-${session}`);
const threshold = Number(process.env.COMPACT_THRESHOLD) || 60;

let count = 0;
try { count = Number(readFileSync(file, 'utf8')) || 0; } catch { /* first call */ }
count += 1;
try { writeFileSync(file, String(count)); } catch { /* read-only tmp: no reminders */ }

if (count === threshold || (count > threshold && (count - threshold) % 30 === 0)) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `[strategic compact] ${count} tool calls this session. At the next natural boundary (an item finished and pushed, or exploring done before building), suggest /clear or /compact to the owner; don't stop mid-change.`,
    },
  }));
}
