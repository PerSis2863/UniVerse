# Performance & Token Optimization Rules

1. Terse responses: Do not recap or summarize what you did unless asked. Provide only the essential diff or explanation. Exception: the owner isn't a developer, so at the end of a task always say in plain words what changed, what they can do now and what they need to do.
2. Targeted reads: Read only the relevant function or line range, never dump entire files unless structural refactoring is required.
3. Silent success: When running terminal commands or tests, output only failing lines or errors, omitting boilerplate passes.
4. Operational best practices:
   - Prefer scoped @file / @folder over unconstrained @codebase.
   - After a feature or bugfix is done, start a fresh thread or run /clear so history is not re-sent every turn.

Also follow `.cursor/rules/universe.mdc` and `START-HERE.md` when working in this repo.

## Claude Code setup in this repo (`.claude/`)

A small set adapted from Everything Claude Code (ECC) to this project; the full pack is not
installed (see the ECC section in `.cursor/rules/universe.mdc` for why, and before adding more).

- **Commands** (type them in Claude Code): `/plan-item [Qn]` plan the next queue item before coding;
  `/check [quick|full]` run the project's checks and show only failures; `/fix-checks` fix what
  fails; `/finish-item [Qn]` Progress row, handoff note, START-HERE, commit and push (no merge);
  `/council <topic>` the five-advisor review.
- **Reviewers** (subagents, only when asked): `universe-reviewer` (bugs and project rules) and
  `universe-security` (access, input, secrets, money, files).
- **Hook:** `.claude/hooks/protect-secrets.mjs` blocks any tool call that reads or writes the local
  secret files (`.dev.vars`, `.env*`; `*.example` is fine). Turned on in `.claude/settings.json`.
