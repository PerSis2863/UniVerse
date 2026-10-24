# Performance & Token Optimization Rules

1. Terse responses: Do not recap or summarize what you did unless asked. Provide only the essential diff or explanation. Exception: the owner isn't a developer, so at the end of a task always say in plain words what changed, what they can do now and what they need to do.
2. Targeted reads: Read only the relevant function or line range, never dump entire files unless structural refactoring is required.
3. Silent success: When running terminal commands or tests, output only failing lines or errors, omitting boilerplate passes.
4. Operational best practices:
   - Prefer scoped @file / @folder over unconstrained @codebase.
   - After a feature or bugfix is done, start a fresh thread or run /clear so history is not re-sent every turn.

Also follow `.cursor/rules/universe.mdc` and `START-HERE.md` when working in this repo. Every outside
tool, skill and repository the owner asked for (ECC, Ponytail, Impeccable, Emil Kowalski's skills,
AgentGPT, the design references) is in `AGENT-TOOLKIT.md`: what it is, where it lives, how to install it.

## Claude Code setup in this repo (`.claude/`)

A small set adapted from Everything Claude Code (ECC) to this project; the full pack is not
installed (see the ECC section in `.cursor/rules/universe.mdc` for why, and before adding more).

- **Commands** (type them in Claude Code): `/plan-item [Qn]` plan the next queue item before coding;
  `/check [quick|full]` run the project's checks and show only failures; `/fix-checks` fix what
  fails; `/finish-item [Qn]` Progress row, handoff note, START-HERE, commit and push (no merge);
  `/council <topic>` the five-advisor review; `/polish <page>` a design and motion review (after
  Impeccable and Emil Kowalski's skills; rules in `.cursor/rules/universe.mdc`).
- **Reviewers** (subagents, only when asked): `universe-reviewer` (bugs and project rules) and
  `universe-security` (access, input, secrets, money, files).
- **Skills** (copied from github.com/emilkowalski/skills, MIT): `emil-design-eng`, `review-animations`,
  `animation-performance`, `mobile-native` in `.claude/skills/`.
  And `impeccable` (github.com/pbakaus/impeccable, Apache-2.0, without its hooks): `/impeccable` for
  design and motion choices (`generate`, `live`, `animate`, `bolder`, `critique`, …); see its `SOURCE.md`.
  And Ponytail's six skills (github.com/DietrichGebert/ponytail, MIT, without its hooks): `/ponytail`,
  `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`. REA (reverse engineering, Ghidra engine) is set up on
  the machine, not in the repo: `sh tools/setup-rea.sh` in a new cloud session (see `AGENT-TOOLKIT.md` §5b).
- **Hook:** `.claude/hooks/protect-secrets.mjs` blocks any tool call that reads or writes the local
  secret files (`.dev.vars`, `.env*`; `*.example` is fine). Turned on in `.claude/settings.json`.
  And `.claude/hooks/suggest-compact.mjs` (after ECC): at 60 tool calls, and every 30 after, a hint to
  suggest `/clear` or `/compact` at the next finished item. From ECC also the `security-review` and
  `strategic-compact` skills.

## Use these by default (the owner, 24 Oct 2026: "from now on start using all these skills… efficiently")

- Any coding task: Ponytail's rules (`ponytail`, level full) inside "Keep it lean"; `/ponytail-review`
  before finishing a bigger change.
- Any screen, style or motion work: `impeccable` (and its `generate` / `live` for choices to pick
  from) plus Emil Kowalski's skills; the brand rule in universe.mdc wins.
- Sign-in, input, secrets, money, files, public routes: the `security-review` checklist, and the
  `universe-security` reviewer for a big change.
- Analysing an app or binary: REA (`reverse-engineer-anything`, Ghidra engine; run
  `sh tools/setup-rea.sh` first in a new cloud session). Lawful use only.
- Efficiently: load a skill only when the task needs it, and follow the token rules above.
