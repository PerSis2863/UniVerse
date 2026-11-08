# Where this comes from

taste-skill ("design-taste-frontend", tasteskill 2.5.1) by Leonxlnx, github.com/leonxlnx/taste-skill (MIT,
see LICENSE), `skills/taste-skill` at commit f6b7657, copied on 8 Nov 2026 at the owner's request.

Copied: SKILL.md, `references/` and `library/` (its written guidance, about 0.5 MB). Not copied:
- the Stop hook in SKILL.md's header, which ran `node scripts/gate.mjs` by itself every time the
  agent finished a reply (the project adds skills without their hooks, as with Impeccable and Ponytail);
- `scripts/` (its checker and generators; `photos.mjs` and `icons.mjs` download pictures and icons from
  Wikimedia, jsDelivr and GitHub) and `assets/` (38 MB of photographs, scenes and effects).
A short note at the top of SKILL.md says so. Its taste for shader effects and "dealt moments" is for
marketing sites; UniVerse's own rules (AGENTS.md §8: motion with a job only) win where they differ.
