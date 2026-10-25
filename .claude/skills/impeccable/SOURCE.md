# Where this comes from

Impeccable by Paul Bakaus, github.com/pbakaus/impeccable (Apache-2.0, see LICENSE and NOTICE.md),
skill version 4.7.1, copied from the repository's `plugin/skills/impeccable` at commit 9368675
(23 Oct 2026) on 24 Oct 2026, at the owner's request ("so that i can get choices of different
animations, styles and design"). Its four helper agents are in `.claude/agents/impeccable-*.md`.

Not copied: its hooks (`plugin/hooks/hooks.json`), which run the Impeccable engine after every edit
and when a session starts and stops. Add them only if the owner wants that (`npx impeccable install`
from the repo root installs the skill and the hooks together).

The launcher `scripts/impeccable` downloads the Impeccable engine (a self-contained binary) into
`~/.impeccable/bin/` the first time it runs; nothing of it is kept in this repository. Where the
launcher can't run, the skill says to read PRODUCT.md / DESIGN.md directly and carry on.

Project rules still win: `AGENTS.md` "Design and motion" (the brand's two-tone
gradients, glow and italic accent are kept on purpose; judge every finding against them).

To update: copy `plugin/skills/impeccable` again from a newer commit and change the line above.
