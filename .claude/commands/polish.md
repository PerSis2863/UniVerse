---
description: Design and motion review of a screen, after Impeccable and Emil Kowalski's skills, fitted to UniVerse
argument-hint: "<page, component or folder>"
---

Review `$ARGUMENTS` against the "Design and motion" rules in `AGENTS.md` (section 8) (adapted
from github.com/pbakaus/impeccable and github.com/emilkowalski/skills). The owner's two-tone look
(dark blue with hot-pink light lines and glows since 24 Oct 2026, the glow, the light river, the italic accent word) is the brand: never report
it as a problem or replace it.

1. Read the code for the target (only the files it uses).
2. Motion: how often is each animation seen, and why does it move? Easing (ease-out for entering,
   the project's curves), duration (UI under 300 ms, exits faster), `scale: 0` starts, popover
   origins, `transition-all`, animating layout properties, stagger, Reduce Motion, hover-only
   extras on touch screens.
3. Look and reading: text under 11 px, lines over ~75 characters, grey text contrast in both
   themes (including see-through cards on light pages), cards inside cards, spacing and type
   sizes off the scale.
4. If the built site is running (`pnpm local:serve`), look at the page on a phone and a desktop
   viewport, light and dark, and run axe like `scripts/checks/` do.

Report one table, most important first:

| Where (file:line) | Now | Better | Why |
| --- | --- | --- | --- |

Then fix only what's asked, the smallest correct change each, and run `/check quick`.
