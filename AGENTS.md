# UniVerse: the guide for every AI agent

**Read this whole file before you work.** It is the only file you must read: who the owner is, what
the project is, the rules, how to work and test, where things stand, and the tools. Claude Code,
Cursor, Codex and other agents all start here (`CLAUDE.md` and `.cursor/rules/universe.mdc` only
point to it). Two more files hold the history; open them only when a task needs them, and read only
the part you need:

- `apps/web/STAGE-5-HANDOFF.md`: a note per finished piece of work (traps, rules for code that
  builds on it). The newest notes are at the end (M55 is the latest).
- `apps/web/STAGE-5-PLAN.md`: the work queue (section 4) and the **Progress** table at the end.

The app is all in `apps/web`. It is **Next.js 16**, which differs from older versions: check
`node_modules/next/dist/docs/` before using a Next.js API.

## 1. The owner and how to work with them

- **The owner is not a developer.** Explain in plain words, short and concrete. At the end of every
  task say what changed, what they can do now, and what they need to do. No jargon without a
  one-line meaning. Say what was left out on purpose.
- **Be brief while working.** Don't recap unless asked; show only what matters. Read only the
  function or lines you need, never whole big files. When running commands or tests, show only
  failures.
- **Merge only when the owner says "merge"**, each time. Commit and push finished work to the
  branch; don't open a pull request unless asked.
- **When the owner reports an error** (often the "problem(s) need a look" email): read the live
  site's `error_reports` table first (production D1 `universe-db`, through the Cloudflare tools,
  read-only: message, path, stack, diagnosis; never people's details). Fix the cause, then tell the
  owner to mark the reports resolved in the owner console.
- **One commit per finished item**, then a short note at the end of `apps/web/STAGE-5-HANDOFF.md`, a
  **Progress row** in `apps/web/STAGE-5-PLAN.md`, and the "Where things stand" lines in section 4
  below (including the next database number).
- Anything that **costs money or needs an account** (a paid service, SMS, app stores,
  Google/Microsoft apps, Razorpay): ask first; build it behind a switch, off, and mark it **[owner]**.
- After a finished, pushed piece of work, suggest a fresh conversation (or `/clear`), so the long
  history isn't re-sent with every message.

## 2. Safety (never break these)

- **Never handle real secrets.** Real keys live only in the Cloudflare dashboard. Never read or
  write `.dev.vars` or `.env*` (a hook blocks it in Claude Code), never ask the owner to paste a key,
  never put a key in any committed file. Local tests use placeholders on the command line
  (`pnpm local:serve --ai-placeholder`).
- **No AI model names or IDs** in commit messages, pull requests or code comments.
- **Never weaken sign-in or access checks** (`src/server/auth.ts`, `src/lib/server-auth.ts`,
  `src/server/access.ts`). The local **demo admin is read-only by design**: don't get around it;
  test admin saving with unit tests (mocked Prisma).
- **Request data is untrusted**: read bodies and queries through `src/server/body.ts` (`oneOf`,
  `str`, `text`, `strings`, `first`; `num` and `short` in `src/server/trace.ts`) and give Prisma only
  `pick<Prisma.XInput>(body, keys)` (`src/server/pick.ts`). Raw SQL always with `?` placeholders.
  Every route that serves people's data checks who is asking; a public route never returns emails
  or phone numbers.
- Never send a Trace batch's `secret` to a browser; a shipment's carrier key is a password (sensors
  use it), never shown to buyers.

## 3. What UniVerse is

**UniVerse Impact: one account, many apps** (the owner, 24 Oct 2026: "a lot of different mini
software or website in the main website… where they create a impact"). Each app is listed once in
`src/lib/apps.ts` (`APPS`, `appFor(path)`, `appHome(app, role)`):

- **UniVersity**: the school and university platform (courses, grades, timetable, messages, etc.).
- **Trace** (`/trace`): every product gets a passport. Brands print signed codes; anyone scans at
  `/t/<code>` (`/t/demo` is a sample); live market and tracking maps, shop points and a wallet,
  campaigns, recalls, prizes, warranties, reviews, an ownership vault, the Radar and Insights,
  public brand pages `/b/<slug>`, cold chain with real sensors.
- **Relief** (`/relief`): needs and offers of help on a live map, with notifications and nearby
  alerts for helpers.
- **Green** (`/green`): climate actions with the CO₂ they save, streaks, badges, a weekly challenge,
  teams and a map.
- **Play** (`/play`): twelve games: two per app (quick: Quiz Clash, Spot the Fake, Supply Run,
  Recycle Rush; big: Type Race, World Pin, Flood Rescue, Ocean Cleanup) and four 3D worlds
  (three.js: Skyline Obby, Ridgeline Ops 16+ (open-world extraction shooter: rules `src/lib/play/ops/`, game `src/components/play/ops/`), Night Shift 18+, Orbit Breach 12+; rated games check
  the birth date or ask), solo or up to 8 friends in a room with a code (the `GameRoom` Durable
  Object), leaderboards.

Shared by all apps: the hub `/hub`, Messages, Collaborate (the owner likes it: keep it), Settings,
and the owner console `/console`. Each app has its own menu (`Sidebar.tsx` `navFor`, the app
switcher under the brand), phone tabs (`app-tabs.ts`), landing tab and sign-in / sign-up tab
(`?app=`, remembered in sessionStorage `uv-app`, `useChosenApp`). `homeFor(user, app)` sends a
person to their chosen app, otherwise to `/hub` (the owner: `/console`).

**A new app needs:** an `APPS` entry, its nav and tabs, a landing tab section, a card on `/hub`
(`GET /hub`, `src/server/hub.ts`) and sample answers (`src/lib/sample/impact.ts`).

## 4. Where things stand (31 October 2026)

- **`main` has everything through M33** (PR #95, 25 Oct): the impact apps (M21), Relief alerts and
  sensors (M22), Google sign-in fixed (M23), the Impact Wallet (M24), proof for Green actions
  (M25), sample errors not counted (M26a), launch board and invites (M26), simpler UniVersity menus
  (M27), 500 people a month on the $5 plan (M28, migration 0184), pointer glides (M29), Ask
  UniVerse (M30), UniVerse Play with eight games and rooms (M31, M32; migration 0185, `GameRoom`),
  the folding side menu (M33). Every item has a note in the handoff file and a Progress row.
- **Merged since:** M34 (the "Karma" look, see §8), M35a (maps wrap and pan) and the M35 game
  arena with four rebuilt games (PR #96); the World Pin map fix, the landing's one-picture-per-app
  (`HeroScenes.tsx`), **M36** 3D worlds (three.js, `src/components/play/world`, age ratings),
  **M37** (game bug sweep, longer rounds, player levels and looks), **M38** (other players live in
  3D rooms, a skill per world, the big-game layer) and **M39** (text chat and 13+ proximity voice in
  3D rooms, realistic lit surfaces, a new feature in every game) (PR #97); **M40** (Ridgeline Ops
  replaces Neon Strike: a first-person extraction shooter on a seeded island) (PR #98, 26 Oct). **M41**
  (new Green and Play pictures, also on sign-in; a press ripple, magnetic buttons, tilt and a
  cursor light), **M42** (link previews, icon count, install guide, Share to UniVerse, much less
  text), **M42a** (no "Try the live demo" on sign-in), **M43** (more Relief, Green and Play
  sections with "try it here" demos; photos shared in), **M44** (the landing's scroll story and
  live totals, migration 0186), **M45** (glides, celebrations, optional sounds, swipes, bottom
  sheets, one vibration), **M46** (today's classes, courses and chats readable offline, the
  iPhone launch screen, bar colours per theme; its river check was removed in M56a) and
  **M47** (the landing's demos run only on screen; light and sideways iPad launch screens),
  **M48** (live cards after the owner's "Crew" video: 3D constellations and funnels of light on every
  home, `src/components/live`), **M49** (heartbeat, radar and pulse-grid pictures, tabs that
  cascade their cards in, the owner console's live cards), **M50** (Trace in motion after the
  "Waypoint" video: a night city of vans, journey lines, level gauges, a timetable with now) and
  **M51** (the night city much richer: traffic, neon, beams, depth) and **M52** (the "Globynk" colours
  everywhere: navy, aqua, Baby Pink; the dotted planet on the landing and hub; 3D cards on the Impact
  Wallet), **M53** (light mode in Marshmallow White, Galactic Violet and Bubblegum Pink), **M54** (more
  Aqua Jade in dark mode) and **M55** (the "Globynk" picture everywhere in dark mode: navy-to-aqua
  pages, glass cards, the network globe) (merged into `main`, 31 Oct).
  **M56** (31 Oct, merged, PR #102): the river pink again and never stuck, a third cheaper; the scroll
  story's pictures full size; the planet section fades into the page; sign-in fits one laptop screen.
  **M56a**: nothing slows or stops the river by itself any more (only Reduce Motion stills it).
  **M57** (on the branch): dark mode deep navy with Aqua Jade glows (no pale blue); no line under the hero.
  **[owner]** turn on Bot Fight Mode (Cloudflare → Security → Bots).
- **The owner's pick of 31 Oct ("do all of them", store apps left out, no funds)**: M43 to M46 all
  done, and M47 (M46's two leftovers). Next: ask the owner (the last speed idea, ~400 kB of scripts
  on a first visit, is in M47's handoff note).
- **Next database update number: `0187`** (files in `apps/web/prisma/migrations/`).
- **Being built, the owner's pick of all seven ideas** (25 Oct: "work on all 7 of them"), one item each
  in this order: one Impact Wallet across all apps (done, M24); proof for Green actions and
  challenges (done, M25); organisation accounts for Relief (NGOs, supplies, volunteer shifts; SMS/WhatsApp requests behind a
  switch); an "Ask UniVerse" assistant that acts in every app (small version done, M30); the EU Digital Product Passport for
  Trace (GS1 codes, supplier portal); self-serve payments for Trace PRO, campaigns and schools (off
  until the owner's Stripe keys); store apps for Android and iPhone (the owner's store accounts).
- **Waiting on the owner** (only they can provide it): Google / Microsoft calendar sync apps; Google
  Classroom import; a real LMS for grade passback; Razorpay (UPI) and anything that costs money;
  Stripe webhook events for donations (`checkout.session.completed` and
  `checkout.session.async_payment_succeeded`); `SESSION_SECRET` of 32+ characters on the Worker
  (tickets, check-in codes, calendar links).

## 5. Run, test and publish

Set up once (the owner's computer; on Windows use WSL): Node.js 22, Git, `corepack enable`, then
`git clone https://github.com/PerSis2863/UniVerse.git`, `cd UniVerse`, `pnpm install`,
`cd apps/web`, `pnpm local:setup` (local database with every update and sample accounts). For
browser checks: `npm install -g playwright`, `npx playwright install chromium`. No keys are needed
locally. After `git pull`: `pnpm install` and `pnpm local:setup` again.

From `apps/web`:

| Command | What it does |
|---|---|
| `pnpm local:dev` | Quick editing at http://localhost:3000. |
| `pnpm local:build` | Builds exactly as Cloudflare does (10–15 minutes). Don't edit files while it runs. |
| `pnpm local:serve` | Runs that build at http://localhost:8787 (`--ai-placeholder`, `--test-secret`, `--owner-test`, `--payments-test` for those checks). |
| `pnpm check` | Before every commit: types, lint of changed files, unit tests, `pnpm lean`. |
| `node scripts/checks/<name>.mjs` | Browser and API checks while `local:serve` runs (list: `scripts/checks/README.md`). |

On the local login page, "Or test with demo accounts" signs in without a password (Demo Student,
Teacher, Admin, IT support); tokens `mock-token-demo@student.com` etc. work against the local
server. Sample accounts: alice@ / bob@student.com, tara@ / tom@teacher.com (course CS101).

**Before every commit:** `pnpm check` must pass: `pnpm typecheck` (the only type check: the deploy
build skips it; give it `NODE_OPTIONS=--max-old-space-size=8192`), eslint **0 errors** and the
whole repo under 50 warnings with **no disable comments** (fix the cause), the unit tests, and
`pnpm lean` at zero. For screens: a Playwright + axe check like those in `scripts/checks/`. Never
commit changes a build makes to `public/sw.js`, `public/fallback-*.js`, `public/workbox-*.js` or
`cloudflare/next-public.gen.ts` (`git checkout -- apps/web/public/sw.js` after a build).

**Publishing:** merging into `main` publishes the site. Cloudflare builds it, applies new database
updates, then puts it live (about 15 minutes; Workers & Pages → universe-web → Deployments;
`apps/web/DEPLOY-CLOUDFLARE.md`). Only `main` builds (other branches stop in seconds,
`scripts/build-budget.mjs`).

**Database changes:** hand-written SQL in `apps/web/prisma/migrations/NNNN_name.sql` plus
`prisma/schema.prisma`; then from `apps/web`: `PRISMA_GENERATE_SKIP_AUTOINSTALL=1 npx prisma
generate`, `npx wrangler d1 migrations apply universe-db --local`, `node scripts/gen-owner-schema.mjs`.
A new API route: `node scripts/gen-api-routes.mjs` (also rebuilds `cloudflare/page-routes.gen.ts`; a
page with a `[param]` is built once as `/x/open` and answered for every value). New screen text:
`node scripts/gen-ui-strings.mjs`.

## 6. Code rules

**Product**
- **No new emails** unless the owner asks: notify in the app with `notify` / `notifyMany`
  (`src/server/email.ts`, `email: false`) and push with `pushService` (`src/server/services/push.service.ts`).
- New features go **inside existing menus, as tabs**, not new top-level pages.
- Links: only `@/components/ui/Link` (it preloads on intent; never prefetch whole menus). Motion:
  `import { m as motion } from 'framer-motion'` and the springs in `src/lib/motion.ts`.
- Languages: start/end classes (`ms-` `me-` `ps-` `pe-` `start-` `end-` `text-start`), not
  left/right, so Arabic and Urdu mirror (`node scripts/rtl-logical-classes.mjs`); mark people's own
  content `translate="no"`.
- **No polling.** Live updates: `publish()` (`src/server/realtime.ts`) plus `useLiveInterval`, or
  `useActivePoll` (`src/lib/realtime-client.ts`).
- **AI** always: `spendAi` (daily allowance), `featureOff('ai')` (the owner's switch), the AI cache
  (`cachedAi` / `saveAi`) when everyone would get the same answer; show answers with `MathText` and
  put `MATH_RULE` in prompts (`src/lib/tutor-rules.ts`).
- **Charts and numbers:** `InstrumentBoard` (`src/components/instruments/Board.tsx`) with the parts
  in `parts.tsx` (`Spark`, `Histo`, `HeatStrip`, `Dial`, `Stack`, `Ring`, `Meter`, `Facts`…), hot
  pink (`--ins-hot`) only for what matters; maths in `src/lib/instruments.ts`. Not recharts' defaults.
- **Folders** (`FolderCard`): always colourful (pass `index` in lists); no `filter`,
  `backdrop-filter` or `aspect-ratio` in them (Safari). Check new screens in Safari too.
- **Accessibility:** every screen axe-clean (serious/critical) at 390 and 1280 px, light and dark,
  no sideways scrolling.

**The apps' own rules**
- **Trace:** a unit's code is `codeKey + serial + HMAC signature` with the batch's secret
  (`src/server/trace.ts`), so codes can't be guessed and rows exist only once scanned. A label seen
  far from its first scan or too often is a likely copy (`src/lib/trace.ts`). One brand per account
  (`trace_brands`, membership checked by `brandOf`, never the school role); points per brand in
  `trace_points` (hash-chained); campaigns pay per verified scan with a budget taken by a guarded
  update; maps snap to 0.1° (0.5° for the PRO category layer) so no shop or person can be found.
  Second wave (`src/server/trace-plus.ts`): recalls, blocks and grey-market countries per batch;
  instant wins decided by the batch secret (`wins`), claim code shown once; warranty, review and
  owner rows one per unit, refused on a likely copy; shop tiers (`TIERS`). Temperatures go only in
  `trace_readings` (`recordReading` in `trace-map.ts`). Maps: `src/components/trace/map` (d3-geo,
  no tile service): one canvas, land cached, frames only while something moves.
- **Relief** (`src/server/relief.ts`): positions rounded to about 500 m when saved; nothing older
  than 30 days on the map; nearby alerts (`relief_watches`) never email and never show where a
  watcher is.
- **Green** (`src/server/green.ts`): positions rounded to 0.1°; CO₂ factors only from `src/lib/green.ts`.
- **Sample data, two kinds:** the owner's "Fill with sample data" on the console Overview writes a
  made-up world in steps (`src/server/sample-world.ts`), marked so "Remove" takes out exactly that
  (emails `@sample.universe.test`, ids `smp…`, slugs `sample-`). A signed-in "Explore with sample
  data" never touches the server: answers come from
  `src/lib/sample/router.ts` and `impact.ts` in the browser. **Every new GET route needs a sample
  answer there**, or the demo shows it empty; writes call `notice()`.

**Platform limits** (Cloudflare Workers Paid since 22 Oct 2026)
- 30 s CPU (capped at 15 s in wrangler.jsonc), 10,000 subrequests a request; the spending guard
  (`cloudflare/usage-guard.ts`) emails at 70% of what the $5 plan includes and pauses at 90%.
  Plan-dependent numbers go through `planLimits()` / `workersPaid()` (`src/lib/plan-limits.ts`).
- **D1: at most 100 bound values per query** (chunk lists by 90) and **at most 50 queries per
  request** in normal routes; no transactions (claim with a conditional `updateMany`). Long `in`
  lists are split for you (`src/lib/d1-split.ts`) except inside `OR`, a relation filter or `notIn`.
  Long jobs check `queriesUsed()` and carry on in the next run (`src/server/daily-jobs.ts`).
- The build machine has 8 GB, 2 CPUs and 20 minutes: keep heavy libraries out of first-load
  bundles (dynamic `import()`).
- The light API path (`cloudflare/fast-api.ts`) runs the same code as its Next route; new account
  fields also go into its `usersMe`; the startup bundle keys (`src/lib/bootstrap.ts`) match the head
  script.

**Gotchas already learned**
- React hooks lint: no reading refs while rendering, no `setState` directly in an effect body (in a
  callback or promise is fine), no `Date.now()` while rendering (`src/lib/use-now.ts`).
- axe "label-content-name-mismatch": a button's `aria-label` must match its visible text; add
  `sr-only` text instead.
- Browser tests: mark the welcome tour seen first (`localStorage` `universe-tour-done:<user id>`);
  pause ~150 ms after typing before a ProseMirror toolbar action; wait for the calendar's slide-in.
- Firebase pop-up sign-in only through `popupSignIn` (`src/lib/firebase.ts`); the phone sign-in's
  reCAPTCHA box stays outside the steps (`PhoneAuthFlow.tsx`).
- The offline service worker is registered by `UpdateNotifier` (the PWA plugin's `register` is off).
- KaTeX: import `katex/dist/katex.mjs`. Attendance rows are stored at midnight UTC of the class day.
- `pkill -f <pattern>` can match its own shell: kill by port (`lsof -ti tcp:3000`) instead.

## 7. Keep it lean (after Ponytail)

Before writing code, stop at the first step that works: (1) is it needed at all? (2) does the
codebase have it (`src/lib`, `src/components/ui`, `src/server`)? (3) does the platform do it (Web
APIs, CSS, Next.js, Workers, D1)? (4) does an installed package do it? (5) can it be a line or a few?
Otherwise the smallest version that works, plus one small test for any logic.

Never "simplify" away input checks, error handling that protects data, sign-in and access checks,
security headers or accessibility. Delete instead of commenting out; when something replaces old
code, remove the old code in the same change. A known shortcut gets a `shortcut:` comment.
`pnpm lean` lists files nothing imports and links to pages that don't exist: keep it at zero (a
file used only from config goes in its `BY_CONFIG` list).

## 8. Design and motion

**Light mode (M53, the owner, 31 Oct 2026): Marshmallow White #F0F0F0, Galactic Violet #533FF6, Bubblegum
Pink #EC74CE.** An off-white page with pink and violet light low down, white cards, ink #141320, black
selected pills, violet accents and focus, the main button Bubblegum Pink with ink text; light mode
re-points the Tailwind scales (`html:not(.dark)`: indigo / violet / purple = violet, pink = Bubblegum,
zinc = neutral greys) and `.dark` parts get the navy ones back. Use `violet-*` where dark mode uses
`aqua-*`. Everything below is dark mode, the default.

**The look: "Globynk" (M52, the owner, 31 Oct 2026; replaced M34's warm graphite "Karma").** Three
colours: **Midnight Abyss #171F44** (navy: the page in dark mode, the ink, the side menu), **Aqua Jade
#74FFED** (the glow rising from the bottom of every page, focus in dark mode, the planet; M57: always
a glow over deep navy #0f1536, never a pale blue fill) and **Baby
Pink #FE81D1** (the light: the main button, the river, live states, arcs). Dark mode (the default): every
page fades from Midnight Abyss at the top into deep Aqua Jade at the bottom (M55, `.ambient-bg`; its
lightest point keeps white text at 4.5:1), cards are 80% navy glass (blurred on big screens), the side
menu see-through navy glass, the planet a glowing network globe. **In dark mode
pink is the action, Aqua Jade is everything chosen or highlighted (M54)**: selected pills, accent text
and icons (`dark:text-indigo-300` is aqua there), outlines, chart lines, links.
Light mode: an ice-white page (#e9eef8) with the same glows, white squircle cards (`--radius-card`,
`corner-shape: squircle` where the browser has it), navy pills. **`.btn-primary` is a Baby Pink pill
with navy text in both themes**; text on Baby Pink is always navy (white needs `pink-600` or deeper).
The side menu is deep navy in both themes, the chosen entry a white pill with a pink edge. Tailwind
names: `indigo-*` / `violet-*` / `purple-*` = the navy scale (indigo-600 = #2b3568, 900 = #171f44),
`zinc-*` = cool greys, `pink-500` = Baby Pink, `fuchsia-*` an orchid beside it, `aqua-*` = Aqua Jade
(300; only `aqua-700` as text on light backgrounds). Headline cards wear frosts (`--karma-dusk` navy
into deep aqua, `--karma-gold` pale aqua, `--karma-olive` navy into orchid; names kept; `kpi-row` uses
the first two, `.karma-frost` for any card); thin-line icons sit in circles (`.karma-icon`), round ink
arrow buttons (`.karma-go`). Type: Urbanist, served from `/fonts/urbanist` (no outside service). No
other new hues; green, amber and red only for states. `.panel` / `.card` / `.btn-primary` /
`.ios-segmented` carry the look, so new screens get it by using them. The river and the italic accent
word are the brand, even where design guides call them "AI-looking".

**The motion layer works on every page by itself**: pages assemble out of a blur
(`src/lib/page-transition.ts`), titles sweep in, a light trail runs down the page (`LightTrail`),
figures count up, bars fill, charts draw (`src/lib/scroll-motion.ts`), cards glow under the mouse
(`.sheen`); opt a part out with `data-no-motion`. Rules: motion has a job (arriving, changing,
answering a tap) and never makes anyone wait; nothing animated on things used many times a day;
ease-out for arrivals with the project's curves (`--ease-glide`, `--ease-ios`, `--ease-out-soft`,
`spring`); UI motion under 300 ms, exits faster than entrances; nothing grows from scale 0 (start
at 0.85–0.95); menus grow from where they were opened; name the properties (`transition-[transform,opacity]`,
not `transition-all`); animate transform and opacity only; stagger lists 30–80 ms; Reduce Motion
leaves only fades; never animate what sits under full-screen frosted glass; hover-only extras show
without hover on touch screens.

**Reading:** meaningful text 11 px or more (12 px running text; no new `text-[10px]`); running text
near 75 characters a line; grey text 4.5:1 against what's really behind it, in both themes; no
cards inside cards; spacing and sizes from the scale in use.

## 9. Tools and skills (in `.claude/`, usable by any agent as checklists)

Use them by default (the owner, 24 Oct 2026: "start using all these skills… efficiently"); load a
skill only when the task needs it. These rules win any clash with a tool's advice.

- **Commands:** `/plan-item` (plan before coding), `/check` (checks, failures only), `/fix-checks`,
  `/finish-item` (notes, commit, push; no merge), `/council <topic>` (five advisors on a big
  decision), `/polish <page>` (design and motion review).
- **Reviewers** (only when asked): `universe-reviewer` (bugs, project rules), `universe-security`
  (access, input, secrets, money, files).
- **Coding:** `ponytail` (lean mode; `/ponytail-review` before finishing a bigger change,
  `/ponytail-audit`, `/ponytail-debt`). **Security:** `security-review` checklist for sign-in, input,
  secrets, money, files and public routes.
- **Screens and motion:** `impeccable` (`/impeccable`, with `generate` and `live` for choices to pick
  from, `animate`, `bolder`, `critique`, `audit`…; its engine downloads on first use) and Emil
  Kowalski's `emil-design-eng`, `review-animations`, `animation-performance`, `mobile-native`.
- **Hooks:** `protect-secrets.mjs` (blocks the secret files) and `suggest-compact.mjs` (after 60 tool
  calls, suggest a fresh conversation at the next finished item). Changing `.claude/settings.json`
  needs the owner's approval.
- **REA** (reverse engineering, Ghidra engine), set up on the machine, not in the repo: in a new
  cloud session run `sh tools/setup-rea.sh` (about 10 minutes), then restart Claude Code. Lawful use
  only: software the owner owns or may examine.
- **Where they came from:** Impeccable (github.com/pbakaus/impeccable, Apache-2.0) and Ponytail
  (github.com/DietrichGebert/ponytail, MIT), both without their hooks (see each skill's
  `SOURCE.md`); Emil Kowalski's skills (MIT); from Everything Claude Code only the commands,
  reviewers and hooks above plus `security-review` and `strategic-compact` (the full pack is left
  out: its catalogue slows every request, its hooks and "proactive" agents clash with this project).
  Design references studied: AgentGPT (page loading), the Relay video (landing, light river), the
  "Cadra" reel (cards). Install nothing more without the owner's yes, and never anything that sends
  code or data to another service.

## 10. Services and accounts (all the owner's)

Cloudflare (Workers Paid, $5 a month: D1, R2, Durable Objects, builds), Firebase (sign-in; phone
sign-in needs Firebase billing), GitHub (merging deploys the site), each school's own Stripe or
Razorpay, and Polygon (certificate fingerprints). Keys are set by the owner in Cloudflare (Settings
→ Variables and secrets). Anything that costs money or needs a new account is the owner's decision.
