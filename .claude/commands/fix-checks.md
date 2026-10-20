---
description: Fix failing type, lint or unit-test checks with the smallest correct change
---

Run `/check full`, then fix what fails, one cause at a time:

- Read the failing lines and their surroundings only; find the root cause, then make the smallest
  change that fixes it properly (real types, no `any`, no `@ts-ignore`, no eslint-disable comments,
  never weaken a test or delete an assertion to make it pass).
- React hooks lint: no `setState` directly in an effect body, no reading refs or `Date.now()` while
  rendering (`src/lib/use-now.ts`), ids from `useId` where a section is drawn twice.
- Never touch sign-in or access checks (`src/server/auth.ts`, `src/lib/server-auth.ts`,
  `src/server/access.ts`) to get a check passing.
- After each fix re-run only the check that failed; at the end run `/check full` once more and report
  what was wrong and what changed, in two or three plain sentences.
