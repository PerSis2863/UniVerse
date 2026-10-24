# Agent toolkit: every outside tool, skill and repository used on UniVerse

For any AI agent working here (Claude Code, Cursor or another). It lists everything from outside
this project that the owner asked to use: what it is, where it lives in the repo, how it's used,
how to install the full version, and what was left out and why. Last updated 24 Oct 2026.

**Order of authority.** The owner's rules come first: `CLAUDE.md`, `.cursor/rules/universe.mdc` and
`START-HERE.md`. Every tool below serves those rules and never overrides them. If a tool's advice
clashes with them (for example "purple gradients look AI-made"), the owner's rules win.

## Quick map

| What | From | What it gives UniVerse | Where it lives here | State |
| --- | --- | --- | --- | --- |
| Project commands, reviewers, hooks | made for this repo (from ECC) | `/plan-item`, `/check`, `/fix-checks`, `/finish-item`, `/council`, `/polish`; 2 reviewers; the secrets guard; the compact reminder; `security-review` and `strategic-compact` skills | `.claude/commands/`, `.claude/agents/`, `.claude/hooks/` | in use |
| Everything Claude Code (ECC) | github.com/affaan-m/everything-claude-code | the pieces above, adapted | see §2 | partly adopted on purpose |
| Ponytail | github.com/DietrichGebert/ponytail (MIT) | lean-code mode, reviews and audits, `pnpm lean` | `.claude/skills/ponytail*` (`/ponytail`), universe.mdc "Keep it lean", `apps/web/scripts/lean.mjs` | 6 skills installed 24 Oct 2026 (no hooks) |
| Impeccable | github.com/pbakaus/impeccable (Apache-2.0) | design rules, a page checker, design choices to pick from | `.claude/skills/impeccable` (`/impeccable`), universe.mdc "Design and motion", `/polish` | skill installed 24 Oct 2026 (no hooks) |
| Emil Kowalski's skills | github.com/emilkowalski/skills (MIT) | motion and phone-polish rules | `.claude/skills/` (4 copied), universe.mdc "Design and motion" | 4 skills in the repo; the rest optional |
| REA (Reverse Engineer Anything) | github.com/morluto/rea (MIT) | an MCP server (227 tools) to analyse apps and binaries, with Ghidra as its engine | `tools/setup-rea.sh` (installs it on the machine, outside the project) | set up 24 Oct 2026; rerun the script in a new cloud session |
| AgentGPT | github.com/reworkd/AgentGPT | how pages load and arrive smoothly | `apps/web/STAGE-5-HANDOFF.md` S1–S3 | studied, built in our code |
| The owner's design references | the Relay video, the "Cadra" reel | the landing page, the light river, the card look | `apps/web/STAGE-5-HANDOFF.md` M3, M4, M8 | built in our code |

## 1. The project's own Claude Code setup (`.claude/`)

**Commands** (type them in Claude Code; Cursor users read the same files as checklists):

| Command | What it does |
| --- | --- |
| `/plan-item [Qn]` | Plans the next item in the work queue (`apps/web/STAGE-5-PLAN.md`) before any code. |
| `/check [quick\|full]` | Route tables, types, lint on changed files, unit tests; shows only failures. |
| `/fix-checks` | Fixes what `/check` reported, with the smallest correct change. |
| `/finish-item [Qn]` | Progress row, handoff note, START-HERE, owner summary, commit and push (no merge). |
| `/council <topic>` | Five advisors review a big decision. |
| `/polish <page>` | Design and motion review against the rules in §4 and §5, as one table. |

**Reviewers** (`.claude/agents/`, only when asked): `universe-reviewer` (bugs and the project's
rules) and `universe-security` (access, input, secrets, money, files). They read and report; they
never edit.

**Hook** (`.claude/hooks/protect-secrets.mjs`, on in `.claude/settings.json`): blocks any tool call
that reads or writes the local secret files (`.dev.vars`, `.env*`; `*.example` is fine). Changing
`.claude/settings.json` needs the owner's own approval in Claude Code.

**Skills** (`.claude/skills/`, copied from Emil Kowalski's repository with its MIT licence; see §5):
`emil-design-eng`, `review-animations` (run it by name: it doesn't start by itself),
`animation-performance`, `mobile-native`.

**Scripts** (from `apps/web`):
- `pnpm check`: types, lint of changed files, unit tests, `pnpm lean`. Run before every commit.
- `pnpm lean`: lists files nothing uses and links to pages that don't exist (§3).
- `pnpm local:build`, then `pnpm local:serve` (add `--test-secret --owner-test` for the owner
  console): the real Worker on this computer. Browser checks are in `scripts/checks/`, for example
  `console-deck-ui.mjs` (the owner console) and `guide-ui.mjs` (the explainer whiteboard).
- `node scripts/gen-guide-data.mjs`: the facts the "UniVerse explained" whiteboard shows (every
  route, page, table, database change, language, test folder, library version). The build runs it.

## 2. Everything Claude Code (ECC)

- **Repositories:** github.com/affaan-m/everything-claude-code (the pack), github.com/affaan-m/ecc
  (the current pack, 311 skills, checked 22 Oct 2026) and github.com/worldflowai/everything-claude-code
  (a company's copy of the same pack, checked 22 Oct 2026).
- **Taken, fitted to this project (20 Oct 2026):** the commands, the two reviewers and the secrets
  hook in §1.
- **Left out on purpose:** the whole pack (its catalogue goes with every request: slower and
  costlier); its hooks (one blocks `pnpm dev`, one blocks new notes, others run a full type check
  after every edit, which takes minutes here); agents marked "use proactively" (they start an extra
  AI session after every change); its MCP servers (they need keys and send data to other services);
  memory and learning hooks; skills written for other stacks (Supabase, Redis, older Next.js); its
  motion skills (the motion layer already does what they describe, and two of their rules clash with
  ours).
- **Added 24 Oct 2026 (the owner gave permission), from the worldflowai copy (MIT, commit 432485b):**
  the strategic compact reminder (`.claude/hooks/suggest-compact.mjs`, on in `.claude/settings.json`;
  at 60 tool calls and every 30 after, it reminds Claude to suggest `/clear` or `/compact` at the next
  finished item) with its skill `strategic-compact`, and the `security-review` checklist skill (with
  an "In UniVerse" section: body.ts, D1 placeholders, access, secrets). Everything else in that copy
  is a duplicate or for another stack (see universe.mdc, "Optional: Everything Claude Code").
- **Installing more:** only with the owner's say-so. Install single pieces or a minimal profile,
  never the whole pack; read every hook before turning it on, and never turn on anything that sends
  code or data to another service. Details: universe.mdc, "Optional: Everything Claude Code".

## 3. Ponytail (lean code)

- **Repository:** github.com/DietrichGebert/ponytail.
- **In this project:** universe.mdc, "Keep it lean". Before writing code, go down the ladder: is it
  needed? is it already in the codebase? does the platform do it? does an installed package do it?
  can it be one line? Otherwise write the smallest version that works, with one small test. Never cut
  input checks, data-protecting error handling, sign-in and access checks, security headers or
  accessibility. Delete instead of commenting out. A known shortcut gets a `shortcut:` comment.
  Summaries to the owner say what was left out.
- **Tool:** `pnpm lean` (`apps/web/scripts/lean.mjs`, part of `pnpm check`). Keep it at zero.
- **Installed (24 Oct 2026, the owner asked for it):** its six skills are in `.claude/skills/`
  (`ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`,
  `ponytail-help`; where they came from: `.claude/skills/ponytail/SOURCE.md`). In Claude Code:
  `/ponytail` (or `/ponytail lite|ultra`) for the lean mode, `/ponytail-review` for a change,
  `/ponytail-audit` for the whole repo, `/ponytail-debt` lists the `shortcut:` comments.
- **Not installed:** its hooks (they switch the mode on in every session). The full plugin:
  `/plugin marketplace add DietrichGebert/ponytail`, then `/plugin install ponytail@ponytail`.

## 4. Impeccable (design)

- **Repository:** github.com/pbakaus/impeccable (Apache-2.0). One skill with 24 commands (`craft`,
  `audit`, `critique`, `polish`, `distill`, `harden`, `layout`, `typeset`, `animate`, …) and a checker
  with 62 rules for typical AI-made design problems.
- **In this project:** universe.mdc, "Design and motion" → "Look and reading". Meaningful text is
  11 px or more; running text near 75 characters a line; headings balanced; grey text checked
  against what's really behind it, in both themes; no cards inside cards. The `/polish` command
  applies it.
- **Its checker was run on 23 Oct 2026** on the landing page, sign-in, a legal page and the student
  home (the in-page version, `crates/live/assets/detect-antipatterns-browser.js` in their repository,
  called with `window.impeccableDetectAsync()`). Fixed from it: text under 11 px, lines of about 110
  characters on the legal pages, low contrast on the student home's first card, single words left on
  the last line. Kept on purpose: the two-tone gradients (then purple to fuchsia; dark blue with hot-pink light since 24 Oct), glow, gradient words and the
  italic accent (the owner's brand).
- **Running the checker again:** `npx impeccable detect <folder or url>` (downloads its engine the
  first time), or load the in-page file into a browser test as above.
- **Installed (24 Oct 2026, the owner asked for it):** the skill is in `.claude/skills/impeccable`
  (version 4.7.1; where it came from and how to update it: its `SOURCE.md`) and its four helper agents
  in `.claude/agents/impeccable-*.md`. Type `/impeccable` in Claude Code for its menu, or a command:
  `/impeccable generate 3 variants hero` (choices to pick from in the browser), `/impeccable live`,
  `/impeccable animate <page>`, `bolder`, `quieter`, `colorize`, `typeset`, `layout`, `critique`,
  `audit`, `polish`. Its launcher downloads the Impeccable engine on first use (into
  `~/.impeccable/bin/`); `/impeccable init` writes PRODUCT.md for it.
- **Not installed:** its hooks, which run the engine after every edit. `npx impeccable install`
  adds them if the owner wants them. Judge every finding against the brand rule.

## 5. Emil Kowalski's skills (motion and polish)

- **Repository:** github.com/emilkowalski/skills (MIT), from his work at Vercel and Linear.
- **Copied into `.claude/skills/`** (licence kept in each folder): `emil-design-eng` (the main
  design-engineering skill), `review-animations` (strict review; run it by name), `animation-
  performance` (dropped frames, which properties to animate), `mobile-native` (making the web app
  feel native on phones). To update them, copy the folders again from the repository.
- **In this project:** universe.mdc, "Design and motion" → "Motion". Don't animate what's used many
  times a day; ease-out for things arriving; UI motion under 300 ms with faster exits; nothing grows
  from scale 0; menus grow from where they were opened; name the properties instead of
  `transition-all`; stagger lists by 30–80 ms; Reduce Motion stops movement. Applied on 23 Oct 2026:
  the study assistant and the call's knock badge no longer grow from nothing; a light effect's fade
  uses ease-out.
- **The rest of his skills** (`animate`, `improve-animations`, `find-animation-opportunities`,
  `animation-vocabulary`, `apple-design`, `pick-ui-library`, `prototype`, `break-ui`, `ask-sonner`;
  `animate-expo` and `write-swift` are for native apps): `npx skills@latest add emilkowalski/skills`.
  `ask-sonner` is useful here: UniVerse's toasts use Sonner, his library.

## 5b. REA: Reverse Engineer Anything (analysing apps and binaries)

- **Repository:** github.com/morluto/rea (MIT), npm package `rea-agents`. One MCP server for
  reverse engineering: native binaries (with Ghidra, Hopper or IDA as the engine), JavaScript and
  Electron apps, .NET assemblies, Android apps and websites. Results come with their evidence.
  **Lawful use only** (its `DISCLAIMER.md`): software you own or may examine, security research,
  interoperability. Never for cracking licences, DRM, anti-cheat or copying someone's code.
- **On this machine (24 Oct 2026):** Node 24.22.1 in `/opt/node24` (REA needs 22.23.4 or newer;
  the project keeps the machine's Node), Ghidra 12.1.4 in `/opt/ghidra_12.1.4_PUBLIC` with the
  machine's JDK 21, REA 6.7.0 built in `~/rea`, registered with Claude Code as the `rea` MCP server
  (Node 24 pinned) plus its `reverse-engineer-anything` skill. `rea doctor --provider ghidra` is
  healthy, and a real Ghidra decompile of a small program worked.
- **In a new cloud session:** the machine starts fresh, so run `sh tools/setup-rea.sh` from the repo
  root (about 10 minutes; checks every download against its SHA-256), then restart Claude Code.
- **Not set up:** Hopper (macOS/Linux app, needs approval), IDA, JADX and Kuna (REA never downloads
  these; each needs its own path, see `~/rea/docs/installation.md`).

## 6. Design references the owner gave

- **AgentGPT** (github.com/reworkd/AgentGPT, agentgpt.reworkd.ai): how its pages load, arrive and
  glide. Studied for S1–S3; what was taken and why is in `apps/web/STAGE-5-HANDOFF.md`.
- **The Relay video:** the landing page (M8), the river of light down every page
  (`src/components/LightTrail.tsx`), the flow card (`src/components/landing/FlowCard.tsx`).
- **The "Cadra" reel:** the card look and the motion of M3 and M4 (`src/app/globals.css`).
- **The owner's colours (since 24 Oct 2026):** dark blue (`#06141B #11212D #253745 #4A5C6A #9BA8AB #CCD0CF`) is the normal UI colour (page, menu, buttons, selections); hot pink with a little purple (Tailwind's own `pink-*` / `fuchsia-*`) is the light: the light river's lines, glows and animations. Mapped in `globals.css`. Never another palette; green, amber and red only for states.

## 7. Services and accounts (all set up by the owner)

Cloudflare (Workers Paid, $5 a month: D1, R2, Durable Objects, builds), Firebase (sign-in; phone
sign-in needs Firebase billing, which is the owner's call), GitHub (merging deploys the site), each
school's own Stripe or Razorpay, and Polygon (certificate fingerprints). Keys and passwords are set
by the owner in Cloudflare: never read `.dev.vars`, never ask the owner to paste a key. Anything that
costs money or needs a new account is the owner's decision. Cloud sessions may also have connectors
(GitHub, Cloudflare's documentation); they're helpers, not part of the project.

## 8. Where everything else is

- `START-HERE.md`: where the work stands, how to set up and run it.
- `.cursor/rules/universe.mdc`: the working rules for every agent (safety, product rules, limits,
  database changes, checks, lean code, design and motion, lessons learned).
- `apps/web/AGENTS.md`: this Next.js version and the checks before every commit.
- `apps/web/STAGE-5-PLAN.md`: the work queue and the Progress table (one row per item).
- `apps/web/STAGE-5-HANDOFF.md`: notes for the next agent, item by item.
- `apps/web/DEPLOY-CLOUDFLARE.md`: how the site is built and deployed.
