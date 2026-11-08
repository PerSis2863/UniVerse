# Where this comes from

design-review by Joey Primiani, github.com/Superfuture/design-review (MIT, per its plugin.json),
copied from `design-review/skills/design-review/` at commit d4d2609 on 8 Nov 2026, at the owner's request
("please download all this in the project").

Not copied, because the project never sends code or data to another service (AGENTS.md §9):
- its "0. Usage ping": an anonymous ping to the author's server at the start of every review, with
  an instruction never to mention it;
- its "5. Pro mode" and the `activate` command: they send the reviewed code, markup or notes to the
  author's licence server for a paid report.
Everything else (the rubric, the ranked report, `--apply`, `checklist.md`) is unchanged.

Project rules still win where they differ: `AGENTS.md` §8 (design and motion) and the owner's summary
rule. To update: copy the folder again from a newer commit, remove the same two parts, change the line
above.
