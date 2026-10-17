# Performance & Token Optimization Rules

1. Terse responses: Do not recap or summarize what you did unless asked. Provide only the essential diff or explanation.
2. Targeted reads: Read only the relevant function or line range, never dump entire files unless structural refactoring is required.
3. Silent success: When running terminal commands or tests, output only failing lines or errors, omitting boilerplate passes.
4. Operational best practices:
   - Prefer scoped @file / @folder over unconstrained @codebase.
   - After a feature or bugfix is done, start a fresh thread or run /clear so history is not re-sent every turn.

Also follow `.cursor/rules/universe.mdc` and `START-HERE.md` when working in this repo.
