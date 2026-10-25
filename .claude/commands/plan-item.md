---
description: Plan the next item in UniVerse's work queue (or the one named) before writing code
argument-hint: "[Qn]"
---

Plan the work for **$ARGUMENTS** (if empty: the next item not marked ✅ in section 4 of
`apps/web/STAGE-5-PLAN.md`). Don't write code yet.

1. Read only what's needed: `AGENTS.md` section 4 "Where things stand", the item's entry in plan section 4
   (its "Exists" files first), and the latest notes in `apps/web/STAGE-5-HANDOFF.md` (the rules are in `AGENTS.md`).
2. Look at the existing code the entry names (targeted reads: the functions involved, not whole files).
3. Write a short plan: what the user gets; the steps (one commit for the item); files to change or
   add; the next migration number if a table changes; the sample-mode stubs, tests and the browser
   check (`apps/web/scripts/checks/<name>-ui.mjs`, axe at 390 / 1280 px, light and dark) it needs;
   the traps (D1 limits: 100 values and 50 queries per request; Workers Free CPU; no new emails;
   tabs inside existing menus; anything that costs money or needs an account is **[owner]**, behind
   a switch, off).
4. Say plainly what the owner would see when it's done, and ask before starting if anything costs
   money, needs an account, or changes sign-in or access checks.
