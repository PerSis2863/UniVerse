---
description: Finish a queue item: Progress row, handoff note, START-HERE, owner summary, commit and push (no merge)
argument-hint: "[Qn]"
---

Wrap up item **$ARGUMENTS** the way every item is finished in this project:

1. `/check full` must pass, and the item's browser check (`apps/web/scripts/checks/<name>-ui.mjs`)
   must have passed on the built Worker (`pnpm local:build`, `pnpm local:serve`). If it hasn't run,
   say so instead of claiming it.
2. `apps/web/STAGE-5-PLAN.md`: add the item's **Progress row** (what was built, where, the migration
   number, how it was tested, **Not done:** what's left), and mark its heading ✅.
3. `apps/web/STAGE-5-HANDOFF.md`: a short note (traps, rules for code that builds on it, the next
   migration number, how to re-run its test).
4. `START-HERE.md` "Where things stand" and the "next" line in `.cursor/rules/universe.mdc`.
5. One commit for the item (a clear message, no AI model names or ids), then push the branch.
   **Don't merge and don't open a pull request**: only when the owner says "merge".
6. Tell the owner in plain words: what changed, what they can now do (and where to tap), what they
   need to do (if anything), and that it's on the branch until they say "merge".
