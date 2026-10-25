# Where this comes from

Ponytail by DietrichGebert, github.com/DietrichGebert/ponytail (MIT, see LICENSE), copied from the
repository's `skills/` at commit 09c434a (18 Oct 2026) on 24 Oct 2026, at the owner's request. Six
skills: `ponytail` (the lean-code mode, levels lite / full / ultra), `ponytail-review`,
`ponytail-audit`, `ponytail-debt`, `ponytail-gain` and `ponytail-help`.

Not copied: its lifecycle hooks (`hooks/`), which switch the mode on at every session start and
pass it to subagents. Without them, type `/ponytail` (or `/ponytail ultra`) to switch it on. The
full plugin with hooks: `/plugin marketplace add DietrichGebert/ponytail`, then
`/plugin install ponytail@ponytail` (two separate prompts).

Project rules still win where they differ: `AGENTS.md` "Keep it lean" and the
owner's summary rule in CLAUDE.md (end every task with what changed, what they can do, what they
need to do, in plain words). `pnpm lean` stays the project's checker.

To update: copy the six `skills/ponytail*` folders again from a newer commit and change the line above.
