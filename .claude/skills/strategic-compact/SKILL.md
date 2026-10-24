---
name: strategic-compact
description: Suggests /compact or /clear at the end of a finished piece of work in a long session, instead of letting auto-compaction cut in mid-task. Use when the compact reminder appears, or the user asks when to compact.
---

# Strategic compact

From github.com/worldflowai/everything-claude-code (MIT), commit 432485b, fitted to UniVerse on
24 Oct 2026 (the owner: "add … all the things which are necessary"). Its counting script kept the
count in a file named after its own process, so it never got past 1; the project's hook
`.claude/hooks/suggest-compact.mjs` counts per session instead.

The hook counts tool calls in this session. At 60, and every 30 after that, it reminds Claude that the
history is long. Then, and only at a natural boundary:

- **After an item is finished** (checks green, committed and pushed): suggest `/clear` or a fresh
  thread to the owner, as CLAUDE.md asks ("after a feature or bugfix is done, start a fresh thread").
- **After exploring, before building:** `/compact` keeps the plan and drops the search results.
- **Never mid-change:** don't compact with edits half done or checks not yet run.

The reminder is a hint, never an instruction to stop: finish the step in hand first. Threshold:
`COMPACT_THRESHOLD` (default 60).
