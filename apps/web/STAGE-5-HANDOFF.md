# Stage 5 handoff: notes per finished piece of work

The guide for every agent is `AGENTS.md` at the repository root: read that first. This file is the
history, one note per item (traps, rules for code that builds on it). Read only the note a task
needs; the newest are at the end (M22 is the latest). The "Next steps" just below date from 21 Oct
2026 and are done.

## Next steps (written 21 Oct 2026 for whoever continues; do them in this order)

Everything up to here is merged into main (21 Oct 2026, with Q26 and S1). Next migration: **0174**. Work on a fresh branch
from main; one commit per item or batch; push; merge only when the owner says "merge".

1. ✅ **Done 21 Oct** (see "Phone smoothness, second pass" below). **Re-measure the last three phone fixes** (they pass the checks but weren't tried in a browser):
   the Notifications panel (`src/components/layout/Topbar.tsx`: slides with a whole `transform`, rows
   use the CSS `.stagger` cascade), the logo's ping (`.universe-ping` in `globals.css`, plays 5 times,
   only when `animated`), and `.stagger` now `backwards` (cards keep their hover lift and press
   scale). Build, serve, then `node scripts/smoothness.mjs http://localhost:8787`. Before the fixes,
   at 4× slower CPU: Notifications open about 920 ms of long tasks (worst frame 450 ms), side menu
   open about 300 ms, tab switches 390–750 ms, scrolling smooth (0–8 slow frames). Also check by eye:
   the panel slides in and out on the right, and from the left in Arabic or Urdu (Settings →
   Language); the rows cascade in; tapping a row still scales it; the home logo stops pinging.
2. ✅ **Done 21 Oct** (see "Accessibility sweep, all four ways" below). **Re-run the accessibility sweep** on the new build: `node scripts/crawl.mjs --axe` (desktop
   light), `--phone --dark --axe`, and the two not run yet: phone light and desktop dark. The
   desktop-light list from before (`/student/impact/ai-match`, knowledge hub, study rooms, BeeSafe,
   credentials, community, join, scholarships, tutoring, reels, legal links, marketplace selects)
   was fixed in code; confirm and fix what's left.
3. ✅ **Done 21 Oct** (below). **Side menu's first open** (`src/components/layout/Sidebar.tsx`): the tap adds `scroll-locked` to
   `<body>`, and the next read forces a whole-page style recalculation (1,158 elements, about 210 ms at
   4× slower CPU) inside the tap. Try locking scroll without a body class change (for example
   `overscroll-behavior: contain` and `touch-action: none` on the drawer and backdrop, or set the lock
   one frame after the drawer starts moving), then measure with
   `node scripts/smoothness.mjs --profile "side menu"`.
4. ✅ **Done 21 Oct**, partly (below). **Tab switches** cost 0.4–0.7 s of main-thread work on a slow phone (`/student` 750 ms, inbox 680,
   NGO marketplace 570, courses 390). Profile each (`--profile "tab bar"`) and lighten the first
   render: defer widgets below the fold, and replace per-row framer-motion entrances inside `.map()`
   with the CSS `.stagger` cascade (the pattern that made Notifications slow).
5. ✅ **Done 21 Oct** (Q24, Q25, Q26 below; what's left and why is in the Q26 Progress row). **Feature and button upgrades** (the owner's request): the rest of Phase E, listed in the Q23
   Progress row's "what's left" (undo toasts, drag-and-drop and paste on file fields, bulk actions
   and CSV export on tables, sticky headers and saved filters, long-press menus, "New items ↑" on
   live lists, forward with comment, selecting several messages, device switch mid-call, colour per
   course, language switch in the top bar, admin "Resend invite" and bulk role change, and so on).
   Batches of about 10, as new tabs inside existing menus.
6. Then anything the owner picks from "Waiting on the owner" in `START-HERE.md`.

**How the slow spots were found** (repeat it for any new one): a Playwright phone (390 × 844, touch)
with `Emulation.setCPUThrottlingRate` 4, `browser.startTracing` with the categories
`devtools.timeline` and `disabled-by-default-devtools.timeline.invalidationTracking`, then sum the
main thread's `UpdateLayoutTree` / `Layout` / `Paint` events and count the invalidation events by
element and reason. That's how the endless SVG ping (SVG animations re-lay out and repaint every
frame; they can't run on the GPU) and the per-row JS animations showed up. An idle page should
show almost nothing.

## M4 · The "Cadra" look everywhere and the light trail (23 Oct 2026, owner request)

- The look is one block at the end of `src/app/globals.css` ("M4 · The Cadra look"): tokens on `:root`
  / `.dark` (unlayered, so they win over the older `@layer base` ones), ink buttons only under
  `:root:not([data-accent])`, solid `.panel`, `.glass-sidebar`, `.ios-glass`, `.kpi-row`.
- `src/components/LightTrail.tsx` (root layout; on the landing page inside its own background):
  `.trail-track` is 300vh and moves -200vh over the page's scroll (`animation-timeline: scroll(root)`,
  else a rAF scroll listener). Strands use `vector-effect: non-scaling-stroke`. Colours `--trail-a/b/c`,
  strength `--trail-strength` (0.5 light, 0.95 dark).
- Removed: `PageAurora` (top-of-page ribbons) and the side menu's Recent list (`recent-pages.ts`).

## M3 · Error hub, the "Cadra" reel's motion, breadcrumbs and recent pages (23 Oct 2026, owner request)

- `src/app/(dashboard)/console/errors.tsx`: `ErrorsPanel` (summary, filters, list) and `ErrorDetail`
  (tabs Overview / Technical / Fix with AI; `diagnosisParts` reads the AI's **Likely cause** etc.).
  Check: `node scripts/checks/error-hub-ui.mjs <shots dir>` with `pnpm local:serve --test-secret --owner-test`.
- `src/lib/browser-support.ts` `unsupportedBrowser(ua)`: bots, made-up Mac signatures, Chrome/Firefox
  < 100, Safari < 15.4. `recordError` files such reports as IGNORED; `ignoreUnsupported()` runs before
  each diagnosis. The recovery script doesn't report blank pages without `structuredClone`.
- Motion: `leaveFrames` blurs on 'fade'/'tab'; `scroll-motion.ts` kind 'cells' (≥ 20 square children
  ≤ 28 px under `[data-cells]`, `grid-cols-*`, `flex-wrap`) and `rollChanged` (characterData on
  `.tabular-nums`, its own count-up writes skipped via `writing`).
- `Breadcrumb` in `Topbar` from `crumbsFor(navByRole[role], pathname)`; desktop header is `min-h-16`.
  (The Recent list added here was removed again in M4 at the owner's request.)

## M2 · Bug check, new transitions, the $5 plan (22 Oct 2026, owner request)

- Workers Paid is on in the code: `CF_PLAN=paid` (wrangler.jsonc vars, `keep_vars`), `limits.cpu_ms`
  15000, `head_sampling_rate` 1. `workersPaid(env)` in `src/lib/plan-limits.ts` is the one check
  (also used by the guard and the light API path). Going back to Free: remove `CF_PLAN` and `limits`.
- Links prefetch on intent (`@/components/ui/Link`: 90 ms hover, touch start, focus; once per page).
- `src/lib/tap-motion.ts`: icon bounce (tab bar, side menu) and the card a page was opened from
  (`takeOrigin`); `PendingPage` zooms the page out of it on 'push' unless a skeleton came first.
- Depth: `.page-aurora` has a scroll-timeline animation (`aurora-depth`, globals.css M2 section).
- `PageAurora` sits in a zero-height `relative` holder in `<main>`; its bloom animates an inner layer.

## M1 · Motion you can see on every page (22 Oct 2026, owner request)

The owner said the site still looked the same after S1–S4: the motion was there but faint and
short, and only below the fold. Now (all automatic, nothing to add to a page):
- `src/lib/page-transition.ts`: `revealFrames` (blur 10 px → 0, 48 px rise, 880 ms, 95 ms apart),
  `titleFrames`/`sweepTitle` (the visible h1 sweeps in along the reading direction), `calmFrames`
  (Reduce Motion keeps only the fade). Used by `PendingPage` and `app-entrance.ts`.
- `src/components/layout/PageAurora.tsx` in `DashboardShell`'s `<main>` and the landing hero: three
  SVG ribbon layers drifting by transform (CSS `ribbon-1..3`), masked out before the cards, paused
  off screen, `min(340px, 50vh)` tall on touch screens. Not full-screen on purpose (see `.ambient-bg`).
- `scroll-motion.ts`: figures, bars and lines play wherever they are; `startSheen` (mouse only) adds
  `.sheen` to the `.panel`/`.card` under the pointer. CSS at the end of `globals.css` (M1 section).

## Security: admins see only their own school; payment keys encrypted (22 Oct 2026)

- **The rule** (`src/server/school-scope.ts`): `schoolsOf(user)` → the schools an admin's views
  cover: their `organizationId`, plus the organisation they own (`organizations.ownerId`, where
  OneRoster puts imported people); an admin in no school runs the main school (people with no
  `organizationId`); the verified platform owner gets `'all'`. Use `usersIn(schools)` (Prisma, users),
  `orgIn(schools)` (any record with its own `organizationId`), `schoolSql(schools, alias)` (raw SQL),
  `assertInSchool(user, personId)` (by-id: throws "not found"), `keepInSchool` (bulk), `inSchools`.
  A course belongs to its teacher's school (`access.ts` `adminOf`). **Any new admin endpoint that
  lists or changes people's data must use these.**
- Tests: `src/server/school-scope*.test.ts` (one file per area); browser check
  `scripts/checks/school-scope-ui.mjs` (moves the demo admin into the test school for a moment).
- Migrations 0174 (`invitations.organizationId`; the invited person joins that school) and 0175
  (`safety_alerts.organizationId`, kept for anonymous reports).
- **Payment keys** (`src/server/secret-box.ts`): `seal(value, "<orgId>:<field>")` / `open(...)`,
  AES-GCM, key from SESSION_SECRET (HKDF). Old plain keys are encrypted by the daily step
  `seal-secrets`. If SESSION_SECRET changes, schools must enter their keys again (Admin → Payments
  says so) and their payments stop meanwhile (never the site's keys).
- Still shared by every school (no school column yet): see the "Sec" Progress row.

## Cost guard: build minutes (22 Oct 2026)

`cloudflare/usage-guard.ts` meter `buildMinutes` (Workers Builds REST API, same read-only token);
`/api/build-budget` (answered in `cloudflare/worker.ts` before the gate) and
`scripts/build-budget.mjs` (first step of `pnpm build`, only on Workers Builds: `WORKERS_CI=1`):
not `main` → stop; past 90% of 6,000 minutes on the paid plan → stop. `CF_GUARD_OFF` overrides.

## S4 · Scroll motion on every page (22 Oct 2026, owner request)

`src/lib/scroll-motion.ts` (see its header) + `src/components/ScrollMotion.tsx` in the root layout;
CSS `[data-sr]` and `.aurora-a/.aurora-b` in `globals.css`. It only tags parts that start below the
screen, so the page entrance (S1-S3) isn't doubled. Opt out with `data-no-motion`.

## Q26 · Scheduled exports, table tools and a blog: done (21 Oct 2026)

- **Scheduled exports** (`src/server/report-schedules.ts`, `src/components/admin/ScheduledExports.tsx`,
  routes `src/app/api/admin/report-schedules/**`, migration 0172). A schedule keeps `dueAt`, the UTC
  day its next file is due (`nextDue`: a day, a week or a month on; the 31st → the month's last day).
  The daily step `report-exports` takes the 3 oldest due, runs at most 2 (CSV building is CPU work on
  Workers Free) and the 15-minute timer carries on. `runSchedule` moves the schedule on **before**
  making the file, so a run that dies half-way (query or CPU limit) can't repeat forever. Files go to
  My files → "Scheduled reports" through `saveToMyFiles` (src/server/space-files.ts, same limits as an
  upload), the newest 12 per schedule are kept. Without R2 a file must be under 1.9 MB (D1 row limit).
- **Exports in one query each** (`src/server/report-exports.ts`, shared by the download route
  `/api/premium/export`): raw SQL with joins. Don't go back to Prisma `select` with relations for
  big lists: Prisma loads each relation in extra queries of ~98 ids, which D1 counts.
- **Blog** (`src/server/blog.ts`, module `src/server/modules/blog.ts`: public `GET /api/core/blog`,
  `GET /api/core/blog/:slug`, owner `/api/core/owner/blog…`; console tab `console/blog.tsx`; pages
  `src/app/blog/**`, the post page built once as `/blog/open` like `/reports/[slug]`). Markdown is
  shown with `LegalMarkdown` (no HTML; links only http(s), mailto, / and #). Reading time is stored
  (`minutes`) so the list doesn't read the posts' text.
- **Browser check:** `node scripts/checks/q26-ui.mjs` with `pnpm local:serve --test-secret --owner-test`.
  **Not run yet** (merged at the owner's request first): run it before anything else and fix what it finds.

## S3 · Every page glides in: done (22 Oct 2026, owner request)

After S2 the owner still found page loads "not smooth like AgentGPT". AgentGPT's pages are
prefetched, so each tap shows the next page at once and its entrance always plays; UniVerse opened
pages without prefetching, so a first tap mostly showed a dimmed page, then grey boxes, and the
glide only at the end. Public pages and sign-in had no entrance at all. Rules:

- **The main tabs are prefetched** once per visit when the app is idle (`DashboardShell`,
  `router.prefetch` for `tabsForRole(role).items`; one request each, from the cache; skipped in
  low-data mode and with the browser's data saver). With `staleTimes` (5 min, `next.config.ts`) a
  tab opens at once and its entrance plays straight away.
- **Mouse press prefetches** the link's page a moment before the click (`NavProgress`). Not on
  touch: a finger also goes down to scroll, which would download pages nobody opens.
- **The loading skeleton glides in** (`PendingPage`: its blocks rise 18 px from half visible, 55 ms
  apart) and shows after 180 ms (was 260).
- **Stronger page entrances:** parts rise 32 px over 620 ms, 80 ms apart; the title settles down
  14 px; a part as tall as a third of the screen opens out from its top edge (`revealFrames`,
  `isTall` in `src/lib/page-transition.ts`).
- **Public pages and sign-in** glide in with CSS `.hero-in` (from the first paint, no JavaScript):
  the legal pages' shell (`LegalShell`: eyebrow, title, intro, content in turn), the sign-in form
  and its desktop copy (`(auth)/layout.tsx`).

## S2 · AgentGPT-style entrance: done (22 Oct 2026, owner request)

After S1 the owner still found loading "not smooth like" https://agentgpt.reworkd.ai. Its source
(github.com/reworkd/AgentGPT, the version the live site runs: `next/src/pages/index.tsx` before
"Redesign (#1327)") shows why: every part arrives with a big, slow, staged motion (framer-motion
springs of 0.5–1 s: the title unfolds, the main window opens out from `scaleY 0`, the example cards
drop 30 px in at 0.9 s, the inputs rise 30–50 px), over a background that never empties. UniVerse's
motions were 6–10 px over 0.26–0.34 s, and the start-up placeholder was swapped for the app in one
frame. Rules for code that builds on it:

- **App entrance** (`src/lib/app-entrance.ts`, played by `DashboardShell` once per page load): the
  page's blocks (`revealParts`) rise 36 px over 800 ms, 70 ms apart from 120 ms; a block taller than a
  third of the screen opens out from its top edge instead (`scale(0.96, 0.9)`); the phone tab bar
  rises 48 px; the desktop sidebar slides in 32 px from its edge (mirrored right to left). The phone
  top bar stays put (the placeholder showed the same brand in the same place).
- **The start-up placeholder dissolves behind the app** (`.boot-cover` in `DashboardShell`: the same
  `AppSkeleton`, `z-index: -1`, fading 500 ms after 100 ms; its bars are hidden so nothing shows
  twice). In front of the app it made the screen dip to empty for ~150 ms.
- **A page that replaces its loading skeleton** (`PendingPage`): a copy of the skeleton, taken when
  it appeared, fades out behind the arriving page (fixed, `z-index: -1`), for the same reason.
- **Longer, softer motions everywhere:** `EASE_GLIDE` / `--ease-glide` = `cubic-bezier(0.16, 1, 0.3,
  1)`; page parts 24 px over 560 ms, 70 ms apart (the title settles down 10 px from half visible);
  push/pop 56 px over 460 ms; late content 16 px over 480 ms; `.stagger` rows 22 px over 560 ms, 50 ms
  apart; `.fade-up` 14 px over 460 ms; the landing hero 28 px over 900 ms. Leaving stays quick
  (170 ms). Still transform and opacity only with `fill: backwards`, so they run on the GPU and
  leave nothing behind. "Reduce Motion": fades only.
- **How it was checked:** `node scripts/load-film.mjs http://localhost:8787 --out <dir>` films a
  reload and a tab tap on a phone at 4× slower CPU (Chrome screencast frames plus a contact sheet).
  The frames before the first change after a tap are Playwright getting ready to tap, not the app.

## S1 · Smooth loading everywhere: done (21 Oct 2026, owner request)

The owner sent a screen recording of AgentGPT reloading: the page dims, a placeholder in the page's
own shape appears, then the window and its parts come in one after another, with nothing jumping.
UniVerse had a blank frame on reload (the shell faded in from 0 after the start-up skeleton), one
generic grey layout for every page, and the whole new page fading in from nothing.

- **Placeholders shaped like the page:** `src/components/layout/PageSkeleton.tsx` has four variants
  (`dashboard`, `list`, `cards`, `detail`) and `skeletonFor(path)` picks one from the address. Used by
  `AppSkeleton` (start-up, now a client component reading the path), `(dashboard)/loading.tsx` and
  `PendingPage` (while a tapped page downloads, the pending path decides). A new kind of page: add
  its address to the right list in `skeletonFor`.
- **Part-by-part entrance:** `PendingPage`'s entrance animates `revealParts(page, motion)` (the
  page's top parts; a big wrapper is split into its children; `.stagger` lists are left to their own
  cascade; at most 10) with `revealFrames(i)`, 45 ms apart, `fill: 'backwards'`. Back/forward,
  shared-element moves and reduced motion keep the single whole-page animation.
- **Late content fades in:** a `MutationObserver` on the stage in `PendingPage` notices when a
  placeholder leaves (`.skeleton`, `aria-busy="true"`, `role="status"` + `aria-label="Loading"`, a
  box holding only a spinner) and fades in what replaced it (up to 12 nodes, 260 ms). So a component
  only needs a normal loading state; don't add your own entrance for "data arrived".
- `.shell-in` (the start-up fade) only plays in the installed app (`display-mode: standalone`),
  where the launch splash covers it.
- How it was checked: Chrome screencast frames (CDP `Page.startScreencast`) on a phone at 4× slower
  CPU, made into contact sheets; compare frame by frame for blank or jumping frames.

## Q25 · Phase E, fourth batch (10 items): done (21 Oct 2026; merged in PR #68, fixes after it on the same branch)

No migration (next: **0172**). Tested with `node scripts/checks/phase-e2-ui.mjs` (after the merge:
the fixes it and a code review found are in the Progress row). Rules for code that builds on it:

- **Press and hold:** `useLongPress(onLong)` (`src/lib/use-long-press.ts`) → spread `bind(item)` on the
  element and start its onClick with `if (press.wasLong()) return;`. A moving finger cancels it; only
  the finger that started it can end it (phones also send a "mouse left" as a touch starts); the
  click from lifting that finger is swallowed (it would land on what just opened). Don't make the
  same element `draggable` on touch screens: holding it starts the browser's own drag.
  Task cards use it (the card sheet's Move to is how cards change list on a phone).
- **Accent colour:** `ACCENTS` / `setAccent` in `src/lib/display-prefs.ts`, `data-accent` on `<html>`
  (set by `DISPLAY_PREFS_SCRIPT` before paint); the tokens per accent are in `globals.css`
  (`:root[data-accent=…]` and `:root.dark[data-accent=…]`, components layer). Use `bg-tint`,
  `text-tint-text`, `btn-*` for anything that should follow it; `indigo-*` classes don't.
- **Ringtone:** `RINGTONES`, `chosenRingtone`, `ringtone(waiting, which)` in `src/lib/call-sounds.ts`
  (`uv-ringtone`; Vibrate only plays nothing).
- **My course colours:** `useMyCourseColors()` / `setMyCourseColor(code, hex)`
  (`src/lib/my-course-colors.ts`), keyed by course code, this device only; pass `mine[code] ?? color`
  to `courseColor` / `courseShade`.
- **Several chat messages:** ChatWindow's `picked` set (max 50); while choosing, a tap on a message
  ticks it (`onClickCapture`), Escape stops. `ForwardDialog` takes `messages` (sent one by one, in
  order). Copy takes text messages only (not private ones).
- **Undo** now also on Files (files and folders), whiteboards and announcements (`removeWithUndo`).
- **Share picture:** `public/og.jpg` (1200 × 630) via `metadataBase` + `openGraph.images` in
  `src/app/layout.tsx` (`NEXT_PUBLIC_APP_URL`, else universeimpact.com).
- **Time zones:** `zoneLabel()` (`src/lib/zone-label.ts`, browser only) under class calls and in the
  schedule form. Timetable slots still have no zone (they're the school's own time).

## Q24 · Phase E, third batch (10 items): done (21 Oct 2026, branch `claude/funny-galileo-y4mz9r`)

No migration (next: **0172**). Rules for code that builds on it:

- **Undo after a delete:** `removeWithUndo(label, { hide, restore, commit })` (`src/lib/undo.ts`): off
  the screen at once, deleted when the message goes (5 s), Undo sends nothing. Used for task cards
  (no "are you sure?" any more) and notifications (Notifications page); the course board's
  `useRemove` is the same pattern. A deleted calendar event's Undo makes it again (a new event, same fields); archiving
  a chat has Undo (it's a toggle). Deletes with server-side clean-up (docs, boards, users, courses)
  still ask first: they'd need soft-delete columns for a real undo.
- **Files dropped or pasted:** wrap a file button in `<FileDrop onFiles accept multiple>`
  (`src/components/ui/FileDrop.tsx`, hook `useFileDrop` in `src/lib/use-file-drop.ts`); it keeps to
  the field's `accept` list. On: assignment hand-in, excuse documents, course materials (already
  there before: Files, chat, the editors, bulk import, Convert/Compress).
- **CSV downloads:** `downloadCsv(name, header, rows)` from `src/lib/csv-download.ts` (formulas
  neutralised, Excel-friendly). The fee screens re-export it; the owner console still has its own.
- **Saved filters:** `useSavedViews<T>(key)` (`src/lib/saved-views.ts`): up to 8 named views on this
  device. Admin → Users uses `uv-admin-users-views`.
- **Admin → Users:** tick rows (or all shown) → Deactivate / Reactivate (`POST /users/bulk/status`,
  200 at a time), Make students / Make teachers (`POST /users/bulk/role`, 20 at a time, **only people
  with no courses**: anyone teaching or enrolled, admins, guardians, yourself and the owner are
  skipped with the reason), Export (CSV). Column names stay on top (the table has its own scroll
  box). Audit entries `user.status_changed` / `user.role_changed`. The read-only demo admin is
  refused like every other write. Logic and tests: `src/server/user-bulk.ts`.
- **Invitations:** Renew = another 30 days (`POST /users/invitations/:id/renew`, `user.invitation_renewed`);
  no email is sent, so Copy link puts the sign-up address on the clipboard.
- **Language:** `LanguageMenu` (`src/components/layout/LanguageMenu.tsx`) in the desktop top bar and
  the phone's side menu (`row`); the button has no language-dependent text (server and browser
  drawings match).
- **Chat:** the jump button counts messages from others that arrived while reading further up
  ("2 new"), not older ones loaded at the top. Forward takes an optional comment, sent after the
  copy in each chat; private (end-to-end) chats aren't offered (they only take messages encrypted
  on the device).
- **Calls:** Speaker in the call's settings where the browser can (`setSinkId`: Chrome, Edge,
  Firefox; not Safari on iPhone), kept in `uv-call-speaker` and applied to every remote tile
  (`playOnSpeaker`); the device lists follow a headset plugged in or out while settings are open.
- **What's left of Phase E:** selecting several messages, long-press menus beyond chats, colour per
  course (a student's own), ringtone choice, time zone on online classes, accent colours, app icon
  choice, scheduled report exports, bulk actions / CSV / sticky headers / saved views on the other
  admin tables, Undo on the remaining deletes, drop and paste on the remaining file fields, and the
  public-site list (pricing toggle, FAQ, status page link, blog, OpenGraph images).

## Accessibility sweep, all four ways: done (21 Oct 2026, same branch)

`node scripts/crawl.mjs --axe` with and without `--phone` and `--dark` (183 pages, every role; the
two never run before were phone light and desktop dark). Each run: 178–179 pages clean before the
fixes. Fixed: the Terms and Privacy pages' "policies" link (colour only, now underlined), the
study rooms search card's labels (the card is dark in both modes, but light mode's darker greys
applied: it's now `.on-dark`, and `.on-dark` areas get dark mode's lighter greys, like `.dark`; mark
any new always-dark card the same way), the teacher analytics trend's first and last week buttons
(cut to 12 px on phones: now equal slices of at least 24 px), the ⌘K hint in the top bar search
(too dark in dark mode). The parent pages were never crawled: there was no local parent account;
`scripts/local/test-accounts.mjs` now makes `test-parent@local.test` (Alice's parent), and they're
clean. The only thing left in every run is `/js/api.js` failing to load (an outside script this
machine can't reach; not a page problem).

## Phone smoothness, second pass: done (21 Oct 2026, branch `claude/funny-galileo-y4mz9r`)

No migration (next: **0172**). Measured with `node scripts/smoothness.mjs` (two runs) and the new
`node scripts/checks/phone-panels.mjs` on the built Worker, 4× slower CPU, long tasks:
Notifications open 920 → ~260 ms (worst frame 450 → ~185), side menu open ~300 → ~70 ms (it restyled
1,059 elements, now 28), tab switches: Impact 570–770 → ~530, Courses ~400 → ~315, Messages
510–680 → ~450, Home 750–790 → ~460 (one run 1,130: the lower cards draw inside the measured 1.5 s).
Scrolling stays smooth. Rules for code that builds on it:

- **`::selection` is under `body` (`:where(body) ::selection`), never bare.** A bare `::selection`
  (it matches `<html>` too) made Chrome work out a selection style for every element on every
  restyle: a full restyle of Home took 25 ms instead of 0.4 ms (×4 on a slow phone). The same goes
  for any new page-wide pseudo-element rule: measure it (`getComputedStyle` timing after changing a
  style on `<html>`).
- **Never change `<body>`'s `touch-action`** (or add a class that does): it restyles every element.
  The side menu now blocks finger scrolling on its backdrop and fixed parts (`touch-none`) and its
  list doesn't pass scrolling on (`overscroll-contain`); `body.scroll-locked` is gone.
- **`* { touch-action: manipulation }` is in `@layer base`.** Outside a layer it beat every
  Tailwind `touch-none` in the app (drawing areas, drag handles, sliders), so those scrolled the page.
  Unlayered rules in `globals.css` always beat utilities: put new element-wide rules in a layer.
- **The phone tab bar's capsule is one CSS-positioned element** (`.tabbar-pill`, moved by `--col`,
  mirrored right to left), not a framer-motion `layoutId`. Shared-layout animations make framer-motion
  measure the page and every animated element on each frame; avoid `layoutId` / `layout` on things
  that change on every navigation. The side menu's highlight only glides when the menu is on screen.
- **Entrances in CSS:** lists and grids use `.stagger` on the parent; a single card uses `.rise-in`
  with an inline `animationDelay`; progress bars use `.bar-grow` (scaleX, from the start side). Not
  framer-motion `initial`/`animate` per row inside `.map()` (Home, Courses, Impact projects and the
  chat list were changed).
- **Home draws its first cards first** (`HomeBoard`: the top cards and the first two of the main
  column, the rest 250 ms later; all at once while editing). The Notifications panel draws 12 rows,
  the rest 450 ms after it opens. Escape closes it.
- What's left: most of a tab switch is now the browser laying out the new page for the first time
  (Next.js forces it while deciding whether to scroll); fewer elements on first render is the way
  down. The course tile → course page step is ~400–500 ms.

## Review · Full bug and error review: done, first pass (21 Oct 2026, merged into main in PR #67)

Migration `0171_job_runs` (next: **0172**). Rules for code that builds on it:

- **Long `in` lists are split for you.** `src/lib/d1-split.ts` (wired in `src/lib/db.ts` as a Prisma
  query extension) runs a query whose `in` lists pass 95 values in parts and merges them: counts and
  updateMany/deleteMany counts add up, groupBy rows are joined, findMany/findFirst are re-sorted
  (SQLite order, nulls first when ascending) and `take` applied after. Parts run **one after
  another**: run together inside one extension call they all came back empty on D1. It does **not**
  split an `in` inside `OR`, inside a relation filter (`some: { id: { in } }`) or `notIn`: write
  those as separate lookups and merge (as `src/server/tasks.ts` overview, `docs.ts` listDocs and
  `semester.ts` do). Only Prisma's own auto-split (findMany whose whole `where` is one list) and
  `createMany` were safe before this.
- **Queries are counted per request** (`queriesUsed()` in `src/lib/db.ts`, keyed by the Worker
  request's context; 0 under `next dev`). A warning with a short stack is logged at 40 and 50. A
  cron run is one request: every `runJob` in one scheduled invocation shares the 50.
- **Daily jobs run in steps** (`src/server/daily-jobs.ts`, table `job_runs`: one row per job per
  day, a cursor, `done`). The daily cron starts the day's rows and runs what fits in 42 queries;
  each 15-minute tick continues while a row isn't done (`cloudflare/due-check.ts` `dailyPending`,
  then `/api/cron/daily-more`). A step that throws is logged and marked done, so one bad step never
  blocks the rest. A new daily job: add a step with its own budget check (`left()`), never a loop
  that can pass 50.
- **Reminders** (`/api/cron/reminders`) run jobs in priority order and skip the rest once 38 queries
  are used (`waiting` in its reply).
- **Light mode:** slate and gray 400–600 and emerald 600/700 are remapped in `globals.css` so text
  reads at 4.5:1; dark mode has its own lifts. Dark-first pages need `text-zinc-900 dark:text-white`
  style pairs; a coloured shade with a `dark:text-` of its own isn't lifted.
- **Touch screens:** Tailwind 4's `hover:` only applies with a mouse, so `opacity-0
  group-hover:opacity-100` hides buttons on phones for good. Use `pointer-fine:opacity-0
  pointer-fine:group-hover:opacity-100 focus-within:opacity-100`.
- **Closing motion:** `Sheet` slides down (phone) or fades (desktop) before it unmounts; `Dialogs`
  fade out. Both are instant with reduced motion.
- **Local test accounts:** `scripts/local/test-accounts.mjs` (run by `setup.mjs`) adds Tara
  (co-teacher) and Tom (TA on CS101), local only. `scripts/crawl.mjs --dark --axe`,
  `scripts/smoothness.mjs` (phone, CPU 4× slower: frames over 34 ms and long tasks per action).

## Q23 · Small items (Phase E), two batches: done (20 Oct 2026, merged into main 21 Oct in PR #67)

Twelve items, no migration. Rules for code that builds on it:

- **Ending a call for everyone** is the host's `control` action `end-all` in the call room
  (`cloudflare/worker.ts`): everyone else (and the waiting room) gets `{ type: 'ended', by }` and is
  closed with code 4002. Dialogs inside a call must be drawn inside `CallView` (the call sits at
  z-[300], `confirmDialog` at z-[120] would be hidden under it).
- **Device-only preferences** live in `src/lib/display-prefs.ts` (`uv-cam-off`, `uv-mirror`,
  `uv-week-start`). Anything that draws differently from one (calendars) reads it with
  `useSyncExternalStore` and the server default (`src/lib/use-week-start.ts`), never in `useState`,
  or the server and browser draw different things. A new setting needs a `settings-index.ts` entry
  and a `data-setting`.
- **Week start:** `monthGrid` / `weekStart` (`src/lib/task-calendar.ts`) and the calendar's
  `TimeGrid` take the first day (1 Monday, 0 Sunday). Weekly timetable rows (`weekday` 0 = Monday)
  are unchanged: only what's drawn moves.
- **Reminders to hand in** (`remindMissing`, `src/server/assignments.ts`) are notifications of type
  `reminder` linked to `/student/assignments/<id>`; the 12-hour limit looks for exactly that, so
  don't reuse that type and link for other notices.
- **Duplicate assignment** copies the rubric's concept tags (`ConceptTag` kind `CRITERION`, refId
  `<assignmentId>:<criterionId>`). A new assignment field must be added to `duplicateAssignment`.
- **Keyboard shortcuts** (`src/components/layout/KeyboardHelp.tsx`): `?` and `/` are ignored while
  typing or inside a dialog. Add new app-wide shortcuts to its list.

## Q22b · The Q22 leftovers the owner asked for: done (20 Oct 2026, merged into main 21 Oct in PR #67)

Mastery signals from flashcards and tutor questions (D1), a hybrid class (D7), the converter extras
(B9) and the school-admin extras (B15). Migrations **0167** (`concept_signals`, `study_cards.conceptId`),
**0168** (`classroom_sessions.linkedCall`), **0169** (late fees), **0170** (half days, `staff_settings`).
**Next migration: `0171`.** Rules:

- **Mastery signals** go through `recordSignal` (`src/server/learning-dna.ts`; it never throws).
  Text is matched to a concept by `matchConcept` (`src/lib/concept-match.ts`: more than half of the
  name's words must appear). A card review is an observation at weight `CARD_WEIGHT` 0.3 (a quiz
  answer is 1), one per card per day; a tutor question is only counted ("asked"), never right or
  wrong. Students see their own count; teachers see class totals, never who asked.
- **Hybrid class:** `markOnline(courseId, userIds)` (`src/server/classroom.ts`) marks students
  present or late with the note `Online (class call)`, only while the course's in-person class is
  linked; a mark the teacher made stays. It runs when a student gets a class-call ticket
  (`callTicket`), when the link is switched on and when the class ends. The call room's `/pulse`
  gives the live meter counts (app-only, like `/people`).
- **Late fees are inside `amount`** (`fee_invoices.lateFee` says how much of it), so payments,
  receipts and "paid in full" keep working. `applyLateFees` adds a plan's fee once to bills past
  the due date plus the grace days (one UPDATE, safe to run again; the daily job runs it). Taking
  it off refuses when more has been paid than the bill would be without it.
- **Leave balances** (`src/lib/leave-balance.ts`): the leave year starts in the chosen month; only
  Monday–Friday count; a half day (`AM`/`PM`, one day only) counts 0.5 and misses only that half's
  classes for cover. Allowances are in `staff_settings` (one row, id `main`).
- **PDF forms** are filled and flattened (`src/lib/pdf-form.ts fillForm`) before the editor copies
  pages, because copying pages loses the form.
- **Word files** from HTML go through `htmlToDoc` → the editor's own `.docx` writer
  (`src/lib/html-to-doc.ts`, `docxBlob`); PDF → Word through `pdfToDoc` (text only: a scanned PDF
  has none). **MP3** uses `@mediabunny/mp3-encoder` (MPL-2.0, pinned to mediabunny's version) only
  when the browser can't encode MP3 itself.
- **Barcodes** are Code 128 set B (`src/lib/code128.ts`); a library card is `L:<userId>`, which
  the desk's borrower search understands.

## Q22 · Leftovers inside finished items: done (20 Oct 2026, merged into main 21 Oct in PR #67)

Nine leftovers; the rest stay listed in the Progress row "Q22" with why. Migrations **0165**
(AI rule and receipts on quizzes and oral checks) and **0166** (the class TA's answers on in-person
questions). Rules for code that builds on it:

- **AI receipts are made in one place:** `makeReceipt` in `src/server/ai-receipts.ts` (assignments
  call it through `receiptForSubmission`). `how`: `'given'` throws when the choice doesn't fit the
  rule; `'offline'` keeps a hand-in with no choice; `'auto'` (a quiz handed in by itself at zero)
  never throws, so answers are never lost, and the teacher sees it marked. `during: true` means the
  record covers the attempt (quiz: from `quiz_attempts.startedAt`, kept for any quiz whose rule
  isn't FREE; oral check: from the session's start to its length + 2 minutes), not "since it was set".
- **Oral checks end by themselves**, so their receipt is attached afterwards (`POST /api/orals/:id/ai-receipt`)
  until the teacher marks it (then 409). Don't move it into `finishOral`.
- **Any new AI help must call `logAiUse`** (kinds in `src/lib/ai-receipt.ts AI_USE_KINDS`); the class
  TA now does (`ta`), Whisper TA didn't before.
- **The class TA** (Whisper TA in calls, and in-person questions) answers through one function,
  `taAnswer` in `src/server/whisper.ts`. The teacher's switch is `tutorRule.whisperOff` and covers
  both. In-person: `askTa` in `src/server/classroom.ts`, notes from the teacher's laptop (last ten
  minutes) as what was said; only the asking student sees the answer.
- **Question-bank tags** (`ConceptTag` kind `BANK`) are copied to the new quiz questions by order
  when added to a quiz (question-bank route, `add-to-quiz`).
- **Oral checks into the gradebook:** one `Grade` per student and check, named `Oral: <title>`,
  updated when re-marked (with grade history).
- **Parents' files in parent–teacher chats** go through `saveFile` (4 MB, pictures and PDF), with
  the costly-request limit in `cloudflare/worker.ts`.
- **Class content translation** tries the browser's own Translator first (`src/lib/device-translate.ts`,
  Chrome; skipped on data saver), then the AI.

## Q21 · Languages and right to left: done (20 Oct 2026, merged into main 21 Oct in PR #67)

13 languages; Arabic and Urdu right to left. Details in the Progress row "Q21". Rules:

- **Screens are translated in the browser, not in the code.** Don't wrap new text in `t()`: write
  English as usual, then run `node scripts/gen-ui-strings.mjs` so the catalog has it, and the owner
  runs Languages → Translate (only new texts go to the AI). Text built from pieces ("quiz" + "zes")
  can't be matched: write whole phrases (`${n} quizzes` becomes the pattern "{0} quizzes").
  A pattern needs 5+ letters of its own (two words if it starts and ends with a value):
  "{0} to {1}" would match anyone's sentence, so it is dropped (`strongPattern`).
- **People's content stays as written:** put `translate="no"` on anything people wrote (chat
  messages already have it, with `dir="auto"`). Editable areas and form values are skipped by itself.
- **Layout classes:** start/end only (`ms-`, `pe-`, `start-0`, `text-start`, `rounded-s`,
  `border-e`); `node scripts/rtl-logical-classes.mjs` converts a file. Things that move sideways
  (`translate-x-*`) need an `rtl:` mirror; centring with `left-1/2 -translate-x-1/2` stays physical.
- **The translator never changes structure** (only `nodeValue` and four attributes), so React is
  safe; it reloads the page when the language changes after something was translated.
- **Never change text React hasn't drawn yet:** the translator starts after the page's load event
  (idle), otherwise React sees different text than the server sent (error #418) and redraws the
  whole page. That is also why the default number/date format is not patched globally: give a screen
  its own `Intl` formatting with `languageInfo(lang).locale` instead.
- **Dictionary storage:** `ui_translations` (0164), 32 parts per language by FNV hash of the English
  text (`chunkOf`); `GET /api/i18n/:lang` joins the parts' JSON as text (no parse: CPU) with an ETag.

## Q20 · Chat apps: done (20 Oct 2026, merged into main 21 Oct in PR #67)

A school's own slash commands, answered by its own server. Details in the Progress row "Q20".

- **One place decides everything:** `src/server/chat-apps.ts`. `runCommand` repeats the message
  route's posting rules (chat switched off, muted, announcement channel, community channel rules);
  if the message route gains a rule, add it there too. Apps never run in private (E2E) chats.
- **What leaves UniVerse** is only what the payload in `runCommand` builds: no email addresses;
  recent messages only with `read_recent`. Keep it that way: a school's app is a third party.
- **Signing** reuses `computeWebhookSignature` (webhooks); apps verify like
  `scripts/checks/chat-apps-verify.mjs`. Redirects are not followed; 5-second timeout; the call
  is under the costly rate limit in `cloudflare/worker.ts` (keep the path in `COSTLY`).
- **Which school:** a person's `organizationId`, plus the school they own (admins). The admin pages
  use `requireAdmin` → the admin's own school (`getOrCreateOrganization`).
- **Answers** are posted by the system account with `metadata.app` (MessageBubble shows the app's
  name); answers for one person are not saved anywhere.
- **Browser check:** `pnpm local:serve --test-secret --owner-test`, then
  `node scripts/checks/chat-apps-ui.mjs` (stand-in app on port 8791, sign-in keys on 8790).
- **Older browser checks that now need care** (seen on 20 Oct, not app bugs): `life-ui` and
  `impact-ui` insert a school for demo@admin.com, which fails once the demo admin already owns one
  (opening Billing makes it); `cal-ui` clicks "Next", which now also matches the guided tour's button
  (mark the tour seen with `universe-tour-done:<id>`).
- **For the full bug review (found 20 Oct, not fixed yet):** the local server log showed a
  background task failing with `prisma.notification.findMany()` → P2029 "query parameter limit
  exceeded" (more than D1's 100 values in one query) while chats were used; find which background job
  builds that query (likely notifying a big group) and split it.
- **Also for the review:** in dark mode, white text on the accent colour (`--tint: #6366f1`,
  `src/app/globals.css`, e.g. your own chat bubbles) is 4.47:1, just under 4.5:1; something like
  `#5f63f0` passes, but it changes every screen, so check them all (text that uses the tint too).
- **Also for the review:** the course tiles on Student → Courses put white letters on the course
  colour (#3b82f6 is 3.67:1); seen in English too (20 Oct).

## Q19 · Owner console: done (20 Oct 2026, merged into main 21 Oct in PR #67)

Schools, Moderation and View as in the owner console, a rollout card on the Server tab, growth
charts. Details in the Progress row "Q19". Rules for code that builds on it:

- **View as is read-only by construction, at the server.** Its token is an ordinary `ut1.` session
  token with `src: 'view'` (30 minutes). `viewAsRefused(method, path)` in `src/server/session-token.ts`
  is the one list: every non-GET except `POST /api/bootstrap`, plus chat, calls, realtime, recordings
  and `/api/files/link` even for GET. It is checked in `router.handle`, `getSessionUser`,
  `getUserFromToken` (server actions) and the Worker's `callerOf` (which then hands the request to
  the Next.js route, which refuses it). **A new way in that resolves a token itself must call
  `viewAsBlocked(req, token)`.** A new GET that changes something (marks read, counts a view) must
  either be a POST or be added to that list. Reading `src` without verifying only ever refuses more.
- **The view-as tab must never touch the owner's sign-in.** Everything for it lives in that tab's
  sessionStorage (`uv-view-as`, `uv-view-as-name`, `universe-auth`). `getAuthToken`, `twoStepPass`,
  the account store's storage, `auth.signOut`, `logout`, the 401 handler, the early start-up script
  (`bootstrapPrefetchScript`) and `reportSession` all check `viewAsToken()` first. New code that reads
  or clears `localStorage` sign-in keys (`accessToken`, `universe-auth`, `uv-pass`) must do the same.
- **Blocked parts answer 401 from Next.js routes** (getSessionUser returns null): in a view-as tab
  the API client turns that into "read-only" unless the token has run out (then `/view-as?expired=1`).
- **Rollout** entries `rollout:<id>=<pct>` sit next to `org:` entries; always write switches with the
  4-argument `composeSwitches(off, emails, orgs, rollouts)` so neither is dropped.
- **Churn** comes from `subscription_events` (0162), written only by `syncSubscription` when the
  status or plan changes; there is no history from before this release.
- **Browser check:** `pnpm local:serve --test-secret --owner-test`, then
  `node scripts/checks/console-ui.mjs`. It runs a stand-in for Google's sign-in keys on port 8790
  (local only; `FIREBASE_TEST_JWKS_URL` is ignored unless it points at localhost) for the made-up
  owner `owner@check.test`, and removes that account, its log rows and the test flag at the end.

## Handover to the cloud agent (20 Oct 2026): read this first

The owner is handing the project back to a cloud session. Where things stand:

- **`main` has everything through Q18**: PR #66 (Q14 skills passport, Q15 careers, Q16 global impact,
  Q17 student life, Q18 profile / settings search / guided tour) was merged on 20 Oct at the owner's
  "merge". Work on branch **`claude/funny-galileo-y4mz9r`** (it matches `main` apart from this note).
- **Next: Q19 Owner console**, then Q20–Q23 (plan section 4). **Next migration: `0162`.**
- **Read, in order:** `START-HERE.md`, `.cursor/rules/universe.mdc`, the Progress rows Q14–Q18 in
  `STAGE-5-PLAN.md`, and the Q14–Q18 notes below (traps and rules for code that builds on them).
- **How each item was done** (keep doing it): one commit per item; a browser check in
  `scripts/checks/<name>-ui.mjs` on the built Worker (`pnpm local:build`, then `pnpm local:serve`
  with `--payments-test`, `--test-secret` or `--ai-placeholder` as the item needs) with axe at
  390 / 1280 px in light and dark and no sideways scrolling; the test cleans up after itself;
  sample-mode stubs for new GET routes; help answers with tests; then the Progress row, a note here,
  START-HERE and the rules' "next". Merge only when the owner says "merge" (a pull request from this
  branch, merged; Cloudflare then builds and deploys in about 15 minutes).
- **Traps learned in Q14–Q18** (details in each note): payments count only through
  `completeOrder` after the gateway confirms; never add fallback keys or a "mark as paid" button.
  New account fields must also go into `cloudflare/fast-api.ts usersMe`. The demo admin can't write
  (every write gets 401 "Please sign in."), so unit-test admin-only writes. Hand-written test rows
  must give JSON columns '[]' (some tables default to ''). Settings draws each section twice (use
  `useId` for ids). Browser checks mark the tour seen with `universe-tour-done:<user id>`.
- **Waiting on the owner:** Stripe webhook events `checkout.session.completed` and
  `checkout.session.async_payment_succeeded` (donations and tickets); `SESSION_SECRET` of at least
  32 characters on the Worker (tickets, check-in codes); switching NGOs on for donations; Razorpay
  (UPI) and live bus GPS are **[owner]**.
- **The owner:** not a developer; free tiers only; never delete the seeded sample data; end each
  item with a plain-words summary (what changed, what they can do, what they need to do); no AI
  model names in commits.

## Earlier (17 Oct 2026)

- **`main` has everything through Q13** (PR #64). The work moves to **Cursor** on the owner's
  computer: start with **`START-HERE.md`** at the top of the project (setup, `pnpm local:*`
  commands, publishing) and the rules in **`.cursor/rules/universe.mdc`**. The browser and API
  checks used for every item are now in **`apps/web/scripts/checks/`** (index in its README), run
  against `pnpm local:serve`. **Next: Q14. Next migration: `0157`.**

- **Q14 skills passport, 18–19 Oct (Progress row Q14): done and browser-tested** on branch `claude/funny-galileo-y4mz9r`, **not merged** (waiting for the owner's "merge"); **migration 0157**; **next migration: 0158**; **next item: Q15 Careers**. Re-run the test with `node scripts/checks/passport-ui.mjs` (it adds a passed quiz and one test credential for Alice and removes them; it marks the welcome tour as seen with the per-user key `universe-tour-done:<user id>`, as any new browser check must). Portfolio addresses: `cleanPassportHandle` (`src/lib/passport-theme.ts`) is the only rule (3–24 characters); the CV's accent is also its heading colour, so any new accent needs 4.5:1 on white. `/api/p/<handle>` is cached for 30 s, so a passport made private can still show for up to 30 s. Wallet credentials: always `signCredential` / `verifyCredential` (`src/server/vc-data-integrity.ts`): never hand-make a `proof`, never name a cryptosuite you didn't follow, and keep internal ids out of credentials.

- **Q15 careers, 19 Oct (Progress row Q15): done and browser-tested** on the same branch, **not merged**; **migration 0158**; **next migration: 0159**; **next item: Q16 Global impact**. Re-run the test with `node scripts/checks/careers-ui.mjs` (it gives Alice one piece of skill evidence, makes the demo teacher a mentor and posts one test opening, and removes everything at the end; it stops without changing anything if a test account already has a mentor profile it didn't make). Rules for code that builds on it: everything is in `src/server/careers.ts` (logic shared with pages and tests in `src/lib/careers.ts`). **Tracker:** UniVerse applications are copied into `job_applications` lazily when the student opens the tab (`listApplications`), and their stage always follows the company's decision (`stageOfApplication`); the student may only mark Interview. Next-step reminders run in the 15-minute cron (`remindApplications`), so **any new kind of timed reminder also needs a line in `cloudflare/due-check.ts`** (and the count in `src/server/due-check.test.ts`), or the cron never starts the app for it. **Mentor bookings:** a time is claimed with `updateMany … where bookingId: null` before anything else is made (D1 has no transactions); keep that order, and undo the hold if a later step fails. A booking is a `ScheduledCall` in the pair's one-to-one chat (template `office`), so Calls and its reminders come free; calendar entries share the batch `mentor:<booking id>` (delete by batch). Only students and teachers can be mentors in the app (`canMentor`); `INDUSTRY_MENTOR` accounts have no page yet. Never send mentors' emails to the browser (the old `/mentorship/mentors` did). **Job alerts:** `alertNewOpening` runs after the reply from the internship service's create and update, at most once per opening (`internships.alertedAt` claimed first); it reads up to 6,000 skill evidence rows, fine for one campus, but a big multi-campus site would need it batched. Openings' skills come from `skillsOf` in `internships.service.ts` (a list or "a, b, c", up to 6). **Interview AI:** use kind `interview`; questions cached 30 days per role; the AI is told the answer may come from speech recognition and must not invent facts.

- **Q16 global impact, 19 Oct (Progress row Q16): done and browser-tested** on the same branch, **not merged**; **migration 0159**; **next migration: 0160**; **next item: Q17 Student life**. Re-run the test with `pnpm local:serve --payments-test` then `node scripts/checks/impact-ui.mjs` (it makes a test school, NGO, project, shift with 11 verified hours for Alice and a club, and removes them; it stops if Alice already has verified hours). **Payments, the rules now:** a payment counts only when the gateway says so: `confirmUnifiedPayment` asks Stripe for the Checkout session (paid, same amount and currency) or checks Razorpay's signature over the **order's own** `orderRef`; webhooks go through `confirmFromGateway` (amount checked); both end in `completeOrder`, which flips PENDING→COMPLETED with one conditional update, so anything that follows a payment (fee receipt, `donationPaid`) runs once. Never add a fallback key or secret in code, and never a "mark as paid" button: test payments exist only with `PAYMENTS_TEST_MODE=1` (local). A new thing to pay for: a new `purpose`, a `returnPath`, `origin` from the request, and a line in `completeOrder` (and in the refund). Don't import `payments/provider` from `donations.ts` (provider imports it); `donate.ts` starts donations. **Donations** go to the school's Stripe account (no Connect); the receipt says it's collected on the NGO's behalf; 80G only for INR with the NGO's number and PAN (`offers80G`). JSON columns in hand-written test rows: `ngos.sdgNumbers`, `ngo_projects.skillsRequired` default to '' in the table, which Prisma can't read: always write '[]'. **Milestones**: `ImpactService.issueMilestones` (unique on userId + milestoneHours); called from `award()` in `volunteering.ts` and on My credentials. **Carbon factors** live only in `src/lib/carbon.ts` (rounded, with sources on the page); change them there. The clubs page's cards are dark in both themes: light text only.

- **Q17 student life, 19 Oct (Progress row Q17): done and browser-tested** on the same branch, **not merged**; **migration 0160**; **next migration: 0161**; **next item: Q18 Onboarding, profile and settings**. Re-run with `pnpm local:serve --payments-test --test-secret` then `node scripts/checks/life-ui.mjs` (it makes a test school, two events, a club and a menu and removes them, plus any chat it opened). **Tickets:** a seat is `event_rsvps` with status GOING | WAITLIST | HELD; seats taken = GOING + HELD (`seatsTaken`), and expired holds are dropped (`dropExpiredHolds`) wherever seats are counted; keep that pairing in anything new that counts seats. Tickets are `ticketCode(rsvp id)` (HMAC, no expiry): the door marks `checkedInAt` with one conditional update, so it works once. Paid tickets come back through `completeOrder` → `ticketPaid` (purpose `EVENT`); `buy-ticket.ts` imports the payment provider, `event-tickets.ts` must not (the provider imports it). **SESSION_SECRET** must be at least 32 characters on the live site for tickets and check-in codes. **Elections:** never add a timestamp, a rowid table or a user column to `club_ballots`, and never write voter and ballot in one row or log line: the anonymity rests on that. Results only after `closesAt`. **Board:** students only (`studentOnly`); the hide threshold is `HIDE_AFTER_REPORTS`; `cleanListing` (src/lib/student-life.ts) is the one place for each kind's rules. **Pre-orders:** menus are `campus_items` kind MENU stored at noon of their day; `pickupOk` keeps pickups on that day. **Demo admin:** every write is refused with "Please sign in." (401), so admin-only writes can't be browser-tested with it: unit-test them.

- **Q18 onboarding, profile and settings, 20 Oct (Progress row Q18): done and browser-tested**; **migration 0161**; **next migration: 0162**; **next item: Q19 Owner console**. Q14–Q18 were merged into `main` together at the owner's "merge" (20 Oct). Re-run with `pnpm local:serve --test-secret` then `node scripts/checks/profile-ui.mjs` (it puts Alice's and the teacher's profile and tour state back). **New account fields must also go into `cloudflare/fast-api.ts usersMe`** (the account usually comes from that fast path, not the Next.js route): the tour couldn't resume until `tourStep` was added there. **Tour:** stops point at buttons by attribute: `data-tour-href` (menu links and phone tabs: the link's address without its query), `data-tour-hrefs` (a menu group: its links' addresses), `data-tour="search|notifications|more"`. A new menu entry gets these from Sidebar.tsx by itself; a stop for something else needs its own `data-tour`. Browser checks still mark the tour seen with the `universe-tour-done:<user id>` key. **Settings:** a new setting gets an entry in `src/lib/settings-index.ts` and a matching `data-setting` (Row's `setting` prop or the `Setting` wrapper) in SettingsApp.tsx; the section is drawn twice (phone and desktop copies), so ids inside must come from `useId`. **Profiles:** `/people/<id>` is the profile page for everyone; `/api/profile/[id]` never returns email or phone; old `/student/profile/<name>` links resolve an exact, unique name.

## Earlier (14 Oct 2026)

- **`main` has everything up to PR #58** (Meet "Error 1101" fix, D17 moving QR codes, D18 skills match,
  page-error fixes). **Branch `claude/great-hamilton-8g8xdm` adds (not merged; merge only when the
  owner says "merge"):** live updates for groups of any size on Workers Free (FREE.1), the daily
  free-plan warning (FREE.2, migration **0129**), **Q1** (pages with an id never start Next.js) and
  **Q2** (security: passkeys, devices, sign-in rate limit, CSP reports, private file links; migration
  **0130**) and **Q3** (health numbers, error screens, per-school switches; migration **0131**; built
  and unit-tested, its browser test is the first thing to do: see the "Q3" Progress row). Progress
  rows at the end of the plan. **Next migration: `0132`.**
- **15 Oct 2026:** PR #60 is merged into `main`. Q3's test on the built Worker is done (Progress row
  "Q3"); work continues on branch `claude/funny-galileo-y4mz9r` from **Q4**.
- **Q4 done (15 Oct):** photos upload in three sizes and phones load the small ones (Progress row
  "Q4"; no migration). **Security fix, live until this deploys:** `GET /api/oneroster/v1p2/*` answered
  anyone, so anybody could page through every account's name, email and role. They now need a
  school API key (Admin → Integrations → Developer) with `courses.read` or `students.read`, and give
  only that key's school. If a school's SIS was reading them, it needs a key. Also: peer tutoring's
  "verified by Learning DNA" was given to every class without checking; it now uses real mastery.
  A new API route that serves people's data must check who is asking: the whole API was swept signed
  out (every route without an id, and every route with one), and only the public ones answer.
- **Q5 (courses), 15 Oct:** done on the branch: copy to a new term (Q5.1), discussion board (Q5.3,
  migration **0132**), scheduled / pinned / "seen by" announcements (Q5.4, **0133**), co-teachers and
  teaching assistants (Q5.6, **0134**), course calendar (Q5.5), AI syllabus draft (Q5.7), class-size
  limit, waitlist and sections (rest of Q5.6, **0135**), rich lesson pages (Q5.2), Common Cartridge import and export (Q5.8). Each has a
  Progress row. **Q5 is done**, apart from Google Classroom import (needs a sample export or the
  Classroom API: owner).
- **Q6 (assignments and grading), 15 Oct:** Q6.1 rules (late penalty, hand-in limit, extensions, extra
  time; migration **0136**). A student's due date is always `dueFor(...)` and a submission's late %
  is set when handed in (`src/lib/assignment-policy.ts`); graded answers can be REOPENED, so check
  "graded" as RETURNED or REOPENED. Q6.2a: files and links as hand-ins (**0137**); Q6.2b: group assignments (**0138**: a group's hand-in is
  one row with `groupId`; each member's grade is in `memberGrades`). **Next migration: `0150`.**
  - **16 Oct:** Q6.2c peer review (**0139**), Q6.3 notes on hand-ins (**0140**); Q6.2a/b screens tried in
    a browser; Q6.4a post grades and grade history (**0141**: a grade reaches the gradebook only through
    `publishGrades` in `src/server/assignments.ts`, which sets `postedAt`; students see a grade only when
    `postedAt` is set); Q6.4b school letter scales (**0142**: always `letter(p, scale)` with the school's
    scale, `useGradeScale()` in pages); Q6.5 the student's side (**0143**: signed hand-in receipts need
    `SESSION_SECRET`; regrade requests; the rubric in plain words, one AI request per rubric); Q6.6
    writing replay (**0144**: kept with the draft on the device, sent with a typed hand-in, read only by
    the teaching team; the teacher's assignment omits it). Still open in Q6: code assignments with
    tests and grade passback to an LMS (LTI AGS, needs a real LMS). Q6.3b rubric level keys done.
- **Q7 (quizzes), 16 Oct:** Q7.1a question types (**0145**). **Mark answers only through
  `src/lib/question-types.ts`** (`markAnswer` / `isRight`; never `answer === correctAnswer`), show
  questions to students only through `forStudent` (it drops the key and `meta`), and check the
  teacher's input with `cleanQuestionInput`. `correctAnswer` is the answer in words for the newer
  types. Q7.1b: maths expressions (`src/lib/math-expr.ts`, equal at sample points), tap on a picture,
  and the teacher's short-answer check (accepting an answer changes the key and re-marks every hand-in:
  `src/server/quiz-marking.ts`). Q7.2 pools and changing numbers (**0146**): pass the student to
  `markAnswer(q, given, studentId)` (changing numbers can't be marked without it) and count only the
  questions in `drawn` (`drawnOf`). Q7.3 one-way exams and the hard stop (**0147**: answers saved
  one by one in `quiz_attempts.answers`). Q7.4 adaptive practice (**0148**: practice sets and
  `practice_answers`, which count in the Learning DNA at half weight). Q7.5 live quiz game (**0149**,
  `src/server/live-game.ts`). Q7.6 question files into the bank (CSV, GIFT, Moodle XML, QTI 1.2 / 2.1,
  QTI zip: `src/lib/question-import.ts`); send the reader's questions, never the checked ones (their
  answers are in `meta`, which `cleanQuestion` doesn't read).
  - **Build memory and time (16 Oct):** Cloudflare's build machine has 8 GB, 2 CPUs and 20 minutes. The
    deploy build after PR #61 failed after 29 minutes. Now: webpack in its own process with memory
    optimisations, no type check in the build (run `pnpm typecheck` before every commit, always), 6 GB
    heap. 5 min 40 s on 2 CPUs locally, peak about 6.9 GB. Owner: turn on Settings → Build → Build
    cache. Don't run vitest or tsc during a build. Always link with `@/components/ui/Link`: a
    prefetching `next/link` looped on the teacher's Live class page.
  - **Stopped here (owner asked to merge, 15 Oct):** Q6.2c peer review is started: only the pairing
    rules are in (`src/lib/peer-review.ts`, tested: everyone reviews and is reviewed k times, never
    their own). Still to build: migration 0139 (`assignments.peerReviews`, `peerDueDate`; table
    `peer_reviews`), `src/server/peer-review.ts` (students' anonymous reviews, the teacher's "hand out
    reviews", reviews in grading), routes, sample stubs and screens. Then the rest of Q6: code with
    tests (6.2), PDF annotation (6.3), gradebook (6.4), the student side (6.5), writing replay (6.6).
  - **Not yet tried in a browser:** the Q6.2a (file / link) and Q6.2b (groups) screens; their API was
    tried on the Worker. The test script was written; run it with the next build.
  - **Lesson pages:** a page's body is plain text or the editor's JSON (`{"type":"doc"…`); always save it
    through `cleanPageBody` (`src/lib/lesson-page.ts`), and never send rich bodies in lists (`pageTexts`).
  - **Privacy fix in Q5.4:** the announcements list gave everyone every course's announcements.
  - **Teaching team:** `courseAccess` returns `canManage` (teacher, co-teacher, admin) and `canGrade`
    (+ assistants). New course features: use `canManage` to change things and `canGrade` for grading
    and the roster; "my courses" lists use `taughtBy(userId)`; copying and the team use `ownsCourse`.
  - **Testing locally:** two local teacher accounts (`tara@teacher.com`, `tom@teacher.com`) were added to
    the local database for this; put them in `DEMO_ACCOUNT_EMAILS` to use their mock tokens. The 15-minute
    cron can be fired with `wrangler dev --test-scheduled` and `curl '/__scheduled?cron=*/15+*+*+*+*'`.
  - **Browser tests:** every Q5 screen so far was tried on the built Worker (390 and 1280 px, light and
    dark, axe clean). The AI parts (syllabus draft, suggested discussion answer) need the live site.
- **Office suite (Collaborate → Docs), 16 Oct:** spreadsheets (O1), presentations (O2) and Word
  features in documents (O3), Progress rows O1–O3. **Migration 0150** (`docs.kind`: doc / sheet /
  slides; `doc_versions.data`, the JSON a sheet or deck goes back to). **Next migration: 0151.**
  Spreadsheets and presentations are docs of another kind (`/sheets/<id>`, `/slides/<id>`), so
  sharing, comments, history, offline copies and search come with them; the live connection is
  shared (`src/lib/use-live-doc.ts`). Engines are pure and tested (`src/lib/sheet/`,
  `src/lib/slides/`); Excel and PowerPoint files are written and read without a library. Newer
  Excel functions must be saved with `_xlfn.` (`excelFormula`) or other apps show #NAME?. **Browser tests and the editor:** ProseMirror reads a keyboard selection a moment after the key; a script that selects and clicks the toolbar in the same instant formats nothing (pause ~150 ms, as a person would). **Lesson:**
  never `void notify(...)` in a request: the unfinished database call left the Worker "hung" for
  the next requests; `await` it (fixed in `src/server/docs.ts` and `src/server/tasks.ts`).
- **Q8 home pages, 16 Oct (Progress row Q8):** **migration 0151** (`users.homeLayout`). `GET /api/home` (`src/server/home-data.ts`) is plain D1 (no Prisma) so the light API path (`cloudflare/fast-api.ts`) runs the same code, and it's in the startup bundle (key `/api/home?tz=<zone>`, built by `homeKey()` in `src/lib/bootstrap.ts`; the head script there must build the same key). A new home card: add it to `HOME_CARDS` (`src/lib/home-layout.ts`) and to the page's `cards` map; saved layouts pick it up. Deep links that open a page's form once: `useOnceParam` (`src/lib/use-once-param.ts`, `?new=`, `?schedule=`).
- **Q9 notifications, 16 Oct (Progress row Q9):** **migration 0152** (`users.notifyPrefs`, `users.digestAt`, `notifications.snoozedUntil`, `notifications.courseId`). Pushes now pass everyone's settings in `pushService.sendToMany` / `sendEach` (`pushRecipients`, one query): give a new push a `tag` whose start is listed in `NOTE_GROUPS` (`src/lib/notify-prefs.ts`) or a `kind`, and a `courseId` when it's about a course (muting works on that); `notify()` / `notifyMany()` take `courseId` too. Buttons on a push: `actions: [{ action, title, url }]` (up to 2, in-app addresses only). The bell's list leaves snoozed ones out on both paths (`cloudflare/fast-chat.ts` and `src/app/api/notifications/route.ts`).
- **Q10 search everywhere, 16 Oct (Progress row Q10):** **migration 0153** (`search_items` + the FTS5 table `search_fts`, kept in step by triggers). To make something new searchable by its words: call `indexItem` (`src/server/search-index.ts`) in the same request as the change, with a scope people resolve to (`doc:`, `tboard:`, `course:`; add the scope to `scopesOf` for a new kind), and add an `AFTER DELETE` trigger on its table in a migration. `/api/search` merges these with the name searches; the palette's groups are `RESULT_KIND` in `src/components/ui/CommandPalette.tsx`.
- **Q11 attendance, 16 Oct (Progress row Q11):** **migration 0154** (`attendance_excuses`, `courses.seating`, `enrollments.absenceAlertAt`, check-in fields on `school_policy`); **next migration: 0155**. Mark many students with `markMany` (`src/server/attendance-plus.ts`: one statement per 18 marks, D1's 100 values) rather than one request each. Attendance rows are stored at midnight UTC of the class day (`stamp`), as the old register did. The location check is `assertOnCampus` in the code check-in (`src/server/classroom.ts`); positions are never written anywhere.
- **Q12 calendar and timetable, 17 Oct (Progress row Q12):** **migration 0155** (`calendar_events.batch`); **next migration: 0156** (now 0157, see Q13). Events made together share a `batch`: `repeat:<uuid>` (a weekly repeat), `ics:<file name>` (an imported calendar file, replaced when the same name is imported again), `exam:<name>` (a published exam timetable); `DELETE /api/core/calendar/:id?series=1` removes a repeat or a file's events together. Event fields are cleaned in `src/server/services/calendar.service.ts` (`cleanEvent`: a title, end after start, 31 days at most, known kinds, hex colours); a course event still needs `assertManagesCourse`. The generators run in the browser (`src/lib/schedule-solver.ts`: `planWeek`, `planExams`, `findConflicts`; about 0.7 s for 200 courses, 12 tries kept the best); the server only gives their inputs and saves (`src/server/timetable-plan.ts`: `saveWeek` keeps a class already at the same time and room, adds new ones before removing old ones; 16 classes / 14 exams a statement for D1's 100 values; 320 classes, 200 exams at most a save, inside the 50 queries). The local demo admin can't save either (read-only, answers "Please sign in."), so saving was checked with unit tests (`src/server/timetable-plan.test.ts`), not in the browser. TimeGrid drags with window pointer listeners and finds the days from `[data-grid-body]` around the pressed element (not a ref: while the days slide, two copies of the grid are on the page); the dragged block stays in place invisibly (`lifted`) so a finger's touch keeps its target. Two-way Google / Outlook sync is still **[owner]** (a Google Cloud project and a Microsoft app); importing a calendar file and the existing feed link cover the one-way parts.
- **Q13 AI tutor, 17 Oct (Progress row Q13):** **migration 0156** (`courses.tutorRule`, FSRS fields on `study_cards`, `users.cardsRemindAt`, `ai_uses(courseId, createdAt)` index); **next migration: 0157**. Any new tutor route: get `tutorAccess` (it now carries the course's `rule`), refuse students with `tutorClosed(a)` (423), check `aiOn()` (key and the owner's AI switch), then `spendAi`. Put `MATH_RULE` (`src/lib/tutor-rules.ts`) in any AI prompt whose answer is shown, and show the answer with `MathText` (`src/components/ui/MathText.tsx`); it imports `katex/dist/katex.mjs` on purpose (plain `katex` can resolve to the CommonJS copy, which the chemistry extension doesn't touch). A homework photo's reading lives in the AI cache under `['homework', courseId, userId, ref]`; to test without AI, put a reading there (scratchpad `tutor-test.mjs` shows how) and run the Worker with a throwaway `GEMINI_API_KEY`. Flashcards: `review()` in `src/lib/fsrs.ts` (the old SM-2 `schedule` is gone).
- **What's left is written up in `STAGE-5-PLAN.md`, section 4 "Remaining work queue"**: 23 entries
  (Q1–Q23) in the order to do them, each with what exists to build on, the steps, the traps, how to
  know it's done, and its size. Q1 and Q2 are done; **finish Q3's test, then continue with Q4**.
- **A new page with an id in its address** (`/things/[id]`): copy a converted one (`page.tsx` with
  `generateStaticParams` → `'open'`, the client code in `View.tsx` using `usePathParams`), then run
  `node scripts/gen-api-routes.mjs`. A page rendered per request brings "Error 1101" back on Workers Free.
- What only the owner can do (accounts, keys, the Workers Paid decision) and what they should try is
  at the end of that section.

## Where things stand (10 Oct 2026)

- Blocks 1–4, D1 and D10 are **merged into `main`** (PR #47, PR #50) and **live**; the production
  database has every migration up to **0093** (`wrangler d1 migrations list universe-db --remote`
  showed none pending). The owner-console CPU fix is live too (PR #49). Work after that goes on a
  new branch from `main` (D2: `claude/stage-5-whisper`).
- **Handover, 12 Oct 2026 (night): D5 Peer Tutoring Time-Bank built on branch `claude/stage-5-saas`.**
  Migration **`0118`** (`0118_peer_tutoring_time_bank.sql`): `peer_time_bank_accounts`, `peer_time_credit_transactions`, `peer_tutor_profiles`, `peer_tutor_slots`, `peer_tutoring_sessions` tables created. Implements student time-banking (1 credit = 20-min session), D1 Learning DNA mastery-matched tutor profiles, 20-minute session booking with credit escrow, call duration and peer review verification, and automated Skill Passport "Peer Teaching" evidence issuance. Applied to local D1.
  Next migration: **`0119`**.
  `src/server/peer-tutoring.ts`: `getOrCreateTimeBankAccount` (provisions 3 starter credits on first sign-up), `getTimeBankLedger` (account stats & transaction ledger), `detectStudentMasteredSubjects` (D1 Learning DNA mastery level >= 0.8 & quiz scores auto-detection), `getTutorProfile`, `upsertTutorProfile`, `listPeerTutors` (search, subject filter, D1 verified filter), `addTutorSlots`, `deleteTutorSlot`, `bookTutoringSession` (credit escrow check, room generation, status 'SCHEDULED', xAPI tracking), `listUserTutoringSessions`, `completeAndRateTutoringSession` (call log verification >= 180s, 1-5 star rating, feedback tags, credit transfer +1 to tutor, auto-check for Passport credential), `cancelTutoringSession` (status 'CANCELLED', unbooks slot, refunds 1 credit to learner), `issuePeerTeachingPassportEvidence` (records verified evidence in `SkillEvidence` and `StudentSkill` when >= 3 sessions and >= 4.5 rating).
  API Endpoints:
  - `/api/tutoring/time-bank` (GET user's Time-Bank account, balance, stats, and transaction ledger)
  - `/api/tutoring/tutors` (GET list peer tutors with filters; POST upsert tutor profile)
  - `/api/tutoring/tutors/mastered-subjects` (GET auto-detected mastered subjects from D1 Learning DNA)
  - `/api/tutoring/slots` (GET tutor availability slots; POST add slots; DELETE remove slot)
  - `/api/tutoring/sessions` (GET user's sessions; POST book 20-min session)
  - `/api/tutoring/sessions/[id]` (GET single session details; DELETE cancel session with refund)
  - `/api/tutoring/sessions/[id]/complete` (POST complete session with call logs, rating, credit transfer, and passport credential check)
  UI:
  - `src/components/tutoring/PeerTutoringTimeBank.tsx`: 4-tab suite (Browse Tutors, My Sessions with 20-min call room links & rating modal, Tutor Studio with D1 Learning DNA sync & slots manager, Time-Bank Ledger).
  - Dedicated page: `src/app/(dashboard)/student/tutoring/page.tsx`.
  - Navigation: Integrated in `STUDENT_BOARD_TABS`, `STUDENT_TUTOR_MODES`, and `Sidebar.tsx`.
  `src/lib/sample/router.ts`: Sample mode stubs for all `/api/tutoring/*` GET, POST, and DELETE routes.
  Unit tests: 13 unit tests in `src/server/peer-tutoring.test.ts`. Full test suite: 72 files, 561 tests passing. Zero TypeScript errors, zero ESLint errors.
- **Handover, 12 Oct 2026 (night): D4 Impact-to-Scholarship Exchange built on branch `claude/stage-5-saas`.**
  Migration **`0117`** (`0117_impact_scholarship_exchange.sql`): `impact_credits`, `impact_sponsor_pools`, `impact_scholarship_claims` tables created. Implements tamper-evident SHA-256 hash-chained credit ledger, corporate/NGO/alumni sponsor pools, claim validation with academic standing, and public QR certificate verification. Applied to local D1.
  Next migration: **`0118`**.
  `src/server/impact-scholarships.ts`: `computeLedgerHash`, `verifyLedgerIntegrity` (tamper-evident SHA-256 hash-chaining verification from GENESIS), `getImpactCreditBalance`, `mintImpactCredits`, `createSponsorPool`, `listSponsorPools`, `claimScholarship` (with credit balance validation, GPA check, award allocation, and HMAC signature), `reviewScholarshipClaim` (with automatic credit refund on rejection), `verifyScholarshipByQr` (public proof), `getStudentImpactLedger`.
  API Endpoints:
  - `/api/scholarships/pools` (GET list pools with student eligibility, POST create pool)
  - `/api/scholarships/claims` (GET my claims, POST submit claim)
  - `/api/scholarships/claims/[id]/review` (POST approve or reject claim with auto-refund)
  - `/api/scholarships/verify/[token]` (GET public verification with full proof)
  - `/api/scholarships/credits/ledger` (GET audit ledger & hash integrity status)
  UI:
  - `src/components/impact/ImpactScholarshipExchange.tsx`: Verified credit balance card, sponsor pool cards with eligibility status and 1-click claim modal, claims list with QR modal, and full cryptographic ledger inspector.
  - `src/app/verify/scholarship/[token]/page.tsx`: Public QR certificate verification page with cryptographic claim signature, school confirmation, and award details.
  - Integrated into `src/app/(dashboard)/student/administrative/scholarships/page.tsx` with a dual-tab toggle between traditional grants and the Impact Exchange.
  `src/lib/sample/router.ts`: Sample mode stubs for all `/api/scholarships/*` routes.
  Unit tests: 13 unit tests in `src/server/impact-scholarships.test.ts`. Full test suite: 71 files, 548 tests passing. Zero TypeScript errors, zero ESLint errors.
- **Handover, 12 Oct 2026 (night): D3 Lecture to Everything (Micro-Lessons, Audio Recaps & Revision Reels) built on branch `claude/stage-5-saas`.**
  Migration **`0116`** (`0116_lecture_to_everything.sql`): `lecture_micro_lessons` table created with `sessionId`, `courseId`, `audioRecapDurationSec`, `audioRecapScript`, `audioRecapStatus`, `mindMap`, `reels`, `practiceQuiz`, `status`, `viewCount`. Applied to local D1.
  Next migration: **`0117`**.
  `src/server/lecture-micro-lessons.ts`: `synthesizeAudioRecapScript` (structured 5-minute spoken audio recap with hook, foundational concepts, mechanics, deep dive moment, exam trap alert, and 60s summary), `buildRevisionReels` (3 to 6 vertical 9:16 reels cut at chapter boundaries with burned-in dynamic captions, takeaways, and gradients), `buildLectureMindMap` (hierarchical taxonomy tree), `buildPracticeQuiz` (rapid multi-choice knowledge checks), `generateLectureMicroLesson`, `getLectureMicroLesson`, `listCourseMicroLessons`, `trackMicroLessonInteraction` (integrated with C8 xAPI statements).
  API Endpoints:
  - `/api/courses/[id]/micro-lessons` (GET list micro-lessons for course)
  - `/api/class-sessions/[id]/micro-lesson` (GET / POST generate/regenerate micro-lesson pack)
  - `/api/class-sessions/[id]/micro-lesson/interact` (POST record reel view & telemetry)
  UI:
  - `src/components/lecture/LectureRevisionReels.tsx`: 4-mode micro-learning suite:
    1. Revision Reels: 9:16 vertical stories player with chapter progress bars, playback speed (1x-2x), Web Speech API voiceover, takeaway badge, dynamic burned-in subtitles, and hashtags.
    2. 5-Minute Audio Recap: Spoken lecture digest with live browser voice synthesis and full transcript drawer.
    3. Mind Map: Interactive hierarchical knowledge tree with glowing topic nodes and exam tips.
    4. Practice Sprint: Fast exam readiness quiz with immediate option feedback and explanations.
  - Dedicated pages: `/student/reels` and `/teacher/reels`.
  - Navigation: Integrated in `STUDENT_BOARD_TABS`, `TEACHER_BOARD_TABS`, and `Sidebar.tsx`.
  `src/lib/sample/router.ts`: Sample mode stubs for all `/api/courses/[id]/micro-lessons` and `/api/class-sessions/[id]/micro-lesson` routes.
  Unit tests: 10 unit tests in `src/server/lecture-micro-lessons.test.ts`. Full test suite: 70 files, 535 tests passing. Zero TypeScript errors, zero ESLint errors.
- **Handover, 12 Oct 2026 (night): C8 Learning Analytics Warehouse & xAPI built on branch `claude/stage-5-saas`.**
  Migration **`0115`** (`0115_learning_analytics_warehouse.sql`): `xapi_statements`, `analytics_exports`, `research_data_requests` tables created. Enables event stream tracking, automated anonymized warehouse exports, and governed research data access. Applied to local D1.
  Next migration: **`0116`**.
  `src/server/analytics-warehouse.ts`: `recordXApiStatement`, `listXApiStatements`, `hashSyntheticIdentifier` (cryptographic `syn_usr_...` DPDP/FERPA anonymizer), `generateWarehouseExport` (tabular CSV or JSON stream with SHA-256 verification checksums), `listWarehouseExports`, `getComparativeTermAnalytics` (term-over-term retention, GPA, mastery score, and verb distribution), `submitResearchDataRequest`, `listResearchDataRequests`, `reviewResearchDataRequest` (time-bounded token issuance).
  API Endpoints:
  - `/api/analytics/xapi` (GET query statements, POST record learning interaction event)
  - `/api/analytics/warehouse/export` (GET history, POST generate new warehouse export)
  - `/api/analytics/warehouse/terms` (GET comparative term cohort metrics)
  - `/api/analytics/warehouse/research` (GET list proposals, POST submit new proposal)
  - `/api/analytics/warehouse/research/[id]/review` (POST approve/reject research proposal)
  UI:
  - `src/components/admin/AnalyticsWarehousePanel.tsx`: 4-tab analytics warehouse suite: Comparative Term Cohorts, Live xAPI Telemetry stream (with verb filtering and event emitter), Warehouse Export Engine (date ranges, anonymization toggle, SHA-256 hash, and instant download), and Academic Research Data Governance.
  - `src/app/(dashboard)/admin/insights/warehouse/page.tsx`: Dedicated dashboard screen.
  - `src/components/layout/SectionTabs.tsx` & `Sidebar.tsx`: Integrated in `ADMIN_INSIGHT_TABS` and `also` on `/admin/insights`.
  `src/lib/sample/router.ts`: Sample mode stubs for all `/api/analytics/*` GET and POST routes.
  Unit tests: 8 unit tests in `src/server/analytics-warehouse.test.ts`. Full test suite: 69 files, 525 tests passing. Zero TypeScript errors, zero ESLint errors.
- **Handover, 12 Oct 2026 (night): C7 Content Marketplace built on branch `claude/stage-5-saas`.**
  Migration **`0114`** (`0114_content_marketplace.sql`): `marketplace_packs`, `marketplace_reviews`, `marketplace_imports` tables created. Tracks curriculum packs, author attribution, ratings/reviews, and course deep copying with 80% creator revenue share. Applied to local D1.
  Next migration: **`0115`**.
  `src/server/marketplace.ts`: `publishMarketplacePack`, `listMarketplacePacks`, `getMarketplacePack`, `addMarketplaceReview` (with automatic average rating recomputation), `importPackIntoCourse` (deep copies modules & module items with sequential position preservation and download counters).
  API Endpoints:
  - `/api/marketplace/packs` (GET catalog with search/category/level/price filters & sort; POST publish)
  - `/api/marketplace/packs/[id]` (GET single pack with parsed module bundle & reviews)
  - `/api/marketplace/packs/[id]/reviews` (GET reviews list; POST write review)
  - `/api/marketplace/packs/[id]/import` (POST one-click course deep-copy)
  - `/api/marketplace/my-published` (GET teacher's published packs & creator royalty stats)
  UI:
  - `src/components/marketplace/MarketplaceCatalog.tsx`: World-class marketplace catalog with interactive search, multi-category tabs, level and price filtering, rich course pack cards with author & syllabus metadata, interactive Syllabus Inspector modal with module tree & peer reviews submission, Publish Course Pack modal with 80% royalty calculator, and "My Published Packs & Royalties" analytics view.
  - `src/app/(dashboard)/marketplace/page.tsx`: Dedicated Marketplace dashboard page with Topbar integration.
  - `src/components/layout/Sidebar.tsx`: Added `/marketplace` link for teachers, students, and admins under academic & schooling menus.
  `src/lib/sample/router.ts`: Sample mode stubs for all `/api/marketplace/*` GET and POST routes.
  Unit tests: 6 unit tests in `src/server/marketplace.test.ts`. Full test suite: 68 files, 517 tests passing. Zero TypeScript errors, zero ESLint errors.
- **Handover, 12 Oct 2026 (night): C6 Unified Payments Provider (Razorpay UPI + Stripe) built on branch `claude/stage-5-saas`.**
  Migration **`0113`** (`0113_unified_payments.sql`): `paymentProvider` ('AUTO' | 'RAZORPAY' | 'STRIPE'), Razorpay credentials (`razorpayKeyId`, `razorpayKeySecret`, `razorpayWebhookSecret`), Stripe credentials (`stripePublishableKey`, `stripeSecretKey`, `stripeWebhookSecret`) added to `organizations`. Enhanced `fee_payments` with gateway tracking (`gateway`, `orderId`, `refundedAt`, `refundedAmount`, `refundReason`). Created `payment_orders` table for unified online checkout tracking across fees, event tickets, and donations. Applied to local D1.
  Next migration: **`0114`**.
  `src/server/payments/types.ts`: Provider abstraction (`PaymentProviderName`, `PaymentPurpose`, `CreatePaymentOrderInput`, `PaymentOrderOutput`, `VerifyPaymentInput`, `RefundPaymentInput`, `ReconciliationReport`).
  `src/server/payments/razorpay.ts`: HMAC-SHA256 payment signature verification, webhook signature verification, order creation, refund API, and standard NPCI UPI Intent URI generator (`upi://pay?...`).
  `src/server/payments/stripe.ts`: Stripe checkout session creation and refund API.
  `src/server/payments/provider.ts`: Smart currency routing (INR -> Razorpay UPI, USD/EUR/GBP -> Stripe, or org override), order creation, payment verification & automatic FeeInvoice reconciliation, refund processor, and comprehensive reconciliation report generator.
  Endpoints: `/api/payments/create-order` (POST), `/api/payments/verify` (POST), `/api/webhooks/razorpay` (POST), `/api/admin/payments/reconciliation` (GET JSON/CSV), `/api/admin/payments/refund` (POST), `/api/admin/payments/settings` (GET/PATCH).
  UI: `PaymentReconciliationPanel.tsx` (Settlement metrics, gateway distribution, transaction table with instant refund modal, CSV download, and gateway credentials setup), dedicated page at `/admin/finances/reconciliation`, `ADMIN_FINANCE_TABS` integration, and `OnlineFeePaymentModal.tsx` in `FamilyFees.tsx` for one-click student/parent UPI & Card fee payments.
  Sample stubs in `src/lib/sample/router.ts`.
  11 unit tests in `src/server/payments/provider.test.ts`. Full test suite: 67 files, 511 tests passing. Zero TypeScript errors, zero ESLint errors.
- **Handover, 12 Oct 2026 (night): C4 Public REST API, Scoped Keys, and HMAC Webhooks built on branch `claude/stage-5-saas`.**
  Migration **`0112`** (`0112_public_api_and_webhooks.sql`): `api_keys` table (SHA-256 key hashing, `keyPrefix`, JSON scopes, `rateLimit`, `lastUsedAt`, `expiresAt`, `revokedAt`) and `webhook_endpoints` / `webhook_deliveries` tables (HTTPS destination URL, `whsec_...` HMAC secret, JSON events, active toggle, delivery status, HTTP status codes, error payload). Applied to local D1.
  Next migration: **`0113`**.
  `src/server/public-api.ts`: API key generation with raw `uv_live_...` secrets, SHA-256 cryptographic hashing, Bearer authentication middleware with scope enforcement (`VALID_API_SCOPES`: courses, students, grades, attendance, webhooks), and revocation.
  `src/server/webhooks.ts`: HMAC-SHA256 signature generation (`t=...,v1=...`), timing-safe verification, event filtering (`VALID_WEBHOOK_EVENTS`), HTTP POST dispatcher with 6s timeout, and delivery audit logging.
  Public V1 REST API: `/api/v1/courses` (GET/POST), `/api/v1/students` (GET), `/api/v1/grades` (GET/POST), `/api/v1/attendance` (GET/POST), and `/api/v1/openapi` (GET OpenAPI 3.1 specification).
  Admin Management API: `/api/admin/api-keys` (GET/POST), `/api/admin/api-keys/[id]` (DELETE), `/api/admin/webhooks` (GET/POST), `/api/admin/webhooks/[id]` (PATCH/DELETE), `/api/admin/webhooks/[id]/deliveries` (GET), `/api/admin/webhooks/test` (POST test dispatcher).
  UI: `src/components/admin/DeveloperApiPanel.tsx`: 3-tab Developer Platform (API keys generator with one-time copy callout, Webhook subscriptions with live deliveries inspector and test event dispatcher, and Interactive REST docs with OpenAPI link). Dedicated page at `src/app/(dashboard)/admin/integrations/developer/page.tsx` linked in `ADMIN_PEOPLE_TABS`.
  `src/lib/sample/router.ts`: Sample mode stubs for all `/api/v1/*` endpoints, `/api/admin/api-keys`, and `/api/admin/webhooks`.
  Unit tests: 13 tests passing across `src/server/public-api.test.ts` (7 tests) and `src/server/webhooks.test.ts` (6 tests). Full test suite: 66 files, 500 tests passing. Zero TypeScript errors, zero ESLint errors.
- **Handover, 12 Oct 2026 (night): C3 OneRoster 1.2 SIS Integration built on branch `claude/stage-5-saas`.**
  Migration **`0111`** (`0111_oneroster_sync.sql`): `oneroster_syncs` table created (logs sync operations, entity counts, status, and actor), `oneroster_mappings` table created (idempotent SIS `sourcedId` ↔ UniVerse target ID mapping across ORG, ACADEMIC_SESSION, COURSE, CLASS, and USER). Applied to local D1.
  Next migration: **`0112`**.
  `src/server/oneroster.ts`: `parseOneRosterCsvTable`, `parseOneRosterBundle`, `previewOneRosterSync`, `executeOneRosterSync`, `listOneRosterSyncHistory`, and outbound 1EdTech REST endpoints (`getOneRosterOrgs`, `getOneRosterCourses`, `getOneRosterClasses`, `getOneRosterUsers`, `getOneRosterEnrollments`).
  `src/app/api/admin/oneroster/preview/route.ts`: dry-run analysis for OneRoster CSV bundles.
  `src/app/api/admin/oneroster/sync/route.ts`: executes batch roster synchronization with audit logging.
  `src/app/api/admin/oneroster/history/route.ts`: sync history list.
  `src/app/api/oneroster/v1p2/*`: outbound 1EdTech standard REST API endpoints (/orgs, /courses, /classes, /users, /enrollments).
  `src/components/admin/OneRosterSyncPanel.tsx`: full administrative panel for dropping OneRoster CSV tables, inspecting user/course/enrollment differences, executing sync, and checking sync history.
  `src/app/(dashboard)/admin/integrations/oneroster/page.tsx`: dedicated OneRoster SIS Sync screen.
  `src/components/layout/SectionTabs.tsx`: added 'OneRoster SIS' tab to `ADMIN_PEOPLE_TABS`.
  `src/app/(dashboard)/admin/import/page.tsx`: added callout banner pointing to OneRoster SIS Sync.
  `src/lib/sample/router.ts`: sample mode stubs for all OneRoster GET and POST endpoints.
  10 unit tests in `src/server/oneroster.test.ts` (all passing). Vitest suite: 57 passing tests across Block 7. Typecheck clean, eslint 0 errors.
- **Handover, 12 Oct 2026 (evening): C5 Compliance and Trust built on branch `claude/stage-5-saas`.**
  Migration **`0110`** (`0110_compliance_and_trust.sql`): `dataRetentionDays` added to `organizations`, `educational_record_logs` table created (FERPA 34 CFR Part 99.32 access logging), `privacy_grievances` table created (India DPDP Act 2023 Sections 11–14 Data Principal rights & nomination). Applied to local D1.
  Next migration: **`0111`**.
  `src/server/compliance.ts`: `cleanRecordType`, `cleanGrievanceType`, `cleanRetentionDays`, `logEducationalRecordAccess`, `getEducationalRecordAccessLogs`, `submitPrivacyGrievance`, `listPrivacyGrievances`, `resolvePrivacyGrievance`.
  `src/app/api/compliance/ferpa/logs/route.ts`: FERPA educational record access logging & student/guardian inspection.
  `src/app/api/compliance/grievance/route.ts`: DPDP Act 2023 Data Principal requests (Correction, Erasure, Grievance, Nomination).
  `src/app/api/compliance/retention/route.ts`: admin institutional data retention policy (GET / PATCH).
  `src/app/api/trust/status/route.ts`: public telemetry endpoint (health, uptime, system latencies, encryption).
  `src/app/trust/page.tsx` & `TrustClient.tsx`: world-class public Trust Center with real-time telemetry, DPDP 2023, FERPA/COPPA, infrastructure security, and subprocessors registry.
  `src/components/settings/ConsentsPanel.tsx`: updated with FERPA Directory Opt-Out, DPDP AI Processing, Career Matching, self-service DPDP request filing, and FERPA inspection history.
  `src/components/settings/OrganizationSettings.tsx`: updated with Institutional Data Retention schedule dropdown.
  `src/lib/sample/router.ts`: sample mode stubs for all compliance endpoints.
  15 unit tests in `src/server/compliance.test.ts` (all passing). Vitest suite: 477 tests passing. Typecheck clean, eslint 0 errors.
- **Handover, 12 Oct 2026 (afternoon): C3 Enterprise SSO & University Logins built on branch `claude/stage-5-saas`.**
  Migration **`0109`** (`0109_enterprise_sso.sql`) adds `ssoEnabled`, `ssoProvider` (MICROSOFT | GOOGLE | SAML), `ssoDomain`, `ssoTenantId`, and `ssoEnforced` to organizations. Applied to local D1.
  Next migration: **`0110`**.
  `src/server/sso.ts`: `cleanSsoProvider`, `cleanSsoDomain`, `cleanTenantId`, `matchSsoDomain`, `lookupSso`, `clearSsoCache`.
  `src/app/api/auth/sso/lookup/route.ts`: public endpoint resolving SSO configuration by school subdomain / custom host or user email domain.
  `src/app/api/admin/sso/route.ts`: admin settings endpoint (GET/PATCH) for organization SSO configuration and audit logging.
  `src/app/(auth)/login/page.tsx`: 1-click Microsoft Entra ID (Office 365) login alongside Google and Apple, school subdomain SSO detection banner, and expandable School SSO email lookup drawer.
  `src/app/(auth)/register/page.tsx`: Microsoft OAuth sign-up alongside Google and phone.
  `src/components/settings/OrganizationSettings.tsx`: dedicated Enterprise SSO configuration card (provider selector, allowed email domains, tenant/entity ID, and enforce SSO toggle).
  `src/lib/sample/router.ts`: sample mode stubs for `/api/auth/sso/lookup` and `/api/admin/sso`.
  17 unit tests in `src/server/sso.test.ts` (all passing). Vitest suite: **462 tests passing** across 62 test files. Typecheck clean (0 errors), eslint 0 errors.
- **Handover, 12 Oct 2026 (night): C2 Multi-School SaaS built on branch `claude/stage-5-saas`.**
  PR #53 (`claude/stage-5-calls`) is merged into `main` (migrations 0105–0107 live).
  Migration **`0108`** (`0108_multi_school_saas.sql`) adds school subdomains (`slug`), custom domains, brand colors, crest/logo, custom app title, tagline, seat limits, and scopes users and campuses to organizations. Applied to local D1.
  `src/server/tenant.ts`: `resolveTenant`, `cleanSlug`, `cleanCustomDomain`, `cleanBrandColor`, `extractHostSlug`, `scopeWhere`.
  `src/app/api/org/branding/route.ts`: public cached branding endpoint for school portal.
  `src/app/api/org/manifest/route.ts`: dynamic PWA manifest tailored per school/subdomain.
  `src/app/api/admin/settings/route.ts`: reads and updates organization branding, subdomains, and seat counts.
  `src/components/settings/OrganizationSettings.tsx`: updated with school subdomain configuration, custom domain guide, brand accent color picker with presets, app title, and live student/teacher portal preview card.
  Sample mode stubs in `src/lib/sample/router.ts`.
  15 unit tests in `src/server/tenant.test.ts` (all passing).
- **Handover, 11 Oct 2026 (evening): read this first.** PR #51 (block 6) and PR #52 (docs, boards, TS/SQL, B8.1/B8.3) are **merged and live**; production D1 has migrations **up to 0104**. Branch **`claude/stage-5-calls`** (pushed, PR open: B8.2, B8.4, B8.6, B8.7, B8.8, B8.9, B7.6, and the error fix below) adds **0105–0107**; the deploy applies them. Next migration: **`0108`**. B8.5 (live streaming) is not built: the owner wants the plan **free** for now (see the Progress row). Block 6 is done except B7.3 (waits for C4 webhooks). **Next: blocks 7–10** (the owner said "don't skip anything").
- **Cloudflare errors (last 24 h, read 11 Oct 20:55 UTC with Workers analytics):** 651 fine, **7 "exceededResources"** (CPU limit) in two bursts (16:06 and 20:38 UTC) plus 9 "client disconnected". Cause, measured with `wrangler tail`: on Workers Free, the **first request on a fresh instance costs 0.8–1.5 s CPU** (starting the Next.js app; it has grown with Stage 5), later ones 5–70 ms; when the app opens on a fresh instance, the startup requests pile up there and get cut off at about 2 s. Not the 15-minute cron (wrong minutes). **Done:** reads (GET / HEAD) retry once automatically after ~1 s when Cloudflare cuts them off (`fetchWithRetry` in `src/lib/authed-fetch.ts`, used by `authedFetch` and `src/lib/api.ts`), and the startup bundle's answers can be used twice in the first 10 s (`src/lib/bootstrap.ts`), so `/api/core/users/me` isn't asked again. **Still worth doing:** add `/api/brief?tz=…` to the startup bundle for /student and /teacher (both `startBootstrap` keys and the head script, `ROUTES` in `src/app/api/bootstrap/route.ts`); profile the cold start (a local `opennextjs-cloudflare build` + `wrangler dev --inspect`) for heavy module-level work; the real fix is **Workers Paid** ($5/month, 30 s CPU), which the owner will decide later. Past Observability events can't be read with wrangler's login; the analytics script used was a read-only GraphQL query (`workersInvocationsAdaptive`, by status and minute).
- The site is on **Workers Free** (10 ms CPU per request; measured 5–88 ms for warm API calls). The
  owner will move to Workers Paid later; until then keep requests light.
- **Next migration number: `0110`** (0105 meeting templates, 0106 recording privacy and trim and 0107 private chats are on branch `claude/stage-5-calls`, made from `claude/stage-5-docs` while PR #52 waits; 0103 doc pages and 0104 call ratings are on branch `claude/stage-5-docs`, made from `claude/stage-5-block6` while PR #51 waits; 0082–0093 are live with PR #50; 0094 Whisper TA, 0095 message reminders, 0096 sticker packs, 0097 community roles, 0098 text translations, 0099 status reactions, 0100 task extras, 0101 task automations and 0102 files hub on branch `claude/stage-5-block6`, which also holds D2). Merging to `main` makes Cloudflare build and deploy, and the deploy
  applies new migrations first (`DEPLOY-CLOUDFLARE.md`, "Deploy command"). Nothing to run by hand.
- Tests: `npx vitest run` → **462 passing**. `pnpm typecheck` clean. `pnpm lint` 0 errors.

### Done in Stage 5

A1 lint debt · A2 design system · A3 motion/loading · A5 accessibility · A6 automated checks ·
A4 Web Vitals and bundle cuts (partly) · B2.1 course modules · B3.1 grading speed (partly) ·
B3.4 gradebook categories and final grades · B4.1 question bank · B4.3–4.4 shuffle and exam mode ·
B4.6 quiz item analysis · B15.3 report cards · B16.1 guardian (parent) accounts ·
B16.2 parent–teacher messages · B16.3 parent–teacher meetings · B16.4 consent forms ·
B15.2 school fees · B15.7 bulk import/export · B15.1 admissions · B15.6 custom roles · B15.8 staff · B15.4 library · B15.5 registers (admin actions in these to be tried with real data: see “Testing the admin parts” below) ·
D1 Learning DNA · D10 second chances · D2 Whisper TA.

### Testing the admin parts (block 4)

The local demo admin can't save (by design), so these were built and checked as far as possible
but not used with real data: fees, import/undo, admissions (rounds, the filled-in public form,
offers, enrolment), roles given to staff, leave approval and cover, library lending, registers.
The owner chose to test them together at the end: on the PR preview with the real admin account
(make a fee plan and issue it, record a payment and open the receipt; import a small CSV and undo
it; open a round, apply on its public link, offer, accept, enrol; make a role and give it to a
teacher; approve a leave and set cover; add a book, lend and return it; add equipment, print a
label, lend it; add a bus route and a hostel room and put a student in each).

## What to do next, in order

> **Out of date: use `STAGE-5-PLAN.md` section 4 ("Remaining work queue", 14 Oct 2026).** The list
> below is the order from early October, kept for history.

The plan's order (section 2) is the guide. Suggested next steps:

1. **Finish block 4 (school admin and parents):**
   - ~~B16.2 parent–teacher messaging~~ **done** (see the Progress row). Parents still can't use the chat
     API itself: they go through `/api/parent/chats` (see "Parent accounts" below).
   - ~~B16.4 consent forms with e-signature~~ **done** (see the Progress row).
   - ~~B16.3 parent–teacher meetings~~ **done** (see the Progress row). Video meetings are calls `pm_<id>`;
     parent accounts may reach only those calls.
   - ~~B15.2 fees~~ **built** (see the Progress row): **admin actions still need a try with real data** (the local
     demo admin is read-only; check on the preview with the real admin account).
   - ~~B15.7 bulk CSV import/export~~ **built** (importing and undo still to try with real data, like fees).
   - ~~B15.1 admissions~~ **built** (admin actions and the public form still to try with real data).
   - ~~B15.6 custom roles and permissions~~ **built**: new admin areas should check `can(user, '<area>.<verb>')`
     (`src/server/permissions.ts`) and add their keys to `src/lib/permissions.ts`.
   - ~~B15.8 staff (leave, cover, attendance)~~ **built** (approving leave and planning cover still to try with real data).
   - ~~B15.4 library~~ **built** (lending, returns and adding books still to try with real data).
   - ~~B15.5 registers~~ **built** (adding and changing entries still to try with real data). **Block 4 is built.**
   - B16.5 fee payment for parents comes with B15.2. Online payment needs the owner (Stripe exists;
     **UPI/Razorpay needs the owner's account**).
2. **Block 5:** ~~D1 Learning DNA~~ **done** (concepts, tags, mastery from quizzes and rubrics; `src/lib/mastery.ts`), ~~D10 second chance~~ **done** (catch-ups on what was missed; practice feeds D1), ~~D2 Whisper TA~~ **done** (try it in a real class call on the live site). **Block 5 is done.**
3. **Block 6** (branch `claude/stage-5-block6`): ~~B7.1 message reminders and Later~~ **done**; ~~B7.2 sticker packs~~ **done** (GIF search needs the owner's Tenor or Giphy key); ~~B7.4 channel categories and permissions~~ **done**; ~~B7.5 Translate everywhere~~ **done**; B7.7 was already there; ~~B7.8 chat export~~ **done**; ~~B7.9 status reactions, replies, close friends~~ **done**; ~~B7.10 rich link cards~~ **done**; ~~B9.1 doc templates~~ **done**; ~~B9.8 task calendar and timeline~~ **done**; ~~B9.9 task card extras~~ **done**; ~~B9.10 task automations~~ **done**; ~~B9.14 file converter~~ **done** (in Collaborate → Docs, all in the browser); ~~B9.13 files hub~~ **done** (My files, Recent, Starred, search inside files, share links that expire, drag and drop: Collaborate → Files); on branch `claude/stage-5-docs` (from block6, while PR #51 waits): ~~B9.7 offline docs~~, ~~B9.6 export / import~~, ~~B9.2 page tree (0103)~~, ~~B9.5 embeds~~, ~~B9.4 AI writing helper~~, ~~B9.3 suggestions mode~~ **done** (all of B9.1–B9.7) (B7.3 bots waits for C4's webhooks; B7.6 end-to-end encrypted chats is left for a careful round of its own); then the rest of B7–B9 messaging, calls, docs and tasks power features (the owner added **B9.14, a file converter for any format**, on 10 Oct 2026: it goes in **Collaborate → Docs**, where all the documents are, so students can convert them; build it in this block, not before); the owner added **B9.15, Studio: editing tools in Collaborate** (photo editor like Photoshop, then video, audio and PDF editors) on 11 Oct 2026: ~~build the photo editor straight after B7.5~~ **photo, PDF, audio and video editors done**. Then blocks 7–10.

### Leftovers inside finished items (pick up when nearby)

| Item | Not done yet |
|---|---|
| A4 | 3-size responsive images (store -sm/-md/-lg, change image tags), API caching / N+1 review |
| B2.1 | Drag-and-drop ordering, prerequisites other than a quiz score |
| B3.1 | Rubric level keys (1–5), inline annotation of PDFs/images |
| B3.4 | Per-school letter scales, mute/post grades, LTI AGS grade export, grade history audit |
| B4.1 | QTI/GIFT import, question types beyond multiple choice, random pools per quiz |
| B15.3 | Grading scheme presets (CBSE/ICSE/IB), school logo on the card, marks-entry grid |
| B16.1 | A demo parent account was **not** added on purpose: a shared demo parent that anyone can sign in to could be linked to a real child. If the owner wants one for demos, make it read-only (no linking) and seed a link to the demo student |

## The owner's standing rules (follow all of them)

- **Merge only when the owner says "merge".** Work on your branch, one commit per item, push at checkpoints.
- **No new emails.** Use `notify` / `notifyMany` with `email: false` (in-app and push only).
- **New features go inside existing menus as tabs** (`src/components/layout/SectionTabs.tsx`), not new
  sidebar entries.
- **Smooth motion:** `m as motion` from framer-motion with the presets in `src/lib/motion.ts`.
- **Links:** `@/components/ui/Link` (it never prefetches).
- **No polling** where live updates exist: `publish(userIds, { type: 'refresh', keys })` from
  `src/server/realtime.ts`.
- **Cloudflare Workers Free limits:**
  - At most 100 bound parameters per D1 query: chunk `in: [...]` lists by 90 and insert rows in small groups.
  - Live pushes are capped (`planLimits().livePushes`).
  - Long jobs run in batches the browser asks for one by one (see report cards).
- **AI** goes through `spendAi` / `featureOff` (`src/server/ai-budget.ts`).
- **Sample mode:** every new GET needs a stub in `src/lib/sample/router.ts` (and POSTs a `notice()` stub).
- **Request bodies** are untrusted: read them through `src/server/body.ts` (`oneOf`, `str`, `text`, …).
- **Never handle real secrets.** For local tests use throwaway values in environment variables, never
  `.dev.vars`.
- **No model names or IDs** in commits, PRs or code.
- **Anything that costs money needs the owner's yes.**
- **Don't import big generated JSON as a module.**
- If `CallRoom` changes, run `node scripts/test-call-room.mjs`.
- After a production build, revert `public/sw.js` and `public/fallback-*.js` (`git checkout` them).
- **Testing:**
  - `pnpm typecheck`, `npx eslint <changed files>`, `npx vitest run`, plus targeted API scripts and
    Playwright checks with axe at 390 px.
  - **No screenshots.**
- **Explain things to the owner simply**, step by step. They aren't a developer.

## How to run and test locally (from `apps/web`)

- **Prisma:**
  - After schema changes: `PRISMA_GENERATE_SKIP_AUTOINSTALL=1 npx prisma generate`, then restart the
    dev server.
  - **Don't run `prisma format`**: it reflows unrelated lines.
  - New tables need a hand-written `prisma/migrations/00NN_name.sql` (copy the style of 0080/0081).
  - Then run `pnpm -s db:migrate:local` and `node scripts/gen-owner-schema.mjs`.
- **Dev server:** `NEXT_PUBLIC_DEMO_LOGIN=true pnpm dev -p 3100`.
- **Demo tokens for API tests:** header `Authorization: Bearer mock-token-<email>` with
  `demo@student.com`, `demo@teacher.com` or `demo@admin.com`.
- **Browser tests:** `scripts/browser-session.mjs` (`launch`, `signedIn(browser, base, email, viewport)`),
  axe from `axe-core/axe.min.js`.
  - `scripts/a11y.mjs` checks accessibility.
  - `scripts/crawl.mjs` visits every page.
  - `scripts/bundle-report.mjs` reports sizes after a build.
- **The demo admin is read-only for writes** (`demoWriteBlocked` in `src/server/auth.ts`). To test an
  admin POST locally, temporarily add the route to `DEMO_ADMIN_WRITABLE`, test, then **revert it**.
- **Parent accounts:** run the server with
  `DEMO_ACCOUNT_EMAILS=demo@student.com,demo@teacher.com,demo@admin.com,it-support@universe.com,test-parent@local.test`.
  Then insert a local user with role `GUARDIAN` and that email (`onboardedAt` set, status `ACTIVE`), and
  use `mock-token-test-parent@local.test`.
- **Guardian share links** (`/guardian/<token>`) need `SESSION_SECRET`: set a throwaway value in the
  environment when starting the dev server.
- Local test data: course CS101 has id `cmulde0g900147d341qn9mxlw`; the demo student is
  `cmulddzpr00007d342mkwhugy`.

## Things to know about the code

- **Parent accounts (role `GUARDIAN`):**
  - They reach **only** the paths in `GUARDIAN_ALLOWED` (`src/server/auth.ts`). It is enforced in
    `getSessionUser` and the core router.
  - Any new parent feature must add its API path there, and get a test in
    `src/server/guardian-accounts.test.ts`.
  - The dashboard layout gives parents a minimal frame and keeps them on `/parent`.
  - The child view is `src/server/guardian-view.ts` + `components/guardian/ChildView.tsx`, shared with the
    guardian link page.
- **Where people land after sign-in:** `homeFor()` in `src/lib/role-home.ts`. Use it, don't hard-code paths.
- **Error messages:** `errorMessage(err, fallback)` in `src/lib/api.ts` works with both `authedJson` and
  the axios-style client.
- **Report cards:** `src/lib/report-card.ts` (maths and printable page), `src/server/report-cards.ts`.
- **Gradebook maths:** `src/lib/gradebook.ts`.

---

## D6 · Group project autopilot: done (13 Oct 2026)

Finished from the other agent's work-in-progress (branch `wip/d6-autopilot`). Details are in the plan's
Progress table (row D6).
- **Migration `0119`** (`group_autopilot_plans`, `group_autopilot_reports`). It is **not** applied to the
  live database by hand: merging to `main` deploys, and the deploy applies it first.
- **Next migration: `0120`.**
- **Code:**
  - `src/server/group-autopilot.ts` (logic, 10 tests in `group-autopilot.test.ts`);
  - `src/app/api/groups/[id]/autopilot/{plan,apply,meeting-slots,reports,nudge}`;
  - `src/components/groups/GroupAutopilot.tsx` (the screen, opened with **Project autopilot** in a
    group's panel);
  - sample-mode handlers in `src/lib/sample/router.ts`.
- **Rules kept:** members only on every endpoint; AI through `spendAi`/`featureOff`, with no names sent;
  in-app notices only; meeting time in the viewer's own time zone; tasks inserted 8 per query.
- **Teacher view (added later the same day):**
  - The plan form has an optional "For which course?" field. That course's teacher sees the project
    on **Course board → Group projects** (a teacher-only tab).
  - Files: `components/groups/CourseGroupProjects.tsx` and `/api/courses/[id]/group-projects`.
- **Automatic weekly reports:** the daily job's `weeklyAutopilotReports` makes each plan's report at
  the end of its week. It tells the group in the app, and tells the teacher when a linked project is
  at risk or off track.

## D7 · Phone clicker for in-person classes: done, first part (13 Oct 2026)

- **Migration `0120`.** Next migration: **`0121`**.
- **Code:**
  - `src/server/classroom.ts` (4 tests);
  - `/api/classroom/*`;
  - `components/live/ClassroomPanel.tsx` (teacher, on the Live class page);
  - `components/live/StudentClassroom.tsx` (student, on the Live class page).
- **How it works:**
  1. The teacher starts the class and projects a code that changes every 30 seconds.
  2. Students scan or type it, which marks them present (or late) in Attendance.
  3. During class they can say "I'm lost" (the teacher sees a meter) and send nameless questions.
  4. The teacher's laptop can take notes, which become the study pack when the class ends.
- **Not done:** AI answers to in-room questions (Whisper TA), and linking an in-person session to a
  running class call.

## D8 · Language-free classroom: done, first part (13 Oct 2026)

- **No migration.** It reuses `text_translations` and `src/server/text-translate.ts`, which gained four
  new kinds: assignment, submission, feedback and material-part.
- **Assignments:** instructions, answers (for the teacher) and feedback (for the student) have
  **Translate · Show original**. Grading always uses the original.
- **Materials:** a **Read** button opens a file as text, in sections, with a switch between the
  original and the reader's language. The teacher can make a file readable if the AI tutor hasn't
  read it yet.
- **Long texts** are translated in sections and joined back together, so nothing is cut off.

## D9 · Reading-level adapter: done (13 Oct 2026)

- **Migration `0121`** (`leveled_texts`). The deploy applies it. Next migration: **`0122`**.
- **What it does:** course materials (in the **Read** view) and assignment instructions can be shown
  **As written**, at **Grade 8** or at **Grade 5**: rewritten by AI in simpler words, with the key words
  explained. It works together with translation (simpler words in the reader's language).
- **Listen** reads the text aloud with the phone's or computer's own voices, so it is free.
- **Teachers** have **Prepare simpler versions** in the Read view: both levels are made once for the
  whole class, so students don't wait.
- **Settings → Appearance → Reading level** sets the level texts open at (saved on that device).
- **Code:** `src/server/reading-level.ts` (API `POST /api/reading-level`), `src/lib/reading-level.ts`,
  `src/lib/use-speech.ts`, `components/shared/ReadingLevel.tsx`, `components/dashboard/MaterialReader.tsx`.
- **Second part (migration `0122`; next migration: `0123`):**
  - Also **feedback**, **announcements** (only when asked) and **quiz questions** (no key words, so they
    can't give answers away). Each quiz has a **Reading help** switch (on by default) for the teacher.
  - **Teachers correct a simpler version** with **Edit** wherever it shows; students then see
    "checked by your teacher". **Use the AI's version** undoes it.
  - **Any page:** Settings → Appearance → **Help with selected text**: select text to listen to it or
    read it in simpler words.
- **Not done:** quiz answer options stay as written.

## D11 · AI viva and oral-exam coach: done, first part (13 Oct 2026)

- **Migration `0123`** (`oral_checks`, `oral_sessions`). Next migration: **`0124`**.
- **Students:** AI tutor → **Oral practice**. Choose a viva, debate, language oral or interview, talk
  with the AI examiner (it asks follow-ups), then get scores for clarity, depth and evidence, with
  quotes from what they said, what went well and what to try next.
- **Teachers:** Course board → **Oral checks**. Set a short oral with a rubric; each student does it
  once; the recording, the transcript and the AI's suggested scores come back; the teacher confirms or
  changes them, and only then does the student see the score. **Let them try again** if it broke off.
- **Code:** `src/lib/oral.ts`, `src/server/oral.ts`, `src/server/live-token.ts`, `src/lib/live-voice.ts`,
  `components/oral/*`, `/student/oral-practice`.
- **Try on the live site:** the voice part needs the AI key, so it couldn't run here.
- **Not done:** confirmed scores into the gradebook; recording the examiner's voice too.


## Fix: quiz access (13 Oct 2026)

- `GET /api/core/quizzes/:id` now gives the whole quiz (with answers) only to the course's teacher and
  admins; other people must be enrolled in the course, never see drafts, and never get answers.
  Before, any signed-in student could read any quiz by its id, and any teacher could see any quiz's
  answers. `GET /api/core/quizzes` now lists only your own courses' quizzes (admins: all).
- Tests: `src/server/services/quizzes.service.test.ts`.

## D12 · Honest AI receipts: done (13 Oct 2026)

- **Migration `0124`** (`ai_uses`, `assignments.aiPolicy`, `assignment_submissions.aiReceipt`). Next
  migration: **`0125`**.
- **Teachers** choose per assignment: AI *free to use*, *allowed with a receipt*, or *not allowed*.
- **Students** hand in with their **AI receipt**: the AI help they used in UniVerse since the
  assignment was set (the tutor, assistant, writing helper…), made by the server from their own
  record, plus a note in their own words. If AI isn't allowed they say so, or attach and explain.
- The record is private (Settings → AI features → Your AI activity) and kept 180 days. Reading help
  (translation, simpler words, listening) isn't recorded.
- **New AI features:** call `logAiUse(user.id, { kind, detail, courseId })` (`src/server/ai-receipts.ts`)
  where the help is given, and add the kind to `AI_USE_KINDS` in `src/lib/ai-receipt.ts`.

## D13 · Wellbeing radar: done (13 Oct 2026)

- **Migration `0125`** (`wellbeing_settings`, `wellbeing_checkins`, `wellbeing_alerts`). Next migration:
  **`0126`**.
- **Students** (Help & support → Wellbeing) turn it on after reading how it works, check in daily, and
  get private nudges from simple rules (no AI): late nights, "I'm lost" in class, missed deadlines, a
  heavy few days, hard days. Teachers never see any of it.
- **Counsellors:** give a staff member a custom role with **"Receive students' wellbeing requests"**
  (Admin → Roles). They get Office → Wellbeing requests. Requests arrive only when a student taps
  "Talk to someone", or, if the student agreed, after a really hard stretch (never their notes).
  If nobody has the permission, requests go to the school admins.
- **Code:** `src/lib/wellbeing.ts`, `src/server/wellbeing.ts`, `/student/wellbeing`, `/admin/wellbeing`.

## D14 · Impact League: done (13 Oct 2026)

- **Migration `0126`** (`league_challenges`, `league_people`, `league_teams`, `league_members`,
  `league_scores`). Next migration: **`0127`**.
- **Where:** a tab **Impact League** (`/impact-league`) next to Impact rooms, for students (Opportunities),
  admins (Impact reports) and teachers (NGO mentorship). Public page: `/league/<slug>`.
- **How it runs:** a teacher or admin starts a draft → adds mentors, judges and sponsors by email →
  **Open for teams** → students form teams (each gets a private group and a milestones board) and hand in
  a project → **Start judging** → judges score on the rubric → organizers give the prizes → **Finish and
  share results** → **Issue credentials** (every finisher gets a signed credential).
- **Safety and privacy:** a team with a student under 18 stays within one university; other students see
  first names and universities only; the public page never shows names; teams choose whether to appear,
  and organizers can hide a team.
- **Demo day** is the call `lg_<challenge>` (organizers host and turn on webinar mode; anyone signed in
  can watch from 15 minutes before).
- **Try on the live site:** issuing credentials with the real signing key (locally a throwaway test key
  was used), and demo day in a real call.
- **Code:** `src/lib/impact-league.ts`, `src/server/impact-league.ts`, `src/components/league/`,
  `src/app/(dashboard)/impact-league/`, `src/app/league/[slug]/`.

## Cold start on Workers Free (measured 14 Oct 2026)

- The first request on a fresh Worker loads the whole Next.js server bundle (~30 MB:
  11.5 MB route files, 9.4 MB shared chunks, 6 MB inlined manifests) and costs ~2–3 s CPU locally
  (`wrangler dev --inspector-port 9229` + a CPU profile). Startup itself is ~60 ms. Making the inlined
  manifests lazy saved only ~0.15 s, so it wasn't kept.
- Requests answered by `cloudflare/fast-api.ts` never load Next.js. Added there (in
  `cloudflare/fast-lists.ts` from the second one): **`GET /api/boards`**, **`/api/docs`**, **`/api/spaces`**,
  **`/api/core/dashboard/admin`** and **`/api/core/dashboard/teacher`** (also inside `/api/bootstrap`).
  Each was checked field by field against its Next.js route for 5 accounts (student, teacher, admin,
  a teacher with nothing, a parent), with shared docs, 3-level sub-pages, class and group docs, pending
  sign-ups and a 7-member board (`next dev` on :3100 vs the built Worker in `wrangler dev` on :8787).
- Then (third commit): **`GET /api/student/overview`** (the student home, also inside `/api/bootstrap`)
  and the **"app opened" sign-in record** (`session: true` in `/api/bootstrap`, one SQL statement that
  keeps the 30-minute rule). Opening the app as a student, teacher or admin no longer touches Next.js at
  all; parents still do for `/api/parent/children`.
- **Copies that had drifted** (found by comparing every light-path answer again, fixed): `/api/me` lacked
  `noRecording` (B7.6 call recording), `/api/core/users/me` lacked teachers' staff-role `permissions`
  (B15.6, so those areas could stay hidden) and the student exchange fields (Upgrade 9), and the chat list
  and chat thread lacked `private` (B7.6 private chats). Lists cut at a limit now sort like Prisma (it
  adds `ORDER BY id` when there's a limit and no order), and "latest 5" lists use Prisma's query shape so
  rows with equal times come in the same order. Parent accounts are refused on chat calls exactly as the
  Next.js routes refuse them.
- **Cloudflare's location info never reached the Next.js routes** (`request.cf` is dropped on the way in).
  So study-streak days were UTC days instead of the student's own, and sign-in history never had a city.
  `src/server/request-cf.ts` now reads it from the Worker's context; both paths use the student's time
  zone and record the city. A student far from UTC may see one odd day in the streak week once.
- **Any change to one of those Next.js routes must be made in its light-path copy too**, then run
  `node scripts/light-path-parity.mjs` (instructions at its top) with tricky data in the local database.
- **Every API route now runs without Next.js (`cloudflare/api-direct.ts`, 14 Oct).** Measured: on a
  fresh Worker the first request that needs Next.js parses its whole 32 MB bundle (one giant function
  once bundled; 2.4 s of the 3.8 s CPU in a local profile). An API route only needs its own code (all
  434 together are 3.6 MB), so the Worker runs `src/app/api/**/route.ts` handlers itself, inside
  OpenNext's request context: same routes and match order (`cloudflare/api-routes.gen.ts`, written by
  `scripts/gen-api-routes.mjs` with Next.js's own sorting and patterns), same param decoding, same
  `next.config.ts` headers plus Next's `Vary`, same `NEXT_PUBLIC_` values (captured during the build
  into `cloudflare/next-public.gen.ts`). Order per API request: light path (SQL) → direct → Next.js
  (for methods a route doesn't export, HEAD/OPTIONS, trailing "/", undecodable params, unknown routes).
  The scheduled jobs (`/api/cron/*`) and the app-open bundle's fallback use it too.
  - Cold API call locally: 0.36–0.5 s instead of 2.5–3.6 s; 3 cold calls under the profiler 0.56 s CPU
    instead of 3.8 s. A parent opening the app: 0.46 s, Next.js never loaded.
  - Checked: 169 parameter-free GET routes × 5 accounts and 57 routes with real ids, field by field
    against `next dev` (1,085 same; every difference was a "now" timestamp, a side effect of the first
    call, or the dev server's throwaway signing key), headers against the built Next.js, writes (create,
    rename, delete a doc; upload and download; demo admin refused; 405 for PUT), the page crawler as
    student/teacher/admin on the built Worker (same results as on Next.js), home pages at 390 px light
    and dark with axe, the light-path comparison.
  - **New or removed API route:** run `node scripts/gen-api-routes.mjs` (the build does it anyway;
    `src/lib/api-routes.test.ts` fails when the table is stale and checks the matcher against Next.js's
    for every route). Testing locally: start `wrangler dev` with `NODE_ENV=production`, as deployed.
  - (Oct 2026: since 4 Sept 2026 Cloudflare only checks 64 MiB uncompressed, on every plan; the
    upload was ~43 MiB uncompressed, 9.8 MB gzipped. The compressed 3 MB / 10 MB limits are gone.)
  - Upload size is now ~8.0 MB gzipped (was 7.1). Cloudflare documents 3 MB (free) and 10 MB (paid);
    deploys have been succeeding above 3 MB.
- **Pages:** the 171 pages built ahead of time, and in-app navigation to them, are served from the
  cache without Next.js (OpenNext cache interception, filled by `opennextjs-cloudflare deploy`;
  locally run `npx opennextjs-cloudflare populateCache local` first or every page looks slow). The 28
  pages rendered per request (a doc, a board, a course…) still start Next.js on a fresh Worker.
- The real fix is still **Workers Paid** ($5/month, 30 s CPU); with the above, a fresh Worker only
  starts Next.js for those 28 pages.
- **Fixed (14 Oct): Admin → Integrations → Developer and OneRoster answered 500.** Migrations `0111`/`0112`
  made `oneroster_syncs`, `oneroster_mappings`, `api_keys`, `webhook_endpoints` and `webhook_deliveries` with
  snake_case columns (`key_prefix`, `organization_id`…) while the models used camelCase without `@map`
  ("no such column: api_keys.keyPrefix"), so API keys, webhooks and OneRoster sync never worked on the live
  site. The 30 fields now have `@map` to the real columns (no database change, no migration). Checked:
  creating a key, the public API with it (scope refused, last use recorded), revoking; creating, pausing and
  test-sending a webhook; OneRoster preview, sync and history (a second sync reuses the mapping); both pages
  at 390 px light and dark with axe. **`src/server/schema-columns.test.ts`** applies every migration to an
  in-memory database and checks each model against its table, so this can't happen again unnoticed.
- **Fixed (14 Oct): pages that never worked.** Scholarships (student), peer tutoring and Revision Reels
  (student and teacher) used a bare `fetch` with no sign-in token, so every call answered 401: they use
  `authedFetch` now. Settings → Consents and the public Trust page passed full `/api/...` addresses to the
  core client (`/api/core/api/...`, 404), and **the DPDP grievance form posted to a route that never
  existed**: they use `authedJson` on the real routes. Revision Reels with no class chosen asked for a course
  called "sample": it now lists the latest from my classes (`GET /api/micro-lessons`, sample stub added).
  **Security:** micro-lessons ignored `courseAccess`'s answer (it returns null, it doesn't throw), so any
  signed-in person could read any class's micro-lessons and make them again; now only the class's teacher,
  its students and admins see them, and only the teacher or an admin remakes a pack. Recording a reel view
  looked the lesson up by the wrong id (always 404). Career: companies without a logo showed a
  ui-avatars.com image (a third-party request with the company's name); they show initials now. A student
  opening /parent goes to their own home instead of "Couldn't load". **`src/lib/core-api-calls.test.ts`**
  checks every core-client call in the app against `src/server/app.ts`'s routes.
- **Fixed (14 Oct, owner report): "Meet" showed Cloudflare's "Error 1101 · Worker threw exception".**
  `/call/<id>` was one of the pages rendered per request, so on a fresh Worker opening a call started the
  whole Next.js server (~1 s of CPU against Workers Free's 10 ms) and Cloudflare stopped it. The call page
  is now built ahead of time once, as `/call/open` (`generateStaticParams`), reads the call id from the
  address (`src/app/call/[id]/CallOpener.tsx`), and the Worker answers every `/call/<id>` (pages and
  in-app navigation) with that built page from the cache (`CALL_PAGE` in `cloudflare/worker.ts`).
  Measured on the built Worker: a fresh `/call/…` 0.05–0.17 s (a server-rendered page right after it still
  takes ~2.2 s, so Next.js wasn't started); Groups → Meet and a direct `/call/…?kind=audio` link open the
  call at 390 and 1280 px. **The other ~27 pages rendered per request** (a doc, a board, a course, a guest
  link, a hall…) can still hit this on a fresh Worker until the owner moves to Workers Paid; the same trick
  works for any page that only needs its id in the browser.
- **Calendar links and parent links need `SESSION_SECRET`** (not only LMS sign-in, as the setup notes said;
  fixed in `DEPLOY-CLOUDFLARE.md` and Admin → Server settings). Without it the calendar card says links
  aren't available.

## D18 · Skills-to-jobs bridge: done (14 Oct 2026)

- **No migration, no AI.** Next migration is still **`0129`**.
- **Where:** Internships has two tabs now, **Openings** and **Skills match** (`/student/internships/match`).
  Each open internship and NGO project shows how many of its skills the student's checked work covers
  ("You match 4 of 5 skills; finish ‘SQL basics’ in CS201 to match all."), and links each missing skill
  to a module of one of their classes, a class they could join (My choices) or a peer tutor.
- **Only checked skills count:** the passport's evidence (graded work at 60%+, passed quizzes, verified
  volunteering and credentials). Skills a student typed on their own don't, so the match means something.
- **Openings need their skills listed** (Internship `skills`, NGO project `skillsRequired`); those with none
  don't appear. Worth telling admins and NGO partners when they post.
- **Code:** `src/lib/skills-bridge.ts` (matching, sentences, order; tested), `src/server/skills-bridge.ts`,
  `src/app/api/internships/skills-match/`, `src/app/(dashboard)/student/internships/match/`.
- **Also fixed:** the notification bell's spoken name now says what its badge shows ("9+").
- The full-site page crawl (re-checking the page fixes above) was stopped part-way: on `next dev` it takes
  over an hour and ran the dev server out of memory. The fixed pages had each been checked on their own.

## D17 · Offline classroom relay: done as moving QR codes (14 Oct 2026, owner's choice)

- **No migration.** New library **jsQR** (reads QR codes on phones without a built-in reader).
- **Why not phone-to-phone:** WebRTC over a classroom hotspot isn't reliable (handshakes need QR swaps per
  student with no internet, many networks block devices from talking to each other). The owner picked
  **moving QR codes** for short items.
- **Teacher:** Live class → **Send to phones with no internet**: a note, an announcement or a quiz without
  pictures → **Show as codes** (full screen; speed, code size, pause). Prepared items stay ready on that
  computer, so they can be shown in a room with no connection.
- **Students:** Offline courses → **Scan from the teacher’s screen**. The phone needs no internet. Each item
  is **signed** with the platform key (`CREDENTIAL_SIGNING_PRIVATE_KEY`, the same as credentials and badges),
  so the phone shows "Checked: sent by <teacher>". A quiz is taken with the existing offline quiz and sent
  when the phone is next online.
- **Before class, once:** students open Offline courses while online (that saves the scanner and the
  school's key on the phone).
- **Not tried yet:** real phones, a real projector, iPhones. Worth a try in one classroom.
- **Also fixed:** the "You're offline" bar was hard to read (white on orange); the phone header's Home link
  name.
- **Code:** `src/lib/qr-relay.ts`, `src/lib/qr.ts`, `src/server/qr-relay.ts`, `src/app/api/classroom/relay/`,
  `src/components/live/QrRelayPanel.tsx`, `src/components/offline/QrRelayScan.tsx`, `QrRelayCamera.tsx`.

## D16 · Parent co-pilot: done (14 Oct 2026)

- **Migration `0128`** (`parent_copilot`, `parent_summaries`, `parent_questions`). Next migration: **`0129`**.
- **Where:** the parent app's Schoolwork tab starts with **“<child>’s week”**: the summary in the parent's
  language (Listen reads it with the phone's own voice), **Ask about <child>**, and the weekly
  notification's day and time. Teachers' voice notes in Messages are written out and translated.
- **Only records, never messages:** summaries and answers use grades, attendance, work due and late,
  achievements and report cards. The AI is told to say when the records don't cover a question.
- **Costs:** one AI request per child per week for the summary (Update at most daily), one per new
  question (10 a day), one per voice note; all from the parent's daily AI allowance. Weekly
  notifications are in the app and by push, never email.
- **Try on the live site:** AI summary, answers and voice-note transcription (no AI key locally).
- **Code:** `src/lib/parent-copilot.ts`, `src/server/parent-copilot.ts`, `src/server/parent-messages.ts`,
  `src/components/guardian/ParentCopilot.tsx`, `src/app/api/parent/week/`.

## D15 · Classroom twin (live campus map): done (14 Oct 2026)

- **Migration `0127`** (`campus_buildings`; `rooms.buildingId`, `rooms.floor`; `campus_items.buildingId`).
  Next migration: **`0128`**.
- **Where:** `/campus-map`, a tab of Student life (students), Campus services (teachers, next to Room
  booking) and Campus monitoring (admins).
- **First step on the live site:** an admin opens Campus monitoring → Campus map → **Edit map**, adds the
  buildings, drags them into place and puts each room in its building and floor. Until then the page
  still shows free rooms, what's on now and the next class.
- **Where "live" comes from:** the class timetable and room bookings (today, on the device's clock),
  in-person class check-ins (phone clicker), scheduled online class calls and campus events. There are
  no sensors: a room with nothing booked shows as free.
- **Privacy:** others' bookings show only as "Booked"; online classes are listed only for the people in them.
- **Code:** `src/lib/campus-map.ts`, `src/server/campus-map.ts`, `src/components/campus/`,
  `src/app/(dashboard)/campus-map/`, `src/app/api/campus/map/`.

## Live errors from Cloudflare Observability (checked 13 Oct 2026)

- **"scheduled-call check failed … D1_ERROR: too many terms in compound SELECT"**: the 15-minute
  cron's check joined 7 queries with UNION ALL, but **D1 allows at most 5 parts in a compound SELECT**
  (local SQLite allows 500, so tests never showed it). On the live site it failed on every run, so
  the reminders job (call and parent-meeting reminders, `/remind`, scheduled chat messages, morning
  brief pushes, study-plan follow-ups, due-soon automations) never started from this cron. **Fixed
  (14 Oct):** 7 small queries sent in one `DB.batch` (`cloudflare/due-check.ts`, 4 tests; each query
  checked against the real schema). A real passing D1 error is still tried twice more and then the
  job runs anyway. Never write a compound SELECT with more than 5 parts for D1.
- **"Worker exceeded CPU time limit"** on `GET /api/core/users/me` (a burst around 16:42–16:57 UTC):
  the known Workers Free cold start (see "Cloudflare errors" above). That route is already on the
  light path; it fails when another request on the same fresh instance goes over the limit and
  Cloudflare stops the instance. The logs showed the app's one retry failing too, so **reads now get
  a second retry 2–3 s later** (`fetchWithRetry`, 3 tests). The real fix is still **Workers Paid**
  ($5/month, the owner's decision).

## Converter fix, Compress files and the Tools page (14 Oct 2026, owner request)

- **Word → PDF now downloads a real PDF** laid out like the document (it used to open the print dialog
  with a simplified copy). Code: `src/components/docs/doc-to-pdf.ts` (docx-preview → page splitting →
  html2canvas-pro → pdf-lib with an invisible text layer).
- **Compress files**: pictures, PDFs, Word/Excel/PowerPoint, video and sound, anything else as ZIP;
  Light / Medium / Strong. Code: `src/lib/compress.ts`, `src/components/docs/compress-engine.ts`.
- **Collaborate → Tools** (was Studio, same address `/studio`): six cards; `?tool=convert|compress|photo|audio`.
- mediabunny brings DOM types for WebCodecs; `src/lib/call-recorder.ts` needed one type annotation.

### Photo editor: simple mode (14 Oct 2026, owner request)

- The photo editor opens in **simple mode**: one row of jobs under the photo (Crop, Turn, Adjust, Looks,
  Text, Draw, Background, Add photo); each opens only its own controls and a Done button. **All tools**
  in the top bar switches to the full editor (unchanged); the choice is kept in localStorage
  (`studio-photo-mode`). Code: `src/components/studio/PhotoSimple.tsx`, wired in `PhotoEditor.tsx`.
- Simple mode draws on one "Drawing" layer (`drawId`), so its eraser never touches the photo.
- `commitRun(key, doc)` in `PhotoEditor.tsx` makes changes to one thing in a row one undo step.


## M6 · Code boxes (OtpInput)

- `<OtpInput value onChange onComplete status onSettled />`: the parent sets `status` to `checking`
  when it sends the code, then `good` or `bad`; `onSettled` fires once the animation has played
  (go on after `good`; clear the code and set `idle` after `bad`). One real input over the boxes,
  `autocomplete="one-time-code"`. The ring stays at least ~1 s however fast the answer comes.
- Workers: never await a promise another request started (Cloudflare cancels it as "code had
  hung"); `getPrisma()` gives each request its own client, and module caches keep finished values only.

## M7 · Two tones, folders, Explain UniVerse

- Keep the two tones (owner, 23 Oct): `.ambient-bg` glows, tinted `.glass-sidebar`/bars, the gradient
  `.btn-primary` and selection. Never black-and-white "ink" for them again.
- `FolderCard`'s tone class is `folder-tone-*`: never reuse a class name an inner part uses
  (`folder-art` collided and made cards absolutely positioned). No filter/backdrop-filter in folders.
- Whiteboard templates: give a note's label its own `strokeColor` (it defaults to the container's).
  Box text doesn't wrap by itself: `wrap()` in `universe-guide.ts`.

## M8 · Landing page

- Sections in `src/components/landing/`; claims must be true of the product (no made-up usage numbers,
  quotes or status). Prices come from `src/lib/plans.ts`.
- The landing `main` is `data-no-motion`: constantly changing parts (typing, ticking runs) would keep
  waking the site-wide reveals, which then hid whole sections.

## M9 · The river of light

- `LightTrail` (canvas) follows the scrolling element it hears scroll events from (capture phase):
  the window or a panel at least half the screen tall, never one inside `aside`/`nav`/dialogs.
  The landing page renders its own (`tone="dark" from={0.9} strength={0.72}`); the root one skips `/`.
- Keep it cheap: ≤30 fps, ~2.6 M canvas pixels at most, still for Reduce Motion / low-memory phones,
  nothing while the tab is hidden. Dark cards are 93% opaque, so it glows through without any blur.

## M11 · Light that answers people

- Edge beam: `.beam` / `.beam-once` draw on `::after` (a masked conic ring, `@property --beam`).
  `beamOn` skips a card already using `::after`; a static card is made `relative` only while the beam
  shows and only if it has no absolutely positioned parts. Don't give cards their own `::after` and
  expect the beam too.
- Sparks: `.btn-primary` or `[data-spark]`; nothing under `[data-no-motion]`.
- The owner's guide board: `GUIDE_TITLE` / `guideHref` in `src/components/boards/guide-title.ts` (small
  on purpose: importing `universe-guide.ts` pulls the whole board into a bundle).

## M12 · Lean code and the launch list

- `pnpm lean` (`scripts/lean.mjs`, also run by `pnpm check`): files under `src/` nothing imports, and
  `href` / `push` / `replace` / `redirect` literals that match no page. A file used only from config
  goes in `BY_CONFIG` (now: `src/server/test-setup.ts` for vitest, `src/worker/index.ts` for next-pwa).
- Cookie choice: `src/lib/cookie-consent.ts` (`localStorage` `uv-cookies` = `all` | `essential`, the
  `uv-cookies` event when it changes). The notice (`CookieNotice.tsx`, in the marketing footer) asks
  once; Privacy choices has `CookieChoiceControl` to change it. Only essential cookies exist today:
  anything optional added later (analytics, ads, embeds) must start only when
  `optionalCookiesAllowed()` is true (false with Global Privacy Control) and stop on the event.
- App pages set the tab title from the Topbar title (`<title> | UniVerse Impact`).
- Button gradient: `#4f46e5 → #7c3aed → #9333ea` (the lighter ends failed contrast with white text).

## M13 · Flow card, the console deck, sign-in, the packed board

- Flow card: `src/components/landing/FlowCard.tsx` takes a flow id from `flows.ts` (a name, so server
  layouts can pass it; `compact` hides the written steps). Its lines are drawn in the box's real
  pixels (ResizeObserver): with a stretched viewBox and `non-scaling-stroke`, `pathLength` dashes
  don't cover the line. Same reason the console's line chart wipes in with `clip-path` instead.
- Console: tabs, labels, icons and groups live in `console/deck.tsx` (`TABS`, `GROUPS`); a new section
  goes in `T` and one group. `Ticker` rolls a number from what it showed. `card` (shared.tsx) carries
  `.deck-card` (a background-image top edge in `@layer components`, so utilities still win).
- The console page keeps a linked tab in `linked` until it's open (the address effect used to write
  "overview" over `?tab=` on the first render).
- Sign-in: `(auth)/layout.tsx` draws its own dark river (`LightTrail` skips the root one on `/login`
  and `/register`, like `/`).
- Explainer board: `guideElements()` packs bands (`bands`); a column may hold two frames. Frames are
  scaled with `place()`; keep new sections roughly the same proportions as their band neighbours.
- Previewing the owner console on the dev server: sign in as the demo admin, set `owner: true` in the
  stored user, answer `/api/bootstrap` with 503 and add `owner: true` to `/users/me` (route
  interception), and serve sample `/owner/overview`, `/owner/attention`, `/owner/tables`.

## M14 · The full board, boards list, design skills, agent toolkit

- Board data: `scripts/gen-guide-data.mjs` writes `src/components/boards/guide-data.gen.ts` from the
  route tables, `src/server/owner-schema.json`, `prisma/migrations`, `src/lib/i18n.ts`, test files
  and package.json (the build runs it after gen-api-routes; `--check` says if it's stale). Never
  import `cloudflare/api-routes.gen.ts` or `owner-schema.json` into client code: the first pulls every
  server route into the bundle, the second is 900 KB.
- The guide loads on demand (`templateFor` in templates.ts); BoardCanvas fills the empty board when
  it arrives, unless someone drew meanwhile. Live rooms take messages up to 32 MiB (Cloudflare,
  Oct 2025), and a board up to 20,000 shapes (BoardRoom).
- Board layout: curated bands, then `packed()` for the long lists (tallest first, an even share per
  band). Keep each new list frame's columns about 30 lines (`listing`).
- `guide-ui.mjs` loads the board through `npx tsx` (the board file imports other files now).
- Boards list: Rename uses `PATCH /api/boards/:id` (editors and the owner of the board); the guide
  board keeps working when renamed, it just stops being found as "UniVerse explained".
- Outside tools: `AGENT-TOOLKIT.md` (repo root). Emil Kowalski's skills in `.claude/skills/` are
  copies (MIT): update by copying the folders again.

## M15 · Simpler sign-in, the board arrives by itself

- Turning phone sign-in back on: set `PHONE_SIGN_IN = true` in `src/lib/sign-in-options.ts`, only
  after the owner turns on Firebase billing (SMS codes cost money).
- The passkey button asks `GET /api/core/auth/passkeys/available` (public); it's off while
  `SESSION_SECRET` is missing on the Worker.
- Changing the explainer board's design: raise `GUIDE_VERSION` in `src/components/boards/guide-title.ts`.
  The owner's boards list then renames the old board "(old)" and makes the new one once per device;
  nothing is deleted.
- Fresh cloud container: run `npx prisma generate` before `pnpm check` (otherwise hundreds of
  `@prisma/client` type errors), and `NODE_OPTIONS=--max-old-space-size=8192` if the type check runs
  out of memory.

## M16 · The explainer board fills in full

- The guide's shapes keep their ids (`convertToExcalidrawElements(els, { regenerateIds: false })`
  for the guide only): never generate them randomly, or topping up stops working. Box labels still
  get random ids; `guideTopUp` treats a label as part of its box.
- Opening the guide (`?template=guide`) on a board that has `g<version>-` shapes runs `guideTopUp`;
  a board of an older design (other prefix) is left alone and replaced through `GUIDE_VERSION`.
- Testing the board without the Worker: bundle `universe-guide.ts` with Excalidraw using the
  esbuild in `node_modules/.pnpm/esbuild@*/` and convert it in Chromium (text sizes need a browser).

## M17 · Bigger board, Messages redesign, Collaborate Home, the owner's colours

- **Colours (final, 24 Oct):** dark blue is the normal UI colour (dark-mode page #11212D, cards
  #1B2C39, the navy side menu in both themes via the `dark` class on the `<aside>` in `Sidebar.tsx`,
  dark-blue buttons and selections); hot pink with a little purple (Tailwind's own `pink-*` /
  `fuchsia-*`) only for light: the light river (`LightTrail.tsx`), glows, rings and animations.
  `indigo/violet/purple-*` are the dark blues in `@theme`. A mauve (#6B5560) version before it was
  rejected as dull. Hard-coded colours in new code: lower-case hex (some tests compare strings).
- Text colours in light mode are pinned for contrast (`:where(html:not(.dark)) … .text-pink-500 {
  color: #be185d }` and friends near the top of `globals.css`); in dark mode the 400 shades are
  lifted. Check new screens with axe in both themes.
- Send effects travel in a message's `metadata.effect`, silent sends in `metadata.silent` (the
  messages route reads them with `effectOf`; `chat-notify.ts` skips pushes for silent ones).
- Collaborate pins live in `users.collabPins` (JSON list, migration 0176); the next migration is 0177.
- The board's text needs its fonts loaded before converting (`fontsFor()` in `BoardCanvas.tsx`);
  anything that converts Excalidraw shapes should go through it.

## M18 · Instrument boards (the owner's "Instrumental" video), owner console live board

- The owner sent a screen recording of a monitoring board (moxen.studio "Instrumental") and asked
  for that look wherever there are analytics, above all in the owner console. Kit:
  `src/components/instruments/{Board,parts}.tsx`, maths `src/lib/instruments.ts` (+ tests), styles
  `.ins-*` at the end of `globals.css` (Reduce Motion stops them).
- Where it is: owner console Overview (`console/live.tsx`, "UniVerse live", nine cells from
  `GET /owner/pulse?range=1h|24h|7d`, refreshed every 30 s), console Analytics (board with 7/30/90
  days), Speed (dials per Web Vital), Health numbers ("Health at a glance"), the shared `Tiles` and
  `Bars` (Money, Schools), Admin → Analytics ("Your school, live"), the course analytics page,
  the teacher dashboard's two charts and school analytics' line charts (`MetricChart`).
- `pulse.ts` adds everything up in SQL from `api_timings` (1-in-20 sample, weight 20; every 5xx with
  weight 1), `messages`, `ui_events`, `login_events`, `error_reports`, `ai_usage` and the usage guard.
  Text dates are bucketed with `strftime('%s', …)` (Prisma stores D1 dates as ISO text).
- The owner asked to remove "Needs your attention" from the console Overview (the header's "needs
  you" badge and the tab counts stay); `AttentionCard` was deleted.
- Also fixed: the side menu's icons were dark blue on navy in light mode (`--color-tint-text`
  resolved once on `<html>`; `.dark, .on-dark` now re-resolve the theme colours), and the sign-in
  pages' blocked Google ping (`apis.google.com` in `connect-src`).

## M19 · UniVerse Trace: every product gets a passport

- The owner asked to turn the project into "something unique and different and bold" in supply chain
  and marketing, using the existing features. Trace reuses them: signed codes and public check pages
  (like credentials), the hash-chained Impact Credits ledger for shop points, GPS/country checks (like
  shift check-ins), the instrument boards for the brand's live view, the landing and the menus.
- Data: migration 0177 (`trace_products`, `trace_batches` with `codeKey` + `secret`, `trace_codes`
  created on first scan, `trace_scans`, `trace_events`). Next migration: 0178.
- API (`src/server/modules/trace.ts`, `/api/core/trace/*`): `POST scan/:code` (public; `again: true`
  from a browser that already scanned it records nothing), `POST scan/:code/claim`, `GET me`; admins:
  `overview`, `products`, `products/:id/batches`, `batches/:id`, `batches/:id/codes` (computed, 1,000
  a page), `batches/:id/events`, `codes/:code/flag`, `demo`.
- Pages: `/trace` (brand console for admins and the owner; "Scan & earn" with points for everyone
  else), `/trace/print?batch=` (labels and a CSV for label printers), `/t/[code]` (the passport; built
  as `/t/open`, like `/verify/[id]`). `/p/[handle]` is the skills passport, not this.
- The demo admin is read-only (`demoWriteBlocked`), so creating products needs a real admin.
- Landing: the hero is now "Every product gets a passport." with an animated passport phone
  (`components/landing/PassportCard.tsx`) and a Trace section; the school sections follow.

## M20 · Trace network, live maps and business mode

- The owner chose all four ideas ("do all 4 of them… make the live map in detail like very detail with
  animations, transitions… ultra smooth"), then a "2d real time product tracking map", then "remove the
  school related features and change it into the new one" (keep Collaborate, Messages, owner console).
- Data: migration 0178 (`trace_brands`, `trace_brand_members`, `trace_points`, `trace_cashouts`,
  `trace_campaigns`, `trace_pings`; `brandId` on every trace table; `sample` on products; scans keep
  `productId`, `category`, `geoLat/geoLng` from Cloudflare; batches get `status`, a destination and a
  `carrierKey`). Next migration: 0179.
- Server: `trace.ts` (brands, plans: FREE 10,000 units, PRO a million and the category market;
  the owner counts as PRO), `trace-wallet.ts` (points per brand, hash chain, cash-outs; a refused one
  refunds), `trace-campaigns.ts` (area = country or circle; fee 5 cents a campaign scan), `trace-map.ts`
  (market map, live scans, tracking with a simulated glide for sample shipments, the driver link
  `/carry/<key>`: public ping every ≥5 s and stops), `trace-demo.ts` (sample brand data: 3 shipments,
  ~870 scans in 28 cities, a Paris campaign; all hangs off the `sample` product, so deleting it
  removes everything).
- Pages: `/trace` (start a brand free, or the console with plan, settings, products, scans, copies),
  `/trace/map` (market map), `/trace/tracking` (live tracking), `/trace/campaigns` (campaigns and
  cash-out requests), `/trace/wallet` (everyone), `/trace/brands` (owner: plans), `/carry/[key]`
  (driver, built as `/carry/open`). Tabs: `components/trace/TraceTabs.tsx`.
- Maps: `components/trace/map/engine.ts` (projection, fit, zoom, glow sprites), `WorldCanvas.tsx`
  (the engine class: drag with inertia, wheel and pinch zoom easing to a target, fly-to with a lift,
  keyboard, 110m → 50m outlines when zoomed in, country and city names, scale bar, `interactive=false`
  for the landing), `MarketMap.tsx` (glows, 11 km squares close in, flows, replay timeline, live and
  sample ripples, city panel, PRO tiles and "where you're missing"), `TrackingMap.tsx` (roads done,
  live trail, dashed road ahead, gliding markers with heading, destination picked on the map, QR
  driver link). City names: `map/cities.ts`.
- Business mode: `src/lib/business.ts` (+ tests): one menu (`Sidebar.tsx`), phone tabs (`app-tabs.ts`),
  tour, quick create and search actions; `homeFor` → `/trace`; the dashboard layout redirects school
  pages; sign-up without roles (role STUDENT, account INDEPENDENT: no approval); landing sections
  `components/landing/Business.tsx` with the live map showcase; the removed landing sections (Proof,
  Glue, Bento, Statement) were school-only. The school code stays in the repo, unreachable.
- Checked: unit tests, `pnpm check`, live API runs on the dev server (brand, sample, maps, tracking
  pings, scan + claim with a campaign bonus, wallet chain, cash-out and refusal with refund, 403 for a
  non-owner), screenshots of both maps in light and dark, the driver page and the landing.


## M21 · UniVerse Impact: the hub, Relief and Green, Trace's second wave, sample data

- The owner asked for "at least 10 more unique features… add back the sample data mode… a lot of
  [fake] data in the owner console", then "a lot of different mini software or website in the main
  website like my old website for school… and the universe trace… and add more other types… where
  they create a impact", then "on a main website put the uni-versity and universe trace tab where user
  can switch to where they want to login". This replaces M20's business mode: the school platform is
  back in full as the **UniVersity** app.
- **The hub:** `src/lib/apps.ts` (APPS, `appFor`, `appHome`, `inboxFor`, + tests), `Sidebar.tsx`
  (`navFor`, the app switcher, remembered in localStorage `uv-last-app`), `app-tabs.ts`
  (`tabsForRole(role, path)`), `/hub` (`GET /hub`, `src/server/hub.ts`), `homeFor(user, app)` and
  `chosenApp()` in `role-home.ts`, `useChosenApp` / `setChosenApp` (`src/lib/chosen-app.ts`). Landing:
  app tabs in the hero (`components/landing/AppTabs.tsx`), a hero and sections per app
  (`ImpactApps.tsx` for Relief and Green), the Proof/Glue/Bento/Statement school sections back; sign-in
  and sign-up carry the tab (`?app=`); sign-up shows the role picker only for UniVersity.
  `src/lib/business.ts` is gone.
- **Relief** (migration 0180, `relief_posts`; `src/server/relief.ts`, `components/relief/ReliefApp.tsx`,
  `/relief`, `/relief/mine`): needs and offers on one live map, "I can help", give back, delivered;
  positions rounded to ~500 m; 30 days shown. **Green** (`green_teams`, `green_members`,
  `green_actions`; `src/server/green.ts`, `components/green/GreenApp.tsx`, `/green`, `/green/teams`):
  actions with their CO₂ (`src/lib/green.ts` factors), streak, badges, the weekly challenge, teams by
  code, leaderboards, a 0.1° map. Next migration: **0181**.
- **Trace, second wave** (migration 0179, `src/server/trace-plus.ts` + tests): recalls (red on every
  passport of the batch), blocked (stolen) batches, grey-market countries per batch (`diverted` on the
  scan), instant wins decided by the batch secret (claim code shown once; handed over on the Radar),
  warranty registration, one review per unit, an ownership vault with transfer codes (`/trace/vault`),
  shop tiers (Bronze/Silver ×1.25/Gold ×1.5 on claim), cold chain (`maxTempC`, the driver types the
  temperature on `/carry/<key>`, tracking and the Radar show warm readings). Pages: `/trace/radar`,
  `/trace/insights` (14-day forecast, busiest hours, CO₂ per shipment, reviews, best shops, trust
  score), `/trace/vault`, public brand page `/b/<slug>` (built as `/b/open`). Console: a settings
  panel per product (prize odds, temperature, weight) and a shield per batch (markets, block, recall).
- **Sample data:** the owner console Overview has **Fill with sample data / Remove sample data**
  (`src/server/sample-world.ts`, `POST /owner/sample-world/step/:n`, `/clear`; 22 steps, a few queries
  each; ~300 people, 13,000 activity rows, 1,200 messages, 20 brands, ~6,200 scans with copies and grey
  market, reviews, prizes, warranties, 420 points, 320 Relief posts, 1,800 Green actions). Visitors get
  **Try the live demo** on the landing hero and the sign-in page (`startVisitorDemo` in
  `components/SampleMode.tsx`): a made-up person in this tab, every page answered from
  `src/lib/sample/router.ts` + `impact.ts`, nothing sent to the server, Exit clears it.
- Also: `trace-owner.ts` had two `countries` keys (the count is now `countryCount`).
- Tools the owner asked for: Impeccable and Ponytail skills in `.claude/skills/` (no hooks), REA with
  Ghidra set up on the machine (`tools/setup-rea.sh`); see `AGENT-TOOLKIT.md`.
- Checked: `pnpm check` (1,292 tests, lint 0 errors, lean clean), the sample fill and removal against
  the local database, live API runs (Relief, Green, hub, scan + review + warranty + duplicate refusals,
  an instant win and a recall on a real code), screenshots of the hub, every app, Radar, Insights, the
  vault, the passport and the brand page, and the visitor demo end to end.

## M22 · Relief alerts, real temperature sensors, the live errors fixed

- The owner (25 Oct 2026): "notifications for Relief helpers, and real temperature sensors… there is a
  error [the Firebase email]… check if there are more bugs".
- **Relief notifications** (`src/server/relief.ts`, type `relief`, a new "Relief, Green and Trace"
  group in `src/lib/notify-prefs.ts`): the person who asked hears when a helper takes, gives back or
  delivers their request (in the app, email if on, push); the helper hears when the person marks it
  delivered. **Nearby alerts**: migration 0181 `relief_watches` (one per person: a place rounded to
  500 m, 1–25 km, urgent only by default, kinds); `alertWatchers` runs after a new need (box query,
  then exact distance; at most 80 people, push + in-app, no email). Card "Tell me about needs near
  me" on `/relief/mine`; alert links open `/relief?post=<id>` with the post chosen. Test:
  `src/server/relief.test.ts`.
- **Temperature sensors** (migration 0182 `trace_readings`, `trace_batches.coldAlertAt`): a
  Bluetooth thermometer paired on the driver page (`src/lib/ble-thermometer.ts`: Environmental
  Sensing 0x181A and Health Thermometer 0x1809, decoders tested; Chrome on Android/desktop only), or a
  logger/gateway posting `POST /api/core/trace/carry/<key>/reading { tempC, humidity? }` (the
  shipment's private link is the key; one per 20 s), or the driver typing it (stored as MANUAL with
  the position). A warm reading tells the brand's team at most once an hour per shipment
  (`recordReading` in `trace-map.ts`, claimed with a conditional update). Tracking shows the source
  and a 24-hour line; the Radar's "warm shipments" read `trace_readings`. The sensor address is under
  "Connect a temperature sensor" next to the driver link. Next migration: **0183**.
- **Live errors fixed** (from the production `error_reports`):
  - "INTERNAL ASSERTION FAILED: Pending promise was never set" (iPhone Safari, /login): Firebase's own
    pop-up glitch. All pop-up sign-ins go through `popupSignIn` (`src/lib/firebase.ts`): one window
    at a time (a double tap reuses it), and on the glitch it waits up to 5 s for the sign-in to land
    instead of spinning forever. The error monitor no longer reports it.
  - "Cannot read properties of null (reading 'style')" in Google's reCAPTCHA (phone sign-in): the
    invisible check's box lived in the phone step and vanished with it; it's now outside the steps
    (`PhoneAuthFlow.tsx`), and a failed reset no longer leaves an unhandled rejection.
  - "Blank page" on `/call/<id>`: the page was a black backdrop until the call screen loaded; it now
    says "Opening the call…", asks a signed-out person to sign in, and after 12 s offers Try again.
- These three reports are still marked DIAGNOSED in production: mark them resolved in the owner
  console once this is live.

## M23 · Google sign-in after the demo; the demo off the main page

- The owner (25 Oct 2026): "i am not able to sign in through google" (the sign-in page said "Login
  successful, but failed to retrieve user data"), and "remove try the live demo from the website main
  page".
- **Cause:** a tab that ran "Try the live demo" keeps the demo on (sessionStorage
  `universe:sample-mode` and `universe:sample-visitor`), so after a real Google sign-in `GET /auth/me`
  was answered by the demo (`src/lib/sample/router.ts`: "Create a free account to see this part.",
  401) and never reached the server. The account store also stays on the demo's sessionStorage for the
  life of the page (`src/store/auth.ts` picks its storage once). Nothing reached `error_reports`: the
  page caught it.
- **Fix:** `endDemoForSignIn()` (`src/lib/sample-mode.ts`) runs first in `handleLoginSuccess`
  (`(auth)/login/page.tsx`) and `handleRegisterSuccess` (`(auth)/register/page.tsx`); when a demo was
  on, the next page opens with a full load. A failed account load now shows the server's reason and
  reports it to the owner's error list ("Account didn't load after sign-in: …"), so the next cause is
  visible. Checked in the browser: demo → sign-in → real account (before the fix: the error).
- The main page (`src/app/page.tsx`) has no "Try the live demo" button any more; the sign-in page's
  "Just looking? Try the live demo" stays (the owner asked only for the main page).
- Also: `school-scope-campus.test.ts` failed now and then: random new ids could contain "b1"; it now
  looks for "b1" as a whole word.

## M24 · The Impact Wallet

- The owner picked all seven offered ideas (25 Oct 2026: "work on all 7 of them"); this is the first.
- **What:** on `/hub`, under the apps, an instrument board with what the person holds in every app,
  each in its own unit (never added into one made-up score): UniVersity impact points
  (`impact_points`, the volunteering and project points students already see; not the scholarship
  `impact_credits`) and courses, Trace points per brand with their worth per currency, people helped
  through Relief (deliveries, own needs met), Green CO₂ with streak and badges; a 12-week strip per
  app; one history across apps (newest 30, each opening its app).
- Server `GET /hub/wallet` (`src/server/impact-wallet.ts`, 8 queries, only the asker's rows); maths
  in `src/lib/impact-wallet.ts` (`weekly`, `newest`, `worth`, + tests); screen
  `src/components/hub/ImpactWallet.tsx`; sample answer `sampleWallet` (`src/lib/sample/impact.ts`);
  findable in search as "Impact Wallet".
- Fixed on the way: `InstrumentBoard`'s cells had an `aria-label` that didn't match their visible
  text (axe label-content-name-mismatch on every board); they now say "Open the detail" in
  `sr-only` text. The hub cards' coloured taglines failed contrast; they're grey now.
- Checked: types, lint, tests, lean; the route against the local database; axe at 390 and 1280 px,
  light and dark, no sideways scrolling.

## M25 · Proof for Green actions; the Green page without gaps

- Second of the seven ideas. The owner also said of `/green`: "this design is not good because there
  is space left" (the short 30-day chart beside a 30-row "What you did").
- **Proof** (migration **0183** `green_actions.photoUrl`, `verifiedBy`, `verifiedAt`): a photo with an
  action when it's logged ("Add a photo as proof", shrunk in the browser, `/api/upload`), or later
  from "What you did" ("Add proof", `POST /green/actions/:id/proof`, own and unconfirmed only, only our
  own `/api/files/` addresses via `isAppFileUrl`). A teammate (someone sharing a team, never the
  person) confirms it: "Confirm your teammates' actions" (`GET /green/proofs`, 30 days, photos only;
  `POST /green/actions/:id/confirm`, claimed with a conditional update). The person is told in the app
  and by push, no email. Rows show Confirmed / Waiting / Add proof.
- **What counts:** the weekly challenge (mine and my teams') and both leaderboards count confirmed
  actions only (`verifiedAt IS NOT NULL` in `green.ts`); the challenge says how much waits for a
  teammate. The person's own totals, streak, badges, map and the Impact Wallet still count everything
  logged.
- **Layout:** on wide screens each row of `/green` ends level: beside the form, the challenge and the
  teammates' photos (that box fills the rest and scrolls inside); below, the 30 days and the badges,
  beside "What you did", which is exactly as tall and scrolls inside (the `lg:absolute lg:inset-5`
  wrapper keeps the long list from setting the row's height). Phones show 6 actions and "Show all".
- Test: `src/server/green.test.ts` (own action refused, outsider refused, no photo refused, outside
  photo addresses refused). Checked in the browser: a teammate's photo confirmed, the owner refused,
  an outsider refused; axe clean on `/green` and `/green/teams` at 390 and 1280, light and dark.
  Next migration: **0184**.

## M26a · Sample errors no longer look like real ones

- The owner (26 Oct 2026): "there are errors in the owner console please fix it" (screenshots of
  ~24 problems: "Cannot read properties of undefined (reading 'map')", "ChunkLoadError", "Invalid time
  value", "ResizeObserver is not defined"…). Production `error_reports`: every one of them was made up
  by the console's "Fill with sample data" (ids `smpe…`, fingerprint `sample:N`,
  `src/server/sample-world.ts` step for errors). The only real open ones were the two sign-in reports
  fixed in M22 / M23.
- Now `REAL_ERRORS` / `REAL_ERRORS_SQL` (`src/server/errors.ts`) keep sample problems out of the AI
  diagnosis, the "problem(s) need a look" email, every open-errors count (Overview tiles, the live
  board `pulse.ts`, health numbers, insights, the daily digest) and the Errors tab's summary. The list
  still shows them, tagged "Sample, not real", with a line saying how many and that "Remove sample
  data" takes them out.

## M26 · The launch step: who really uses each app, inviting empty screens, invite links

- From the council (26 Oct 2026): 14 accounts, 2 sign-ins in 7 days, no real Relief, Green or Trace
  use (the 869 scans are the built-in sample product). The owner: "please do the changes according
  to this".
- **Launch board** on the console Overview (`console/launch.tsx`, `GET /owner/launch` owner only,
  `src/server/owner-launch.ts`, maths `src/lib/launch.ts` + tests): per app, real people in 30 days
  (UniVersity enrolments and hand-ins; Trace scans by signed-in people outside the sample product,
  brands joined; Relief posts and help; Green actions), new this week, came back on another day,
  last real action; and the goal "10 real people who came back". Sample-world people are left out.
- **Invites** (`src/components/apps/InviteButton.tsx`): the phone's share sheet, else WhatsApp's free
  share link (`wa.me`, no paid messaging), plus Copy link; the link is `/register?app=<app>`. On the
  empty Relief list ("Be the first… invite your neighbours"), on the empty Green map (an overlay),
  per Green team (the code in the message) and on the hub.
- Relief's numbers and the selected filter now pass contrast in light mode.

## M27 · Simpler UniVersity menus

- The owner (26 Oct 2026): "the university is too much big like people will get confuse on how to
  work on this and how to navigate… merge few of them together so that it becomes less complex".
- **Menus** (`navByRole` in `Sidebar.tsx`), before → after: students 9 entries with 3 groups of 18
  pages → Home, Messages, Learn (4), Collaborate, Careers & impact (3), Campus (3), My records,
  Settings; teachers 7 entries with 15 pages in groups → Home, Messages, Teach (5), Collaborate,
  Campus & research (3), Settings; admins 11 entries with 25 pages in groups → Overview, Messages,
  People (4), Academics (5), Operations (5), Impact (3), Insights, Collaborate, Settings. Plain names
  replace "Schooling", "Administrative data", "Global impact", "Campus monitoring".
- **Merged as tabs** (`SectionTabs.tsx`; each merged page renders its section's tabs right under its
  Topbar, so links, bookmarks and notifications keep working): `STUDENT_RECORDS_TABS` (personal,
  documents, fees, scholarships, course choices); courses + groups + marketplace; AI match in
  Opportunities; leaderboard and educational society in Credentials; `TEACHER_COURSE_TABS`;
  `TEACHER_MARKING_TABS` (assignments, quizzes, grades, attendance); research + NGO mentorship +
  impact rooms + League + volunteer mentor in one `RESEARCH_TABS` (`TEACHER_IMPACT_TABS` is the same
  list); LMS integration in People; early warning in Insights; `ADMIN_COURSE_TABS`,
  `ADMIN_LEARN_TABS`, billing in Money, student life in the campus tabs, the sponsor portal in
  Partners, `ADMIN_CREDENTIAL_TABS`. The marketplace shows the looker's course tabs
  (`MarketplaceTabs`, `courseTabs(role)`).
- **Search** (`CommandPalette`) also lists every tab of the role (`TABS_BY_ROLE`), so a page that left
  the menu is still found. The welcome tour's stops point at the new groups.
- A new merged page: add it to its tab list, render that list under its Topbar, add its address to
  the menu entry's `also`, and to `TABS_BY_ROLE` if the list is new.
- Checked: types, lint, tests, lean; the three menus and tab bars in the browser; axe clean on a
  merged page per role at 390 and 1280, light and dark.

## M28 · 500 people for a month on the $5 plan

- The owner (26 Oct 2026): "make user 500 people can login at once and do their work and it should
  not hit the 5$ plan limit… 500 people should be able to work for 1 month".
- **The plan's monthly allowances** (Cloudflare docs, read 26 Oct): Worker requests 10 M, CPU 30 M
  ms, Durable Object requests 1 M (incoming WebSocket messages count 1 per 20), DO duration 400,000
  GB-s (none while hibernating), D1 25 B rows read / 50 M written, static assets free. For 500 people
  every day that is ~666 requests, ~2 s CPU and ~66 live requests per person-day.
- **Measured:** a session on the local server: ~9 Worker requests per page view, almost nothing
  while idle; production's average CPU 3.8 ms per request. Production this month before the change:
  1.41 M requests and 5.4 M CPU ms with about 7 real people (API calls from people are only a few
  thousand: the rest are page requests, most likely bots and scanners).
- **The model** (30 page views and ~2 visible hours a person-day): requests ~4.5 M (+ bots), CPU
  ~17 M ms (+ bots), live requests ~0.6 M (it was ~2.2 M: over), DO duration ~0, D1 a few %.
- **Changes:**
  - `users.liveAt` (migration **0184**): the RealtimeHub sets it when a tab connects (the user id is
    kept on the socket with `serializeAttachment`) and clears it when the last tab closes;
    `liveAmong` (`src/lib/fanout.ts`, + tests) narrows live events to people online, in `deliver`
    (`src/server/realtime.ts`) and the light path's typing (`cloudflare/fast-api.ts`); lists over
    450 are sent as before (5 queries at most); a failed check sends to everyone.
  - "Is typing" only in chats of up to 10 people (`TYPING_PEERS`), sent every 5 s instead of 3.
  - The socket pings every 50 s (was 25; under the edge's 100 s idle limit) and closes after 5
    minutes in a background tab (the hub marks the person offline; coming back reconnects and the
    "hello" catches up) (`src/lib/realtime-client.ts`).
  - Scanner addresses (WordPress, PHP, leaked config files) get a plain cached 404 without starting
    Next.js (`JUNK` in `cloudflare/worker.ts`).
  - Pages are sampled too (1 in 50, route `page:…`, method `BOT` for crawlers) into `api_timings`,
    so the owner console's Health numbers show where the month's requests go.
  - `recordError` no longer fails when many requests meet the same new problem at once (found by the
    500-at-once test; `src/server/errors.test.ts`).
- **500 at once:** 500 people (1,500 requests at the same instant) on the production build
  (`local:serve`): all answered correctly, none failed (one local CPU makes them queue; Cloudflare
  runs many copies, the database is the only shared queue). Live delivery to an online person and
  liveAt set/cleared were checked in the browser on the build.
- **[owner]** Cloudflare dashboard → the universeimpact.com zone → Security → Bots → turn on **Bot
  Fight Mode** (free): bad bots are stopped before they reach the Worker and stop counting as requests.
  AI answers use the owner's own AI key and the daily allowance (owner console), not the $5 plan.

## M29 · Glides that follow the pointer

- The owner (26 Oct 2026): "add more animations and transitions and glides which should be ultra
  smooth". The motion layer already covered pages, titles, counts, charts, the menu's selected pill
  and the tabs' liquid thumb, so this adds motion where people point:
  - **Menu hover glide** (`Sidebar.tsx`, `.nav-hover` in `globals.css`): a soft highlight slides
    under the pointer from row to row (shared `layoutId`, `spring.snappy`); the rows' own hover fill
    steps aside (`.glide-host`). Mouse and trackpad only; touch keeps the plain `:hover`; with
    Reduce Motion it just appears; off-screen phone menus don't glide.
  - **Tab hover glide** (`SectionTabs`, `.ios-segment-hover`): the same along every section tab bar,
    one `layoutId` per bar.
  - **Group ripple**: a menu group's rows rise in 35 ms apart as it opens (a fade with Reduce Motion).
- Transform and opacity only, under 300 ms, nothing on scroll. Checked in the browser (the
  highlight caught mid-glide between rows; rows' opacity staggered right after opening); axe clean.

## M30 · Ask UniVerse (small: one confirmed action)

- From the council and the owner's seven ideas ("an Ask UniVerse assistant that acts in every app").
- **How it works:** a box on `/hub` (`src/components/hub/AskUniverse.tsx`), also from search: a
  sentence typed in ⌘K offers "Ask UniVerse: …" (first when it has 3+ words) and hands it over via
  sessionStorage `uv-ask`. `POST /ask` (`src/server/ask.ts`) turns the request into ONE proposed
  action: log a Green action, post a Relief need or offer, check a Trace code, open a page
  (`ASK_PAGES`), or a short answer. The box shows it as a card; **nothing happens until the person
  taps Confirm**, which calls the app's own route (`POST /green/actions`, `POST /relief/posts` with
  the browser's location, `/t/<code>`, a page) with all its usual checks. The route itself never
  writes anything.
- AI: `spendAi` (daily allowance), `featureOff('ai')`, `geminiJson` with a schema, `MATH_RULE`,
  answers shown with `MathText`; every field AI returns is checked again by `cleanPlan`
  (`src/lib/ask.ts`, + tests). Without AI (off, used up, failing) and in the demo, `localPlan` (a
  small matcher for common sentences) answers. The route is in the Worker's costly rate limit.
- Checked in the browser: "I cycled 8 km to school" → card "Log 8 km… 1.6 kg CO₂", nothing saved
  before the tap, saved after; search offers Ask UniVerse first for a sentence; axe clean on `/hub`.
- Next steps if the owner wants more: more actions (enrol, book a room, start a chat), answers about
  the person's own data, several steps in one request.

## M31 · UniVerse Play: four games, solo and with friends

- The owner (25 Oct): "make in like 4 of them you have made the university, trace, relief, green
  like that and also add single multiplayer games also … very detailed and ultra smooth animations".
  After the antics.gg study (rooms over WebSockets, a code to join): our own, nothing copied.
- **A fifth app, UniVerse Play** (`src/lib/apps.ts` `play`, colour fuchsia): menu Arcade and
  Leaderboards (`Sidebar.tsx`, `app-tabs.ts`), its landing tab (`PlaySection`, an animated live
  scoreboard card), sign-in side, FAQ, hub card ("games played"), launch board row.
- **Four games, one per app** (`src/lib/play.ts` `GAMES`; rules in `src/lib/play/*.ts` + tests):
  - **Quiz Clash** (UniVersity, `quiz.ts`): 50 bank questions plus made-up maths every third
    question; 10 s each, speed and streak bonus; the right answer always lights up.
  - **Spot the Fake** (Trace, `fakes.ts`): four passports, one copy; the tells are Trace's own
    (too fast a journey, far too many scans, a seal that doesn't match, a misspelt brand); three
    lives; the reveal says why.
  - **Supply Run** (Relief, `supply.ts`): needs pop up across a 6×4 town with a draining ring; pick
    a supply (keys 1–4), tap the need, a truck drives it from the depot; faster as the round goes.
  - **Recycle Rush** (Green, `sort.ts`): items ride a belt; sort the front one into one of four bins
    before it drops; streak multiplier ×1 → ×3 and a CO₂ counter (game-only averages, Green's real
    factors stay in `src/lib/green.ts`).
  Every game is made from a **seed**: the same seed gives the same round, which is how a room
  races fairly. Points are capped per game (`maxScore`, `cleanScore`), and tests prove a perfect
  round stays under the cap.
- **Solo:** `/play/game?g=<game>` → Play solo → 3-2-1 → round → score saved (`POST /play/scores`,
  200 a day), new best with confetti. **With friends:** Play with friends opens a room
  (`POST /play/rooms`) with a 6-character code (no 0/O/1/I), link and QR; friends join by code on
  `/play` or the game page (`GET /play/rooms/:code` checks it first). Up to 8; the host picks the
  game and starts; everyone counts down to the same moment; a live scoreboard reorders as scores
  come in; podium at the end; Play again goes back to the lobby.
- **Rooms** are the `GameRoom` Durable Object (`cloudflare/game-room.ts`, binding `GAMES`,
  wrangler migration `v5`): the app hands a one-time ticket (`POST /play/rooms/:code/ticket`, 60 s)
  and the browser connects to `/play-live` (Worker → room). Sockets hibernate (pings answered
  without waking the room), scores go up at most twice a second (`useGameRoom`), the room keeps
  the clock (`startsAt`/`endsAt`, each device corrects its clock from the room's messages), ends
  the round when all are done or at the alarm, and writes `game_scores` (mode `multi`).
  Migration **0185** `game_scores`. Someone arriving mid-round (or reconnecting mid-round)
  watches and plays the next round.
- **Cost:** a 75 s room round of 8 is about 8 × 150 progress messages = 1,200 incoming messages,
  i.e. about 60 Durable Object requests at the 20:1 rate; idle rooms cost nothing (hibernation).
- **Motion:** each game's timer drains and the belt runs as one GPU animation (`play-drain`, Web
  Animations for the belt, nothing per frame), React re-renders only when something happens
  (games are reducers woken at the next event), cards and answers arrive on springs, wrong answers
  shake, points float up, the scoreboard glides rows into place, the podium rises. Reduce Motion:
  loops stop, hits fade. `Rolling` (moved out of `GreenApp`) rolls numbers.
- **Demo:** sample answers for `/play/me` and `/play/leaderboard`; solo rounds play fully; rooms say
  they need the real app.
- Checked: unit tests; solo rounds of all four games in the browser at 390/1280, light/dark, axe
  clean; a full Quiz Clash round with its result; two browsers in one room on the local build
  (join by code, host switches game, live board, podium for both, back to the lobby).
- Next if the owner wants more: more question packs (per course, from teachers), a weekly
  tournament, rooms open to a whole class, sounds.

## M32 · Four bigger games (UniVerse Play has eight)

- The owner (25 Oct): "please add more unique games in the system and it should feel really good
  and big games". Now two games per app; the arcade shows **Big games** above **Quick games**
  (`GameInfo.big`).
- **Type Race** (UniVersity, `src/lib/play/typing.ts`): type 24 true facts in a seeded order;
  only the right letter moves you on (a wrong one shakes and costs 5). Cars race to a 600-letter
  flag: in a room the others' cars come from the live scores (`GameProps.rivals`, their `step` is
  letters typed), alone a pace car (30–44 wpm from the seed). Words a minute, accuracy, facts done.
- **World Pin** (Trace, `pin.ts`): 15 cities a round (Trace's city list, rank 1–2), 8 s each; tap
  the real world map (`WorldCanvas`, city names hidden, drag/zoom work). Your pin drops, the real
  one rises with a pulse, a dashed line draws, the map glides to show both and back out. Up to
  1,000 by distance (nothing past 3,000 km) + 200 for speed. Keyboard: arrows move, Enter pins
  the centre cross.
- **Flood Rescue** (Relief, `rescue.ts`): a canvas storm (rain, lightning, spotlight); the flood
  rises from 0.92 to 0.70 of the screen; people appear on seven rooftops with a waiting ring and
  are never placed on a roof that floods before they could be reached (tested). Hover low and slow
  to winch (0.55 s each, 4 aboard), land on the hospital's H to drop off; 100 + up to 50 for a
  short wait, −30 for someone lost.
- **Ocean Cleanup** (Green, `ocean.ts`): a canvas sea (swell, glitter, wake); plastic and ghost
  nets drift down on the seed's schedule; pick-ups within 1.6 s build a combo up to ×2; bumping
  sea life costs 100 and spins the boat out.
- **Engine** (`src/components/play/canvas.ts`): `useGameCanvas` (requestAnimationFrame, retina,
  resizes, paused in hidden tabs), `useSteer` + `steerBody` (mouse, finger, arrows/WASD),
  sparks and floating scores. Game state lives outside React; only score changes reach it.
- **Full screen** button on every game's stage (Fullscreen API where the browser has it).
- Caps: each game's `maxScore` is proven above a perfect round in `big-games.test.ts`.
- Checked: all four played in the browser at 390/1280, light and dark; axe clean. Rooms use the
  same GameRoom as M31 (no server change).

## M33 · The folding side menu

- From the owner's screen recording (25 Oct, a "Fold the sidebar. Get a column back." dashboard).
- On a computer the side menu folds to a 72 px strip of icons: the round arrow button on its edge,
  or the `[` key (not while typing). The page takes the room; the choice is kept on the device
  (`localStorage uv-sidebar`) and set on `<html data-sidebar="folded">` by the head script in
  `src/app/layout.tsx` before the first paint, so nothing jumps on load (`src/lib/sidebar-fold.ts`).
- CSS does the sizing: `--side-w` (16rem / 4.5rem) sets the menu's width and the page's start
  margin (`side-main` in `DashboardShell` and `AppSkeleton`); both glide together in 320 ms (a
  layout change on purpose, the point of folding); labels (`.side-label`) fade out first and back
  in last; the legal links hide. Reduce Motion: it just switches.
- Folded: names show as a tooltip beside the icon under the pointer or keyboard focus; the app
  switcher's list opens to the side; tapping a group (one with sub-pages) unfolds the menu and
  opens it. Phones keep the slide-in sheet (never folded).
- Checked: student, admin and Play pages in light and dark; widths 256 → 72 px and back, kept
  after a reload, `[` works, tooltips; axe clean.

## M34 · The "Karma" look; a denser, sharper river

- The owner (25 Oct, 11 screenshots of Rondesignlab's CreditKarma): "using all this way of colours
  and design in my current project for dark and light colour but keep the backend pink line
  animation… make it more denser and animated and… really sharp and attractive". Replaces the dark
  blue (M21–M33); AGENTS.md §8 describes the new rules.
- **Tokens** (`globals.css`, the M34 section replaces the old "Cadra" one): light page #EBEAE6,
  white cards, black ink pills; dark page #0B0B0C, cards #151517, white pills; `--hairline`,
  `--radius-card` (1.75rem; `corner-shape: squircle` where supported), `--pill-on-bg/-color`,
  the frosts `--karma-dusk`, `--karma-olive`, `--karma-gold`. Text greys keep 4.5:1 on both pages.
- **Every old navy shade swapped** for its warm graphite match across 200 files by one mapping
  (hex and rgb; e.g. #11212D → #141416, #253745 → #2A2927, rgb 37 55 69 → 42 41 39). People's
  saved colour choices (course colours, community role colours) were left as they were, so stored
  values still match.
- **Parts:** `.btn-primary` ink pill (white in dark), `.btn-secondary` outlined; `.ios-segmented`
  separate outlined pills, the chosen one filled with ink (the fill still glides); `.panel` /
  `.card` squircles with a warm shadow; side menu near-black, the chosen entry a white pill with a
  pink edge; `kpi-row` dusk + gold; `.karma-icon` (thin-line icon in a circle, used by `StatTile`
  and `KpiCard`), `.karma-go`, `.karma-frost(-olive)`.
- **Page glows:** `.ambient-bg` is one still layer of amber, gold, blue-grey, warm and olive glows
  with film grain (dim in dark mode); the old grid is gone.
- **Type:** Urbanist (OFL, `public/fonts/urbanist`, preloaded; latin + latin-ext), body weight 450.
- **The river** (`LightTrail.tsx`): 120 strands on computers (60 on phones, 40 when still), thinner
  and brighter in the app, pulses on every other strand at 220 px/s with a soft glow round each
  head (computers), 150 sparks, a livelier sway; pink-only palettes; light mode at 85% strength.
  Still for Reduce Motion and low-end phones; lighter by itself when frames come late.
- Checked: hub, UniVersity dashboard, Play, Trace, Relief, Green, messages, settings, teacher and
  admin pages, landing and sign-in at 390 and 1280 px, light and dark; axe clean.

## M35a + M35 · Maps pan and wrap; the game arena; landing pictures (25 Oct 2026, merged in PR #96 / on the branch)

- **Maps** (`src/components/trace/map/WorldCanvas.tsx`): wrap round sideways (copies side by side;
  `Frame.sx/sy/near/lngLat` put every point on the copy nearest the middle), trackpad swipes pan
  and a pinch (ctrlKey) zooms, mouse-wheel notches zoom, the 50m coastline comes in once the world
  is big enough on screen. Traps found in the browser: `goTo`/`home` called before the first
  measurement divided by zero and turned the view into NaN (an empty map in World Pin) — it now
  waits for `size()`; every map's `WORLD` box crossed 180° (`[-168,…,190,…]`), which projects to
  the Pacific — boxes must stay inside ±180. World Pin reads taps with `f.lngLat`.
- **Arena** (`src/components/play/arena.tsx`): every round full-screen with sounds (`sound.ts`,
  Web Audio, no files), announcements, shake, a timer ring, intro and results with `GameStat`s.
  Escape frees the mouse in a 3D world first; only a second press asks to leave.
- Rebuilt so far: Quiz Clash, Spot the Fake, Supply Run, Recycle Rush. The owner found them still
  flat ("like web forms"); the 3D worlds (M36) are the answer; Type Race, Flood Rescue and Ocean
  Cleanup keep their M32 look for now, Ocean Cleanup still counts power-ups and oil as rubbish.
- **Landing** (`src/components/landing/HeroScenes.tsx`): one picture style per app, no phones (the
  owner): UniVersity a live flow diagram, Trace a holographic label over a dotted world, Relief a
  radar, Green a growing landscape, Play neon 3D cards over a room scoreboard. The grey tag line
  above each headline is gone; UniVersity's text is the owner's sentence.

## M36 · 3D worlds (25 Oct 2026, on the branch)

The owner: "use the concept of roblox games… shooting, horror, science fiction… big games", rated
"16+ and 18+… age consent before playing". three.js 0.180 added (the owner said yes; loaded only by
these four games through `GameStage`'s dynamic imports).

- **Engine** (`src/components/play/world/core.ts`): `World` (renderer, scene, camera; phones get
  1.5× pixels and no shadows; pauses in a hidden tab; a long frame counts as one 50 ms step),
  `Controls` (WASD/arrows, Space, E/F, Shift; a click locks the pointer and the mouse turns; phones:
  `TouchPad` joystick, look-drag, buttons via `press/release/setStick` — React's compiler lint
  refuses property writes on objects from refs, so use methods), `Body` (upright box resolved one
  axis at a time against `World.solids`, climbs steps under 0.45), `walk`, `follow` (camera pulled
  in front of walls), `eyes` (first person), `Avatar` (Roblox-style blocks; the face is on +z, so a
  fresh avatar faces the camera: set `rotation.y = π` to face the way ahead; `facing` pins it for
  shooters), `glowSprite` (cheap glow instead of bloom). `WorldFrame` / `HudChip` in `Stage.tsx`.
- **Games** (rules and seeded levels in `src/lib/play/worlds.ts` + `worlds.test.ts`; all four
  report score, stats and end early through `GameProps`, so rooms work as score races):
  Skyline Obby (all ages: 10 stages of moving, crumbling, bounce and laser pads, checkpoints, gems,
  golden finish), Neon Strike (16+: waves of drones, hitscan beam, bolts to dodge, combos, drops),
  Night Shift (18+: first-person maze, torch with battery, five keys, a pursuer that walks the
  halls by BFS and backs off from the torch, jump scare and lives), Orbit Breach (12+: low gravity
  with an air boost, five reactors to repair, meteors with warning rings, oxygen, escape pod).
- **Ratings:** `GameInfo.age` / `rated`; `ageOn(dateOfBirth)` and `tooYoung` in `src/lib/play.ts`;
  `GET /play/me` returns `age`; the server refuses solo scores and new rooms for a known younger
  age; `useAgeGate` (`AgeGate.tsx`) asks once per device when the age is unknown
  (`uv-age-ok-<age>`), and a room playing a rated game shows `RoomAgeCheck` before the lobby.
  shortcut: joining someone's rated room is checked on the device only.
- Checked in Chromium with SwiftShader: all four render and play at 1280 and 390 (touch), the
  arcade's new "3D worlds" section and the age dialog axe-clean in light and dark.

## M37 · Games: bug sweep, longer play, levels, smoother 3D (25 Oct 2026, on the branch)

The owner: "upgrade the games… big games with a lot play time… ultra smooth… see if any errors or
bugs are there". The live site's `error_reports` had no game errors; every game was played
automatically in Chromium (`pageerror` / console) with none either. Bugs found in the code:
- **Ocean Cleanup** counted power-ups and oil as plastic: now `isTrash`/`isPower`; magnet pulls
  plastic within `MAGNET_PX`, shield takes one bump, boost ×1.35 speed and ×2 points, oil
  slows (`OIL_SLOW`), calm → choppy → storm (rain, lightning). `kgOf` for the results.
- **Flood Rescue** promised lightning and gusts: now `rescueStorm` strikes (⚡ warning, then
  `STRIKE_TAKES` of the waiting time, kept per person in `cut`), gusts push, fuel burns and the H
  refuels, pets add 50.
- **Type Race** promised nitro: now `NITRO_STREAK` right letters light `NITRO_MS` of ×2.
- **Seeded shuffles** used `sort(() => r() - 0.5)` (Night Shift keys, Orbit Breach reactors);
  engines sort differently, so a room on Safari and Chrome could get different worlds. Use `mix`
  (seeded Fisher–Yates) in `worlds.ts` for anything a room must share.
- A Night Shift key could sit on the exit square; excluded (and tested).
- **3D stutter:** `glowSprite` made a new canvas texture per bolt/spark; now one per colour,
  shared (and not disposed with a world). Walls and cover blocks are merged meshes
  (`World.boxes`, `mergeGeometries`): Night Shift ~2×, Neon Strike ~3× faster in the software test.
  `World` lowers the pixel ratio by itself after half a second of late frames and raises it back
  (`tune`), and the sun's shadow box follows the player (`sunOver`); `follow()` reuses vectors.
- **Longer play:** Skyline Obby 30 stages in three worlds (`OBBY_WORLDS`, the sky dome follows the
  camera, lava sea and embers, a neon grid and stars, `blink` pads), 8 min; Neon Strike boss drone
  every fifth wave (`isBossWave`, spreads, a boss bar), 6 min; Night Shift three floors
  (`nightMaze(seed, floor)`, 11/13/15 halls, 3/4/5 keys, the floor rebuilt in place), 8 min; Orbit
  Breach three stations (`orbitStation(seed, sector)`, outer decks, a different planet each), 7 min;
  Type Race 2, Ocean Cleanup 2.5, Flood Rescue 3. Caps in `src/lib/play.ts`, proved by the tests.
- **Levels:** `xpFor(game, score)` (≤1,000 a round, the score's share of the cap), `levelOf(xp)`;
  `GET /play/me` returns `xp` (from each game's summed scores, no new table); `PlayerCard` on the
  arcade (level bar, colours and hats unlocked by level, kept in localStorage `uv-look`), "+XP" on
  the results; the 3D character wears the look (`Avatar` `hat`, `readLook`/`lookHex`).

## M38 · Live players in 3D rooms, a skill per world, the big-game layer (25 Oct 2026, on the branch)

The owner: "do what [was] left on purpose… unique features… ultra smooth with unique animations like
big game companies".
- **Live players:** a 3D game in a room sends `{t:'pos'}` (x, y, z, facing, in the air, which
  world/floor/station, colour, hat) at most every 100 ms (`useGameRoom.sendPos`); `GameRoom` checks it
  with `cleanPos` (`src/lib/play.ts`, tested), drops anything faster than 70 ms per socket, only
  while a world game is playing, and passes it to the other sockets without storing it. The browser
  keeps peers in a ref (no re-renders); `Crowd` (`world/crowd.ts`) draws each as an `Avatar` with a
  name tag, gliding toward the last position, only for the same `part`. Cost: each incoming socket
  message is a Durable Object request at 20:1, so a full 8-player, 8-minute room is ~2,000 requests.
  Checked end to end with two browsers on `local:serve` (obby, night, orbit).
- **Skills** (`Controls` button `skill`, Q or R; a phone button; `SkillRing` in each HUD):
  Obby **Rewind** (hold: walk back along the last 3 s of positions, refills over 9 s), Strike
  **Bullet time** (tags charge it, a boss fills it; drones, bolts and debris run at 0.28×), Night
  **Echo** (walls' merged edges and the thing drawn through everything for 2.6 s; it rushes ×1.6 for
  4 s), Orbit **Grapple** (the deck nearest the aim within 60 m pulls you on a cable, no gravity).
- **Big-game layer in `World`:** bloom (`glow` option, computers only, half size; the first thing
  `tune` turns off on a slow device, and very slow frames now count), camera `shake` (trauma,
  offset only for the drawn frame), `fovBy` (eased; wider at speed), `freeze` (hit-stop), `burst`
  (a pooled `Points` system, drawn only while something flies), `say` (floating words, textures
  cached per word), `flyIn` at the start, `WorldFrame` `curtain` title cards between worlds, floors
  and stations, and an "N here with you" badge. Rooms with a rated game let people straight in
  when their age is known or already confirmed (`useAgeGate().clear`).
- Trap: `local:build` was killed (SIGKILL) while a dev server (4 GB) and an old `local:serve` were
  still running; stop them by PID first.

## M39 · Chat and voice in 3D rooms, realistic graphics, a new feature in every game (26 Oct 2026, on the branch)

The owner: "voice or text chat inside the 3D worlds… upgrade the graphics… realistic… add more
features in all the games… make them big enough".
- **Text chat** (rooms, 3D worlds): `RoomChat` (`world/RoomChat.tsx`, rendered by `WorldFrame` when
  `net` is passed): Enter or T opens the box (frees the mouse), lines float bottom-left and fade
  after 9 s, one-tap phrases (`QUICK_CHAT`), and what someone says shows as a bubble over their
  character for 5 s (`Crowd`). `GameRoom` passes `{t:'chat'}` only after `cleanChat`
  (`src/lib/play-chat.ts`, tested): the school chats' quick safety patterns (moved to
  `src/lib/safety-patterns.ts`, no imports, re-exported by `src/server/safety.ts`) refuse the
  message (`chat-no` back to the sender only); links, e-mails and long numbers become `[link]`,
  `[email]`, `[number]`; at most one message per 800 ms per seat; nothing is stored.
- **Voice** (13+, `VOICE_MIN_AGE`; unknown ages allowed): the ticket says whether a seat may talk
  (`roomTicket` from the birth date) and carries the ICE servers (`iceServers()` from `calls.ts`:
  STUN, plus TURN when Calls is set up). `voice.ts` `RoomVoice`: a direct audio link (WebRTC mesh;
  the lower id makes the offer) to each other voice seat; `GameRoom` relays `voice`/`rtc` only
  between voice seats (`rtc` up to 8,000 characters, at most 40 voice messages per 10 s a seat). Each voice plays through an HRTF `PannerNode`
  at that player's character (heard from the camera), so near is loud and far fades; a green ring
  at their feet while they talk (an `AnalyserNode`). Mic button: Voice → Voice on / Muted, plus
  leave. Audio never goes through Cloudflare (only the handshakes, a few messages).
- **Graphics** (`world/core.ts`, `world/textures.ts`): image-based light (`RoomEnvironment` through
  PMREM, `env` per world: 0.9 obby, 0.45 strike, 0.08 night, 0.7 orbit), every material physically
  lit (`MeshStandardMaterial`), surfaces made in the browser with colour, bump (normal) and
  roughness maps (`surface('stone' | 'concrete' | 'panels' | 'tiles' | 'lockers')`, `lava()`,
  `planet()`, soft sprite `cloud()`), UVs in world units (`worldUv`, `box`/`boxes` `{ tile, round }`
  with rounded edges), a 4× smoothed-edge render target, a film finish (`GradeShader`: vignette,
  saturation, contrast, grain), a planet atmosphere (`atmosphere()`), a bigger face texture. `tune`
  now also turns off the sun's shadows and then the whole effects chain on a slow device.
- **Bug found and fixed:** `Body.step` pushed a jumping body sideways to the edge of what it stood
  on (rising, it "hit" the floor it was touching). In Neon Strike a jump threw you outside the
  arena. Now a box under your feet (or touching overhead) never blocks sideways (`core.test.ts`).
- **A new feature in every game** (rules in `src/lib/play/*`, tested; how-to texts updated):
  Skyline Obby ice pads (slippery, `OBBY_ICE_GRIP`) and conveyor belts (`OBBY_BELT`, arrows scroll);
  Neon Strike pulse grenades (E / Pulse button, 3 + 1 a wave, hurt every drone within 6 m);
  Night Shift hide in a locker (E facing a wall, up to 6 s, then 12 s wait; it wanders off, and it
  "saw you" within 2.4 m); Orbit Breach solar flares (`orbitFlare` on the round clock: warning, then
  air drains ×13 outside a shield; each repaired reactor and the hub get a dome); Quiz Clash boss
  question every fifth (×3; cap raised to 26,000); Spot the Fake UV lamp (U: clears one genuine
  passport; 1 + 1 per 3 caught); Supply Run airdrop (H: under a second, no truck, rain-proof, every
  40 s); Recycle Rush sort bot (B: every 10 right sorts, sorts the next 3); Type Race perfect bonus
  (+150 for a fact with no mistakes); World Pin hints (2 a round, region and zoom, half points) and
  the close-pin streak bonus (`pinStreakBonus` existed but was never used); Flood Rescue supply
  crates (D: 3 a trip, +6 s for everyone on that roof); Ocean Cleanup sweep (15 pieces charge it,
  Space collects all plastic within reach).
- Cost: chat is one tiny socket message per line; voice adds a few handshake messages per pair.
  Trap: the React compiler lint refuses changes to a ref's contents after a `useEffect` that uses
  the same ref; put such effects after `useGameCanvas`.
