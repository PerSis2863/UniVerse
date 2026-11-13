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

## M40 · Ridgeline Ops: the open-world extraction shooter (26 Oct 2026, merged, PR #98)

The owner: "replace this game with neon strike… open world tactical shooter… inspired by" a Roblox
rescue game, then a full overhaul "inspired by Call of Duty: DMZ and Escape from Tarkov". Only
ideas are borrowed: every name, model, sound and rule is our own (made-up gun names, no copied
assets, nothing taken apart). Neon Strike is gone; the game id is `ops` (the live database had no
`strike` scores). 16+, 15-minute rounds.

- **Rules, all tested** (`src/lib/play/ops/`, `ops.test.ts`): `arsenal.ts` (21 guns in 6 classes,
  fire modes, 5 rarities with legendary names, 15 attachments in 5 slots, damage falloff, recoil),
  `items.ts` (valuables, meds, grenades, plates, helmets and vests T1–3, packs 8/12/16 slots, ammo
  pools, the 4-slot secure container, weights, containers and soldier loot), `map.ts` (the seeded
  800 m island: six places, a village, four landing zones, two SAM sites, roads, keys carried by
  officers, drops at 200/520 s, the convoy at 330 s), `rules.ts` (armour and plates, bleeding,
  fractures, adrenaline, stamina, buy station, contracts, score). **Score** is only what you
  *extract* that you looted this raid, plus kills, places and hostages; `opsCeiling` proves the
  cap (`maxScore` 500,000; XP uses `par` 40,000 through `xpPar`).
- **Game** (`src/components/play/ops/`): `game.ts` runs it all (phases safehouse → insert → raid
  → exfil / down, the range); `render.ts` (tone mapping, height fog, cascaded shadows + ambient
  occlusion + bloom on high, a second scene for the hands, the 8× scope picture, quality tiers);
  `sky.ts` (16:00 → 23:00, rain and lightning); `terrain.ts` (five blended surfaces); `foliage.ts`;
  `structures.ts`; `operator.ts` (skinned soldiers); `guns.ts` + `viewmodel.ts` (first-person gun
  and hands, aiming down the sights, recoil, reload/plate/med animations); `player.ts` (sprint,
  tactical sprint, slide, crouch, prone, vault, lean, swim); `weapons.ts` (bullets with drop and
  travel time, grenades); `ai.ts` (squads: perception, cover, flanking, medics, snipers with laser
  glint, radio); `vehicles.ts`, `events.ts` (helicopters, plane, drops, mortar), `audio.ts`,
  `stash.ts` (the safehouse, saved on the device: `uv-ops-safehouse-v1`), `menus.tsx`,
  `RidgelineOps.tsx` (HUD).
- **Quality:** phones and `uv-ops-quality` = `low`; strong computers `high`. To try another on
  one device: `localStorage.setItem('uv-ops-quality', 'medium')`. `uv-ops-debug` = `1` puts the
  game on `window.__ops` (tests and tuning only).
- **Speed work in this item** (measured, not guessed): sandbags and boxes with fewer rounded
  segments (one mesh had 189k triangles), far trees as one cone/ball, bigger tree tiles off high,
  others' guns and vehicles merged into one mesh per material (`merge.ts`), small props and
  soldiers far from the camera not drawn (soldiers keep thinking), the ground on low uses every
  other vertex, ground textures not sampled where their weight is zero. The headless test browser
  draws in software (SwiftShader), so its frame rate (2–4) says nothing about a real phone; there,
  the ground's pixels and the skinned soldiers are the costs that matter.
- **Bugs fixed on the way:** the first mouse move after the pointer locks could jump hundreds of
  pixels and spin the view (now ignored, `world/core.ts`, all 3D worlds); Esc in the bag, map or
  buy station opened "Leave the game?" instead of closing it; the phone HUD overlapped (weapon
  panel under the minimap, buttons in three columns).
- **Tested:** unit tests; play-throughs at 1280 and 390 (safehouse, landing, walk, fire, aim,
  reload, bag, map; no console errors); a fast-forward test of buying, driving, the whole
  extraction (call, waves, landing, boarding, bank) and the range; axe clean at 390/1280, light
  and dark.
- **Traps:** `three` checks `object.visible === false`, so `visible = undefined` *shows* an object.
  Others' guns come from `liteGun` (cached and merged): don't look for named parts on them. A
  material patched for fog/shadows must go through `r.patch` / `r.prep` (they compose
  `onBeforeCompile` and set the cache key). Test against the dev server in one command
  (start, test, stop) rather than leaving it running.

## M41 · New hero pictures and motion that answers the pointer everywhere (31 Oct 2026)

The owner: "make much better design and animation… when I go in sign in page it still shows the old
one… don't just put the box design… add more animation and motion… for whole project not just main
page".

- **Hero pictures** (`src/components/landing/HeroScenes.tsx`, one per app, used by the landing and
  by sign-in through `AuthShowcase.tsx`): UniVersity is "the school day running itself" (jobs
  orbiting a counter, a feed under it); Green is a living planet (rotating dot band, actions riding
  an orbit with CSS `offset-path`, a ticker pill); Play is a neon race track (SMIL `animateMotion`
  comets, a leaderboard that re-orders with `layout`). Green and Play have no box round them: they
  float in the page. `PassportCard.tsx` was deleted (nothing used it).
- **Motion that answers the pointer** (`src/lib/light-motion.ts`, started for every page with the
  scroll motion): a ripple of light spreads from the finger in every button and tab
  (`.btn-*`, `[role="tab"]`, `.mkt-cta`, `[data-ripple]`); `[data-magnetic]` and the landing's
  buttons lean toward the pointer; `[data-tilt]` tilts a picture in 3D (the landing's hero);
  `[data-cursor-light]` puts a soft pink light under the pointer (landing and sign-in). CSS in
  `globals.css` "M41": clickable cards (`a.card`, `a.panel`, `button.card`, `.card-hover`) lift
  with a pink shadow on hover, fields glow when focused, buttons rise 1 px on hover. The landing's
  hero picture also drifts up as the page scrolls (parallax, a spring on `scrollY`).
- **Rules for code that builds on it:** follow, tilt and cursor light only on a fine pointer with
  hover (touch screens get the ripple); none of it runs with Reduce Motion. `data-no-motion` opts
  out of the scroll reveals and the sparks, *not* the ripple; `data-no-motion-follow` opts out of
  the ripple, magnetic and tilt. Each effect writes only `transform` or two CSS variables, frames
  only while something moves.
- **Tested:** browser check on the dev server (magnetic offset, ripple element, tilt angles, cursor
  light variables, no page errors); unit tests, typecheck, lint, lean.

## M42 · Link previews, icon count, install guide, Share to UniVerse, and much less text (31 Oct 2026)

The owner: "do all of them" (the plan's steps 1–5; store apps left out, no funds), then, seeing the
phone landing: "it like to much information for the first time user to read… everywhere there is
text that is not good".

- **Link previews:** `public/og.jpg` (the whole site: "One account. Many apps. Real impact.") and
  `public/og/<app>.jpg`, 1200 × 630, made from the landing's own hero (a scratch Playwright script,
  device scale 1200/1440, nav links and buttons hidden). `src/lib/share-meta.ts` (`shareMeta(app,
  description)`, `SITE_SHARE`; bump `V` when a picture changes) is used by new server layouts in
  `(dashboard)/trace|relief|green|play`, `join`, and by `t/` and `b/` (Trace). Play room invites
  (`/play/game?room=`) now show the Play picture. A server layout under the client `(dashboard)`
  layout is fine: the router composes them.
- **Icon count:** `Topbar` sets `navigator.setAppBadge(unread)` from the bell's count; the service
  worker (`src/worker/index.ts`, `iconCount`) sets it to the notifications waiting in the tray after a
  push and after a tap. Works on iPhone home-screen apps, Windows and Mac; Android shows its own dot.
- **Install:** `src/components/pwa/InstallGuide.tsx` (a `Sheet`): perks, then the taps for iPhone /
  iPad (no install button there), Android or a computer; the browser's own install when it offers
  one. Used by the landing's "Get the app" (replaces the old toast) and the in-app banner's "Show me
  how" on iPhone. `manifest.json` has seven screenshots (`public/screenshots/`, 5 phone, 2 wide) so
  Android's install sheet shows a gallery.
- **Share to UniVerse** (Android only; iPhone has no share target for web apps): manifest
  `share_target` → `/app?title=&text=&url=`; `/app` keeps it (`src/lib/share-in.ts`,
  sessionStorage, 2000 characters) and opens Messages; the chat list shows "Pick a chat to send it
  to"; the chat picked gets it as its draft (`keepDraft`), nothing is sent by itself. Files are not
  accepted (that needs a POST share handled in the service worker).
- **Less text:** every hero is a headline plus one short line, two buttons, and quiet links ("Get
  the app", "Scan a sample") with the note; the mono eyebrow shows from `sm` up. Every section's
  paragraph, card, FAQ answer, CTA and the sign-in side were cut to one short line; `APPS[].impact`
  too (the hub shows it). Footer: Play added, new line.
- **Phone fixes found on the way:** the hero grid had no `grid-cols-1`, so the app tab row (wider
  than a phone) stretched the column and the text and buttons ran off the right edge; the nav's
  "Get started" broke onto two lines and the bar overflowed at 320–360 px (now nowrap, "Impact" from
  400 px, the wordmark from 360 px, the link has an `aria-label`). Trace's four steps: the reveal
  wrapper is now the list item (`Reveal role="listitem"`), so axe's list rules pass.
- **Tested:** browser run on the dev server (install guide opens; icon count set to the demo
  student's 30 unread; shared text reaches Messages, the banner shows, the picked chat's box holds
  it); share tags read from the HTML of `/`, `/play/game?room=…`, `/t/demo`, `/green`, `/join`;
  axe clean at 390/1280 (landing, guide, sign-in, the share banner light and dark); no element wider
  than the screen at 320/360/390; unit tests (a new one for `sharedText`), typecheck, lint, lean.
- **Traps:** the local database must have every migration (`npx wrangler d1 migrations apply
  universe-db --local`), or demo sign-in fails with "no such column". In tests, the first
  `role="listitem"` in Messages is the status bubble, not a chat.

## M42a · "Try the live demo" taken off the sign-in page (31 Oct 2026)

The owner: "remove try the demo option from the project I don't like it", then picked only the
sign-in page's "Just looking? Try the live demo" (signed-in "Explore with sample data" and M43's
"try it here" demos stay). M23 had already taken it off the landing.

- Gone with it, all the code only the visitor demo used: `startVisitorDemo` (SampleMode.tsx), the
  visitor flag (`isSampleVisitor`, `setVisitor`, `clearVisitorStorage` in `sample-mode.ts`), the
  "Live demo" banner and its "Create a free account", the auth store keeping a made-up person in
  sessionStorage (`store/auth.ts`), and the sample router's visitor answers (`/users/me`, the 401 for
  pages without an example).
- `endDemoForSignIn` stays (sign-in and sign-up): it now only ends sample mode before a real sign-in.
- **Rule:** there is no way into the app without an account; sample mode is for signed-in people.

## M43 · More of Relief, Green and Play on the landing, "try it here" demos, and photos shared in (31 Oct 2026)

The owner's pick (M43 in AGENTS.md §4), plus "Sharing photos into UniVerse… please do this also"
(left out of M42).

- **Landing** (`src/components/landing/ImpactMore.tsx`, after each tab's first section in
  `src/app/page.tsx`): three short sections per tab, a headline and a picture each. Relief: try the
  help map, Ask → Matched → Delivered, "your area, never your door" (500 m, 30 days, never a
  helper's location). Green: log one, streak / this week's challenge (`weeklyChallenge`) / badges
  (`BADGES`), photo proof confirmed by a teammate. Play: a five-question round, rooms (a code, 8
  seats), the four 3D worlds with their age ratings (`GAMES`).
- **"Try it here"** (`src/components/landing/TryIt.tsx`, loaded with `dynamic()` only when its tab is
  open): `QuizTry` (Quiz Clash's own `quizQuestion` and `quizPoints`), `GreenTry` (`co2For` and
  `GREEN_FACTORS`' "how" line, nothing else invented), `ReliefTry` (the Relief map engine,
  `WorldCanvas` with `interactive={false}` so it doesn't take the page's scroll; the list beside it is
  how you pick, so it works by keyboard and screen reader). All in the browser; nothing is sent.
- **Photos shared in** (Android): the manifest's `share_target` is now `POST /api/share-in`,
  multipart, with `photos` (`image/*`). The service worker (`src/worker/index.ts`, `takeShare`)
  answers it on the device: up to 10 photos (40 MB each) go into the cache `universe-share` as
  `/__share/<i>` (name in `x-name`), and it redirects to `/app?title=&text=&url=&photos=<n>`. Without a
  service worker yet, `src/app/api/share-in/route.ts` passes the text on (photos can't wait there).
  `share-in.ts`: `pendingShare`, `givePhotos(chat)` when a chat is picked, `photosFor(chat)`,
  `clearPhotos`. In the chat, `SharedPhotos.tsx` shows them above the box with Send (several go as
  one album) and Not now; private and official chats say they can't take photos. Nothing is sent by
  itself.
- **Fixed on the way:** with Reduce Motion on, the landing's hero pictures drew differently on the
  server and in the browser (React's hydration error). `useCalm()` (`landing/bits.tsx`) reads Reduce
  Motion as off until the page has woken, then the real setting; `HeroScenes` uses it.
- **Tested:** `scripts/checks/landing-try-ui.mjs` (each tab's demo, the share route's fallback, two
  photos in the cache reaching a chat's box and "Not now" emptying it; axe and no sideways scroll at
  390/1280, the chat light and dark); unit tests for the shared photos, typecheck, lint, lean.
- **Traps:** the service worker's catch only works once it controls the installed app (a first share
  right after installing may lose photos, the text still arrives). The landing tabs' sections only
  exist while their tab is open: a test has to pick the tab (and the first tap can land before the
  page is ready).

## M44 · The landing's scroll story and live totals (31 Oct 2026)

The owner's pick (M44 in AGENTS.md §4): "a scroll story at the top of the landing (the five pictures
turning into each other) and a strip of live totals (rounded, counted once a day, no person
findable)".

- **Scroll story** (`src/components/landing/ScrollStory.tsx`, under the hero): one screen of scrolling
  per app; the picture stays put (sticky) while the five `HeroScenes` pictures fade, shrink and slide
  into each other (`useScroll` → `at` 0…4, transform and opacity only). Only the picture on screen and
  its neighbours are mounted, and only while the story is near the screen (`useInView`). The dots jump
  to an app; "Open <app>" picks that tab and goes back to the top. Reduce Motion (`useCalm`): fades
  only.
- **Live totals** (`LiveTotals.tsx`, between the hero and the story): `GET /api/impact/totals`
  (public, cached an hour) → `siteTotals()` (`src/server/site-totals.ts`). Counted once a day by the
  daily jobs' new `site-totals` step (one query for the five numbers, one upsert) into the new table
  `site_totals` (migration **0186**), already rounded down (`roundDown` in `src/lib/site-totals.ts`:
  two figures, tens at least); anything under 10 isn't sent, and with nothing to show the strip is
  hidden. The owner's sample world never counts (emails `@sample.universe.test`, ids and brands
  `smp…`). If the table is empty (before the first daily run) the first visit counts once.
- **Rules for code that builds on it:** new totals go in `TOTAL_KEYS`, the query in
  `countSiteTotals` (keep it one query) and a label in `LiveTotals`. Only whole-site sums, never
  per place or per school. The landing asks with plain `fetch`, so sample mode doesn't need an answer
  for it.
- **Tested:** `scripts/checks/landing-story-ui.mjs` (the route's numbers are rounded and 10 or more;
  the strip shows them; each dot brings its app's headline and picture; axe and no sideways scroll at
  390/1280); unit tests for the rounding; typecheck, lint, lean.
- **Traps:** after adding a table, a running dev server keeps the old Prisma client (`siteTotal` is
  undefined) until it's restarted.

## M45 · How the app feels: glides, celebrations, sounds, swipes, sheets, one vibration (31 Oct 2026)

The owner's pick (M45 in AGENTS.md §4): "screens that glide into each other, short celebrations at
milestones, optional sounds (off by default), swipe and long-press on rows, bottom sheets, the same
vibration everywhere, empty screens with one next step".

- **Glides:** pages already glide (push, back, tab, shared title: `src/lib/page-transition.ts`, built
  without View Transitions on purpose, see its header). What was missing was swaps inside a page:
  `glide(el, 'push' | 'pop')` there; Messages on phones now glides the list back in from a chat
  (opening one already has the portal, `.chat-glide`). Settings already slid on phones.
- **Celebrations** (`src/lib/celebrate.ts`, `celebrate(fromElement)`): a burst of sparks from the
  button, under a second, plus the success vibration; transform and opacity only; nothing with Reduce
  Motion; fewer sparks on low-end phones. Used when a Green badge is earned by the action just logged,
  a Relief request is marked Delivered, and a first, on-time hand-in of an assignment. Play's new best
  keeps its own confetti (`ScreenEffect`).
- **Sounds** (`src/lib/sounds.ts`): off until Settings → Appearance → Sounds (`uv-sounds`). A soft
  two-note chime for success, a low note for warning, made with Web Audio. They play from `haptic()`,
  so the sound always matches the vibration; taps are silent; games pass `haptic(kind, false)`
  (they have their own sounds and switch).
- **One vibration:** `haptic('tap' | 'success' | 'warning')` everywhere (it follows Settings →
  Vibration and gives iPhones their system tap). The scanners and the games used raw
  `navigator.vibrate` (ignoring the switch); now they don't. Only the ringtones keep their own
  patterns (an incoming call, the ringtone preview in Settings).
- **Swipe and long press** (`src/components/ui/SwipeRow.tsx`): a finger drags the row; past 90 px
  toward the end runs `start`, toward the start runs `end` (mirrored right-to-left), with the success
  vibration. Mouse and keyboard keep the row's buttons. Notifications use it (snooze / read, as
  before); Messages rows now swipe too (toward the end: read / unread; toward the start: archive). A
  long press on a chat (or Android's held finger) opens its options.
- **Bottom sheets on phones:** a chat's options and every `Menu` (the shared small menu, e.g.
  Notifications' snooze) open as a `Sheet` from the bottom under 768 px (`useMedia`,
  `src/lib/use-media.ts`), with taller rows; computers keep the small menus. `Popover` (toolbars,
  colour grids) stays as it is.
- **Empty screens:** most already had their next step beside them; added one where there was none:
  the student directory and mentors search ("Clear search and filters", "Show everyone") and the
  admin meals day ("Add menus").
- **Also:** Settings → Appearance's choice buttons are now the house style (a black pill in light, a
  white one in dark), not the old indigo-to-pink gradient (too faint behind white text).
- **Tested:** `scripts/checks/feel-ui.mjs` as a phone with a finger (swipe flips read / unread and
  back; a long press and the snooze menu open sheets; Sounds off by default, on and off; axe on the
  sheets and Settings, light and dark) and at 1280 (the small menu stays); unit tests for sounds;
  typecheck, lint, lean.
- **Traps:** with a sheet open, run axe on the sheet only (the page behind is dimmed on purpose, so its
  colours fail). In Settings on a phone, axe content scrolled under the see-through top bar also
  "fails". CDP touch long-presses also send a tap (real Android doesn't): test long press with a
  `contextmenu` event.

## M46 · Offline reading, an iPhone launch screen, bar colours per theme, a low-end phone speed check (31 Oct 2026)

The owner's pick (M46 in AGENTS.md §4): "today's timetable, courses and recent messages readable
offline, an iPhone launch screen, bar colours per theme, and a speed check on a low-end phone".

- **Offline reading** (`src/lib/offline-reads.ts`): API answers are never in the service worker's
  cache (per person), so the last answer of a few reads is kept in the offline database
  (`src/lib/outbox.ts`, new `reads` store, database version 4, wiped at sign-out with the rest):
  `/api/core/timetable/my`, `/api/core/courses/my`, `/api/chat/conversations`, the student home's
  overview (one per weekday, its key holds the day), the teacher dashboard, and the home cards
  (`/api/home`, only on the day saved: it holds today's classes at their times). `api.get` and
  `authedJson` save them on success and, when the request fails for want of a connection
  (`isOfflineError`), answer with the copy instead: only the same signed-in person's, at most 14 days
  old; never in sample mode or "view as". Once a day, when the app is idle (with the tab prefetch, not
  in low-data mode), students and teachers refresh the three copies the offline page needs (at most
  three small reads a day). Chats themselves were already kept (last 50 messages of 20 chats).
- **The offline page** (`public/offline.html`, plain HTML, precached as the fallback): shown for any
  page not saved on the device; now in the Karma look, following the app's theme, with **Today**
  (classes for today's weekday from the saved timetable), **Messages** (latest 6 chats, unread dot,
  private chats say only "Private chat") and **Courses**, each with "saved … ago"; everything written
  with `textContent`. The offline bar says "You're offline · showing what's saved on this device".
- **Bar colours per theme:** the browser bar (`theme-color`) followed the *device's* light/dark, not
  the app's (dark by default), so a light phone showed a light bar over the dark app. Now one
  `<meta name="theme-color">` in the root layout's `<head>`, set before paint by the theme script
  (`BARS_SCRIPT` in `src/lib/theme.ts`) and on every change (`applyTheme`). On iPhone home-screen apps
  the status bar style follows too: `black-translucent` (white text over the page) in dark, `default`
  (black text) in light, where white text was unreadable over the light header. iOS may read this only
  when the app starts: untested on a real iPhone.
- **iPhone launch screen:** `scripts/gen-launch-screens.mjs` draws the icon on the dark page colour
  for 13 iPhone sizes (SE to 17 Pro Max) and 9 iPad sizes, portrait, into `public/splash/` (~0.5 MB,
  excluded from the service worker's install: iOS fetches them once, when the app is added) and writes
  the links to `src/lib/launch-screens.gen.ts` (root layout). Dark only (the app's default).
- **Speed check** (`scripts/speed.mjs`: 390 × 844 touch, CPU 4× slower, "Slow 4G", built site):
  first paint 1.1–1.5 s on a first visit and 0.3–0.6 s on a return visit (good); the main content
  (LCP) 3.9–5.8 s on a first visit to an app page (mostly ~400 kB of scripts at 1.6 Mb/s, then
  starting React) and 1.7–2.1 s on a return visit. **Found and fixed:** the light river kept a budget
  phone's processor 100% busy after every page had loaded (hiding it: 81% free). Its "go lighter"
  step changed nothing on phones (already 30 frames a second) and its test for a struggling device
  (frames over 52 ms apart) never fired: a saturated phone still managed one every ~42 ms. Now it
  judges the average time between frames every 60 frames: over 24 ms lighter, over 34 ms (or 28 ms
  once lighter) it holds still at that moment, redrawn only on scroll, like Reduce Motion; and in the
  app it starts moving once the page has loaded (the landing's opening still pours in at once).
  After: app pages leave the processor 74–78% free 8 s after opening (was 0%); fast devices keep the
  moving river. **Not fixed (next ideas):** the landing page stays busy (15–20% free even with its
  river still and CSS animations paused): its looping demos run in code while off screen (pause them
  outside the viewport); first visits download ~400 kB of scripts before an app page can start.
- **Rules for code that builds on it:** another read kept offline = one line in `KEPT`; if the offline
  page should show it, add it to the page's list and to `refreshOfflineCopies` (keep that list small:
  each is a request a day per person). Never keep a read that holds other people's private data
  beyond what the person already sees. A new theme colour = `BAR` in `theme.ts`. New iPhone sizes: add
  to `SCREENS` and run the script.
- **Tested:** `scripts/checks/offline-ui.mjs` on the built site (copies kept after a visit; offline,
  the home shows its saved data and a page never opened shows today, chats and courses; axe at
  390/1280, light and dark; one bar colour per theme, changed by the theme button; launch screens
  linked and served); unit tests for when a copy may be shown; typecheck, lint, lean.
- **Traps:** the offline page and service worker exist only in a build (`pnpm local:build`), not in
  `local:dev`. A page is saved for offline use only once the service worker controls it (the second
  load after install). A test browser's "offline" (`setOffline`, `route`) doesn't reach the service
  worker's own requests unless `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` (set in the check):
  without it an "offline" test quietly passes online. A `<meta>` written in React and changed by a
  script before the page wakes up is added a second time by React: tags a script changes are made
  by the script.

## M47 · The landing's demos pause off screen; light and sideways launch screens (31 Oct 2026)

The owner, on M46's two leftovers: "do both of these"; then "don't build for the slow phone", so the
part that held the whole landing still on a struggling phone was taken out again before committing
(M46's own river rule stays).

- **Off screen, still** (`Live` in `src/components/landing/bits.tsx`): wraps a landing part whose
  demos loop (the hero picture, the scroll story, Bento's languages, the typing statement, the Trace
  map section, Relief's "try it" map). An IntersectionObserver (200 px ahead) gives the part an
  "away" context; `useCalm()` = Reduce Motion **or** away, so every loop that already honoured Reduce
  Motion now also stops off screen; the scroll story's layers that aren't shown are away too. CSS
  loops inside pause (`[data-away] *` in globals.css). Starts "on screen" so the server's HTML and the
  first render agree.
- **Trap (framer-motion):** taking a running `repeat: Infinity` animation's `animate` away does
  **not** stop it (the hero ring kept spinning off screen). `still()` in `HeroScenes.tsx` gives each
  scene a new `key` when it turns calm, so a fresh still copy replaces it. Use the same trick for any
  new looping framer animation that must stop.
- Removed on the way: `ReliefCard`, `GreenCard`, `PlayCard` (ImpactApps.tsx), unused since M43;
  LiveMapShowcase and TryIt now use `useCalm` instead of framer's `useReducedMotion`.
- **Launch screens:** `scripts/gen-launch-screens.mjs` now draws both themes (dark #0b0b0c, light
  #ebeae6) and the iPads sideways too: 62 pictures (`public/splash/<theme>-<w>x<h>.png`, 1.4 MB, not
  precached). `src/lib/launch-screens.gen.ts` holds only the size list; the head script (`BARS_SCRIPT`
  in `theme.ts`) adds the 31 links in the chosen theme (no longer React-rendered: they change with the
  theme, and React would disagree with its copy of the head), and `syncBars` swaps them when the theme
  changes (`setAttribute`, so the hrefs stay short). iOS reads them when the app is added: someone who
  changes theme later sees the old one until they add the app again. Untested on a real iPhone/iPad.
- **Tested:** `scripts/checks/landing-pause-ui.mjs` (built site: the hero moves at the top, holds
  still lower down with nothing off screen animating, moves again back at the top),
  `scripts/checks/offline-ui.mjs` (launch links follow the theme and the theme button; three served),
  typecheck, lint, unit tests, lean.
- **Measured, not acted on (the owner said not to build for slow phones):** with the CPU 4× slower
  the landing still keeps the processor busy at the top (the visible hero) and the page's always-on
  CSS glows keep frames coming in the test browser (no graphics chip there; real phones move them on
  the GPU). The other speed idea from M46 stays open: ~400 kB of scripts on a first visit.

## M48 · Live cards: constellations and funnels of light on every home (31 Oct 2026)

The owner sent a video of "Crew" (a staff dashboard by buildindex.dev): "add those animations and
design in the system in all the places… professional and ultra smooth". Asked: keep UniVerse's own
colours (Karma: pink, a little purple, white, warm gold) and add the video's moving pieces.

- **The kit** (`src/components/live/`): `canvas.ts` (`useLiveCanvas`: one canvas in device pixels,
  frames only while on screen and the tab is open, one settled frame with Reduce Motion, time starts
  when first seen; `glow()` sprites drawn once and stamped, so no shadows or blur per frame;
  `TONES`), `Constellation.tsx` (groups of glowing points in 3D around you, two orbits for depth, a
  haze per group, lines with light pulses running out, labels in small pills, points fly out on
  arrival, the pointer tilts the view and lights the nearest group), `Funnel.tsx` (a stream of 220
  points through stages as wide as their counts, those that don't go on drift out and fade, a warm
  light at the end; an even calm stream when every count is 0), `LiveCard.tsx` (the deep card,
  near-black in both themes with the river's glows: live dot, title, picture, small numbers, a
  `Ticker` line that changes every 3.8 s; `Countdown` with rolling digits), `HomeLive.tsx`.
- **Where:** student home "Your constellation" (courses, work due; countdown to the next class),
  teacher "Your classes, live" (students per class), admin "School constellation" (departments) as a
  new home card `orbit` (`src/lib/home-layout.ts`; it can be hidden or moved like the others); the hub's
  hero (every app around you); Relief "Help, moving" (open → being helped → helped); Trace "From label
  to owner" (printed → scanned → claimed); Green and Play constellations (shown once the person has
  actions or rounds). Everything is fed with data the page already loads: no new requests, so sample
  mode needs nothing new.
- **Rules for code that builds on it:** a new moving picture = a `draw(frame)` for `useLiveCanvas`;
  stamp `glow(tone)` with `globalCompositeOperation = 'lighter'` rather than shadows; keep text in the
  DOM where it matters (numbers, screen-reader lists) and only labels on the canvas. Colours only from
  `TONES`.
- **Tested:** `scripts/checks/live-ui.mjs` (each card draws, no sideways scroll, axe at 390/1280,
  light and dark; student, teacher, admin, hub, Relief), typecheck, lint, unit tests, lean. Looked at
  in the browser on a phone and a desktop.

## M49 · More kinds of live pictures, a cascade between tabs, and the owner console gets them (31 Oct 2026)

The owner: "add more of these animations and transitions like different kind in the system and did
you apply all these in the owners portal" (they weren't: M48 covered the homes only).

- **Three new pictures** (`src/components/live/`, same loop and glow sprites as M48):
  `Heartbeat.tsx` (a live line that draws itself in, glides to new values over 700 ms when a refresh
  brings them, a pulse of light runs along it every 3.5 s, a breathing light on the latest value, red
  sparks for failures via `marks`); `Radar.tsx` (a beam sweeps every 4.2 s, blips light up as it
  passes and fade, names show while bright; `ring` 0–2 from the middle); `PulseGrid.tsx` (rows of
  small squares lit by value, popping in from the left, a band of light passing over; after the
  video's "engagement pulse").
- **Cascade between tabs** (`TabPanel` / `useCascade` in `src/components/ui/Glide.tsx`): a new tab's
  cards rise in one after another (280 ms each, 45 ms apart, transform and opacity only, nothing with
  Reduce Motion); cards that arrive in the next 1.5 s (data replacing a skeleton) join in. Every
  `TabPanel` gets it: the owner console's sections, Calls, admin courses, analytics, early warning,
  leaderboard, events. `useCascade(ref, key)` for any other section that swaps content.
- **Owner console** (`console/live-cards.tsx`): Overview opens with "Who's here now" (the people
  online on a radar, admins in the middle, teachers next; recent sign-ins in the ticker) and
  "Everyone" (accounts by role as a constellation); the live board starts with "The app's heartbeat"
  (requests per second with server failures as red sparks, and a pulse grid of views, messages and
  sign-ins), following the board's 1 h / 1 day / 7 days choice.
- **Elsewhere:** Trace's live card adds scans per day as a heartbeat (likely copies as red sparks),
  Green's adds CO₂ per day, Relief's adds open needs on a radar (critical in the middle).
- **Tested:** `scripts/checks/console-deck-ui.mjs` on the built site (now also: every live card on
  Overview draws, and saves a picture of each), axe-clean with no sideways scroll on desktop and phone,
  light and dark; the cascade seen on Calls (cards rising after a tab click); typecheck, lint, unit
  tests, lean.

## M50 · Trace in motion: a night city, journey lines, level gauges and a timetable (31 Oct 2026)

The owner sent a second video ("Waypoint", a fleet and warehouse dashboard by buildindex.dev):
"add these animations in the system… specially in the trace section you can add with more features…
ultra smooth", and "add all these where ever you think can fit".

- **New pieces** (`src/components/live/`): `CityView.tsx` (a night city seen from above at an angle:
  blocks with lit windows drawn once per size, the warehouse hub glowing with rings, every batch a van
  going from a factory at the edge through the hub to its shop; the way done glows pink, light streams
  ahead to where it's going; names on vans on the move, any van's name when pointed at; pills step
  aside instead of covering each other), `Journey.tsx` (a wave through the steps that draws itself in;
  each step ticks over as the line reaches it, the current one pulses, a light runs along what's done;
  step names and times in an ordered list; follows the theme or `dark`), `Tank.tsx` (a half bowl
  whose liquid rises to the level with a sliding wavy top; plain boxes and a transform: an SVG clip
  version didn't draw reliably), `Schedule.tsx` (bars from start to end growing in one after another,
  hours or days along the top, at most about seven marks, a pink line for now). `STAGE_SHORT` in
  `src/lib/trace.ts`: one word per stage for narrow places.
- **Trace:** Tracking opens with "Fleet in motion" (the city, on the move / delivered / next arrival,
  a ticker) and ends with "Journeys" (the timetable); an opened shipment shows its journey stage by
  stage and how far along it is as a gauge. The product passport (`/t/<code>`) draws its journey
  ending with "You". Radar gets "On the radar" (recalls and copies in the middle, grey market and warm
  shipments next, blocks outside). The wallet gets "Your points, live" (brands as a constellation, the
  total over time as a heartbeat). Each campaign shows its budget left as a gauge.
- **Elsewhere:** a student's assignment shows Set → Handed in → Marked as a journey; Relief requests
  show Asked → Someone's on it → Helped; Green's weekly challenge has a gauge; the student home's
  "Today's classes" gets the timetable with now (only on days with classes).
- All from data the pages already load: no new requests or database changes.
- **Tested:** `scripts/checks/live-ui.mjs` (now also Trace tracking, radar and wallet in sample mode;
  each card draws, axe at 390/1280, light and dark, no sideways scroll); looked at in the browser
  (the city, the journey and gauge on a shipment, the timetable, the passport, Green); typecheck,
  lint, unit tests, lean. Not run through a full build this time (no server changes).

## M51 · A richer night city (31 Oct 2026)

The owner, on M50's "Fleet in motion": "needs to be more detailed and graphics and animated and
ultra smooth".

- `src/components/live/CityView.tsx` rebuilt: two pictures drawn once per size (the ground: a
  darker edge, streets with dashed lanes, a lamp at every crossing; the buildings: towers taller
  toward the middle, clusters of four, pairs and low squares, shaded faces, a bright roof edge,
  windows per floor in warm gold and a few cool, antennas, pink neon strips), and between and over
  them each frame: cars' head and tail lights along every street (hidden behind buildings in front),
  each van as a small lit box facing its way with headlights and tail lights, a glowing trail behind
  and dashes running ahead, then the buildings, then a faint see-through line and light for every
  van (so none is lost behind a tower), windows breathing, rooftop lights blinking, neon pulsing, the
  hub's hexagon, turning ring, rings going out and beam, beams over the shops (violet on the way, gold
  delivered, with a gold tick), and name pills with a leader line for vans on the move. The city
  lights up outward from the hub when first seen. 10 blocks a side (8 on phones); on narrow screens
  the far corners run off the sides so the city fills the card.
- **Tested:** `scripts/checks/live-ui.mjs` on Trace tracking (draws, axe, no sideways scroll, 390 and
  1280, light and dark); looked at on a phone and a desktop; typecheck, lint, unit tests, lean.

## M52 · The "Globynk" colours everywhere, a dotted planet and 3D wallet cards (31 Oct 2026)

The owner sent two videos ("Orbit": a dotted planet, cohort cubes, a light funnel; "Ledgerline": a
3D bank card that sways and tilts) and the "Globynk" picture (Aqua Jade #74FFED, Midnight Abyss
#171F44, Baby Pink #FE81D1): "put the animation where you think will be suited… ultra realistic and
make website colour like this… for whole app and website".

- **Colours** (replaces M34's warm graphite; the squircle cards and pills stay): a one-off script
  mapped every hard-coded Karma colour in `src` (hex and rgb, ~1,500 places) to its navy / pink /
  aqua twin; then by hand in `globals.css`: indigo / violet / purple are a navy scale (600 = #2b3568,
  900 = #171f44), zinc cool greys, pink is Baby Pink at 500 (600 #c13a92 and deeper hold white text),
  fuchsia an orchid, and a new `aqua-*` scale (300 = Aqua Jade, 700 reads on white). Tokens in the
  "M34 → M52" part: dark page #171f44 with Aqua Jade rising from the bottom (`.ambient-bg`, kept low
  enough for grey text to read at 4.5:1), cards #1d2650; light page #e9eef8 with the same glows; the
  side menu deep navy with pink at the top and aqua at the bottom; **`.btn-primary` is a Baby Pink
  pill with navy text in both themes** (7:1); the landing's `primary` and the top bar's "Get started"
  too. Focus rings are aqua in dark mode. The frosted headline cards: dusk is navy sinking into deep
  aqua, gold (name kept) a pale aqua. The live cards, the hub / Trace hero, the river of light (pink
  with a few aqua strands), the app icon (navy, Baby Pink U), the launch screens (re-made with
  `scripts/gen-launch-screens.mjs`), the bar colours, `manifest.json`, `offline.html` and the logo.
- **Picture tones renamed** (`src/components/live/canvas.ts`): `TONES` is now pink, blue (periwinkle),
  aqua, white; old `violet` → `blue`, old `gold` → `aqua` (Tank's `gold` too).
- **The planet** (`src/components/live/Planet.tsx`, canvas, `useLiveCanvas`): a jittered Fibonacci
  lattice of 5,000–14,000 points, all land points kept and every third sea point, land read from the
  Trace maps' Natural Earth outlines (`engine.ts`, loaded lazily, drawn once into a 512 px Mercator
  mask); lit from the top left, the far side faintly through, an aqua atmosphere and body drawn once
  per size, a random net, a glint, ripples landing every 0.9 s, Baby Pink arcs (great circles lifted
  by distance, hidden behind the globe, a light running along) between labelled places (pills on
  the canvas, a list for screen readers). The pointer leans it. **Where:** the landing's new
  "One account. One planet." section after the hero (`src/components/landing/WorldSection.tsx`:
  navy into aqua like the picture, a pink "Start free", two frosted notes) and the hub's hero (the
  five apps with their totals; replaced the M48 constellation there).
- **The wallet cards** (`src/components/hub/WalletCards.tsx`, at the top of the Impact Wallet on
  /hub): four cards (Impact with the four apps' numbers as embossed groups, Trace points, CO₂ saved,
  people helped) in navy, pink, aqua and periwinkle finishes with a metal chip, a hologram that turns
  colour as the card turns, a light that slides over it and a shadow that moves the other way; the
  stack sways slowly (the video's `-10 + sin(t/2300)·9`, `8 + cos(t/3100)·4`) and leans to the pointer
  or a finger; thumbnails bring a card to the front; the panel beside it says the same in text. Time
  runs only while on screen; Reduce Motion holds it at an angle. Styles: `.wcard*` in `globals.css`.
- `useLiveCanvas(draw, wake)`: a changed `wake` draws one more frame even when still (the planet's
  land arriving with Reduce Motion on).
- **Rules for code that builds on it:** no new hard-coded graphite or hot pink: navy from the
  indigo / zinc classes or `#171f44`, pink from `pink-*` (text on Baby Pink is navy, never white;
  white text needs pink-600 or deeper), aqua from `aqua-*` (as text on light backgrounds only
  `aqua-700`). Picture colours only from `TONES`.
- Left out on purpose: the cohort cubes and the funnel's glass bars from the "Orbit" video (the M48
  funnel already streams light through stages); the link-preview pictures (`public/og*`) keep their
  old colours (they're photos of the screens).
- **Tested:** `pnpm check` (types, lint, 1,362 unit tests, lean); `scripts/checks/live-ui.mjs` (now
  also the wallet cards; every live card draws, axe-clean, no sideways scroll, 390 / 1280, light and
  dark); the new `scripts/checks/world-ui.mjs` (the landing's planet draws; the landing and sign-in
  pages axe-clean as whole pages at 390 / 1280). Looked at in the browser: the landing, the hub's
  planet and cards (phone and desktop, light and dark), student home, Trace's city. Not run through a
  full build (no server changes).

## M53 · Light mode in the owner's second palette (31 Oct 2026)

The owner sent a second palette picture ("Visualize your mind in motion": Marshmallow White, Galactic
Violet, Bubblegum Pink): "for the light mode use this colours". Dark mode keeps M52 (navy, aqua, Baby
Pink). The video's labels didn't match its swatches (#105BFF is a blue, #FE8500 an orange); the
colours actually shown were measured and used: **violet #533FF6, pink #EC74CE**, white #F0F0F0.

- **How:** `html:not(.dark)` in `globals.css` re-points the Tailwind scales for light mode only:
  indigo / violet / purple → a Galactic Violet scale (600 = #533ff6, 700 = #3f2bd6 for text), pink →
  Bubblegum (500 = #ec74ce; 600 #c23d98 and deeper hold white text), fuchsia → an orchid between them,
  zinc / slate / gray → neutral greys. `.dark, .on-dark` puts the navy scales back for dark parts of a
  light page (the side menu, live cards, the landing). The light tokens (`:root` in the "M34 → M52"
  part): page #f0f0f0 with pink low on the left and violet low on the right (`.ambient-bg`), white
  cards with a violet-tinted shadow, ink #141320, black selected pills (like the picture's "Let's
  Connect"), violet focus ring and tint. **`.btn-primary` in light mode is Bubblegum Pink with ink
  text** (white text on that pink would be 2.6:1). Frosts: dusk is the picture's pink-into-violet
  band (deep enough for white text), gold a lavender frost. The side menu, the hub / Trace hero and
  the live cards are violet-black with pink and violet glowing up from below in light mode. The light
  river is pink and violet. Bar colour, launch screens, offline page and recovery screen use #f0f0f0.
- **Rules for code that builds on it:** a light-only colour goes in `html:not(.dark)` (or a plain
  class with a `dark:` partner); `aqua-*` is dark mode's colour: in light mode use `violet-*` (e.g.
  `to-violet-500 dark:to-aqua-400`). Text on Bubblegum or Baby Pink is ink or navy, never white.
- **Tested:** `pnpm check` (types, lint 0 errors, 1,362 unit tests, lean); `scripts/checks/live-ui.mjs`
  (every live card and the wallet cards, 390 / 1280, light and dark: all pass); whole-page axe in light
  mode on the student, teacher and admin homes, hub, Green, Relief, Play and Trace at 1280 and four of
  them at 390: no serious problems. Looked at the student home and hub in light and dark.

## M54 · More Aqua Jade in dark mode (31 Oct 2026)

The owner, on M52: "there is way less aqua jade colour in there". Pink had been every accent; aqua was
only the faint glow.

- **Now (dark mode only; light mode keeps M53's violet and pink):** pink is the action (the main
  button, live dots, arcs); **Aqua Jade is everything chosen, pointed at or highlighted.** Selected pills
  and the round arrow buttons are Aqua Jade with navy text (`--pill-on-bg`); `indigo / violet / purple`
  200 and 300 are aqua in `html.dark` (so the ~350 `dark:text-indigo-300` accents and the side menu's
  icons read aqua); accent text with no dark colour of its own and the `bg-indigo-500/10…` icon tints
  are aqua; outlined buttons have an aqua edge; the side menu's chosen entry an aqua edge and glow; the
  tab thumb glows aqua; chart lines and bars are aqua (`.ins-cell`), pink stays for what matters;
  hovered cards get an aqua edge and every card a faint aqua top line; links (`--tint-text`) and
  badges are aqua; the river is half aqua; more aqua rises in the page's bottom corners; the landing's
  section labels have aqua dots. All in the "M54" part at the end of `globals.css` (scoped to
  `html.dark`, so dark parts of a light page keep navy).
- **Rules for code that builds on it:** in dark mode, an accent is aqua (`dark:text-indigo-300` or
  `aqua-*`), an action is pink (`.btn-primary`). Don't put white text on `indigo-500` in dark mode
  expecting aqua: 500 and deeper stay navy so white text keeps reading.
- Also fixed: Play's "UniVerse Play" label in dark mode was 4.4:1 (`dark:text-fuchsia-200` now).
- **Tested:** `pnpm check` (types, lint 0 errors, 1,362 unit tests, lean); whole-page axe in dark mode
  on the student, teacher and admin homes, hub, Green, Relief, Play and Trace at 1280, and four of them
  at 390: no serious problems. Looked at the student home and hub.

## M55 · The "Globynk" picture everywhere in dark mode (31 Oct 2026)

The owner sent the "Globynk" hero again: "make it like this exactly all over the project", then
"push and merge once done".

- **The page** (`.dark .ambient-bg`): fixed behind every page, Midnight Abyss at the top sinking
  through ocean blue into deep Aqua Jade at the bottom (`#171d41 → #1b2449 → #213a5f → #26566e →
  #2f7680`, an aqua bloom below the middle). The picture's own bottom is lighter, but text over it
  couldn't be read: the lightest point here keeps white text at 4.5:1. Dark grey text is a step lighter
  (`zinc-400/500/600` #c2c9e3 / #b0b8d8 / #a1aacd) so it holds lower down the fade.
- **Glass:** dark cards are 80% navy (`--card-bg`) so the fade shows through; on big screens they also
  blur what's behind them (`backdrop-filter`, only `(min-width: 1024px) and (hover: hover)`, plain on
  phones for speed). The side menu is see-through navy glass over the same fade.
- **The planet** (`Planet.tsx`) is now the picture's network globe: about one lattice point in nine is
  a knot of a net, each joined to its four nearest (deduplicated), drawn faint through the far side and
  brighter toward you, with pink sparks at a few knots, a glowing teal inside and a stronger
  atmosphere; the land is a soft texture underneath.
- **Website:** the "One account. One planet." section uses the picture's exact colours down to a
  bright aqua horizon, then fades back to navy; its notes are navy glass (`.world-glass`) dark enough
  for white text on the brightest part. The first screen and the sign-in pages have an aqua horizon at
  the foot (`.horizon`). The landing's scene tiles and a few game and chat darks that were still warm
  graphite are navy now.
- Light mode is unchanged (M53, the owner's choice).
- **Tested:** `pnpm check` (types, lint 0 errors, 1,362 unit tests, lean); `scripts/checks/world-ui.mjs`
  (the landing's planet draws; landing and sign-in axe-clean at 390 / 1280); whole-page axe in dark mode
  on the student, teacher and admin homes, hub, Green, Relief, Play and Trace at 1280 and four of them at
  390, and light mode on two: no serious problems. Looked at the hub's globe, the landing section, the
  student home and the sign-in page.

## M56 · A smoother landing, a pink river, a seamless planet, sign-in on one screen (31 Oct 2026)

The owner: the site lags on scroll and "the background line stop the animation and get stuck"; make
the line pink; the planet section's background ends in a line ("make it look seamless"); the scroll
story's Relief step "is not looking good"; and sign-in needs scrolling on their laptop.

- **The river froze for good** (`LightTrail.tsx` `loop`): M46's check held it still once frames came
  more than 28–34 ms apart, and never let go. A busy scroll, or a browser held at 30 frames a second
  to save battery (Chrome's Energy Saver, Safari's Low Power Mode), tripped it. Now: lighter (half the
  strands, 30 a second) when frames are late or the river's own drawing (`cost`, timed round `draw`)
  is over 6 ms, back to full after 15 s with room again; held still only for the river's own cost
  (over 10 ms when lighter, M46's budget phone) and only for 10 s, then 20, 40…
- **A third cheaper a frame** (measured alone, drawing and painting: 31 → 21 ms in the cloud's
  software browser): 84 strands, not 120 (a little brighter each); square ends and corners on the thin
  strands; the river's middle and width worked out once a frame for all strands (`ys`/`cs`/`ss`);
  pulses drawn as short dashes in one path instead of dashing every whole strand twice; sparks in three
  fills. Batching strands into fewer strokes didn't help (it's the painted area), so don't.
- **Pink:** `DARK` is all Baby Pink, blush to orchid, with pink sparks and pink-white bends (M54's
  aqua half is gone from the river only; aqua stays everywhere else). Light mode unchanged.
- **Scroll story** (`ScrollStory.tsx`): each picture's `Live` box is full width; bare, it shrank to
  its widest label inside the flex layer, so Relief's radar (sized in %) vanished and its chip wrapped
  word by word. The words sit in a `.text-pool` (a navy pool behind them, `isolation: isolate`). The
  Relief radar is navy, not near-black; its count rolls inside its own line; the chip doesn't wrap.
- **Planet section** (`.world::before` in `globals.css`, `WorldSection.tsx`): the background moved to
  a pseudo-element (so a mask can soften it without fading the planet), the aqua fades to transparent
  over the last quarter and toward the sides, with more room below the notes (`pb-28 md:pb-40`). The
  river shows below it instead of starting at a hard line.
- **Sign in on one screen** (`(auth)/layout.tsx`, `AuthShowcase.tsx`, `login/page.tsx`): the left side
  is sticky at screen height and never sets the page's height; its picture shrinks with the screen
  (`.auth-scene`: 0.8 under 960 px tall, 0.65 under 860, 0.55 under 760, hidden under 700); the new
  `short:` variant (`@custom-variant`, max-height 860 px) tightens the spacing and hides the "welcome
  back" tag. Fits at 1280×720, 1440×745 and up (the local-only demo buttons aside). Sign up is
  longer and still scrolls on short screens.
- **Rules for code that builds on it:** don't bring back a permanent freeze in a canvas loop; judge by
  the drawing's own cost. A scene in a flex parent needs a full-width box.
- **Tested:** `pnpm check` (types, lint 0 errors, 1,362 unit tests, lean); `world-ui`,
  `landing-story-ui` and `landing-pause-ui` (axe-clean at 390 and 1280, nothing sideways); timed the old
  and new river alone; looked at the story's Relief step, the planet section and sign-in at four sizes.

## M56a · Nothing slows or stops the river by itself (31 Oct 2026)

The owner, after M56: "remove whatever you made here to slow down the lines or website or
smoothness… just now it happened to me for no reason".

- `LightTrail.tsx`: the busy check is gone (no `lite`, `calm`, `avg`, `cost`, timers: M46's "lighter,
  then still" and M56's softer version), and so is the low-memory check (`lowEndDevice()`) for the
  river. It always draws every strand: 60 frames a second on computers, 30 on phones (a fixed rate,
  kept), nothing while the tab is hidden, still only for Reduce Motion. M56's cheaper drawing stays.
- **Rule:** don't add any automatic slow-down, thinning or freeze to the river again without the
  owner's yes. If a budget phone struggles, make the drawing cheaper instead.
- **Tested:** `pnpm check` (types, lint 0 errors, 1,362 unit tests, lean); the river alone in a
  browser with every frame faked as very slow keeps moving.

## M57 · Darker navy with Aqua Jade glows; no line under the landing's hero (31 Oct 2026)

The owner sent the landing between the hero and "One account. One planet.": a hard line there, and
"the blue colour is really light… use more dark blue colour with aqua jade colour for the project".

- **The line:** `.horizon` (the hero's foot and the sign-in pages) centred its aqua glow below the
  section's bottom, so the section cut it off at full strength. Its glows now end inside it
  (`transparent 100%` at the ellipse's edge, above the bottom). Rule: a glow on a section that
  scrolls must fade to nothing before the section's edge.
- **Darker, dark mode only** (`globals.css`): the page (`.dark .ambient-bg`) is deep navy top to
  bottom (#0f1536 → #0f2f47) with Aqua Jade glows at the foot, replacing M55's pale ocean blue;
  `--background` #11173a; cards `rgba(22,30,66,0.82)`; `--karma-dusk` / `--karma-gold` and
  `.trace-hero` (the hub's and Trace's big cards) deep navy with an aqua glow; the landing's
  `.world::before` deep navy into dark teal with the aqua as a horizon glow; the landing and sign-in
  base `#0f1536` (`page.tsx`, `(auth)/layout.tsx`), `.text-pool` to match. Midnight Abyss #171F44
  stays for cards, menus and text on pink.
- **Tested:** `pnpm check` (1,362 unit tests, lean); `world-ui` (landing and sign-in axe-clean at 390
  and 1280); axe on the hub, student home, Green and Trace in dark mode at 1280 and 390: no serious
  problems. Looked at the hero-to-planet join, the planet section and the hub.

## M57a · A deeper navy (31 Oct 2026)

The owner: "need more dark blue". Every dark-mode navy from M57 a step deeper (`globals.css`): the
page #0a0f2b → #0b2438 at the foot, `--background` #0b1030, cards `rgba(16,22,54,0.84)`, side menu
#0a0f2b and its glass, top bar and `--material`, the frosts, `.trace-hero`, the landing's planet
section and `.text-pool`; the landing and sign-in base #0a0f2b; the website's menu bar and the sign-in
card #0d1233. Aqua Jade glows and the pink river unchanged. **Tested:** `pnpm check`; `world-ui` and
axe on the hub, student home, Green and Trace at 1280 and 390: no serious problems.

## M58 · Less AI-looking website; People list fixed (31 Oct 2026)

The owner: "make this website… look much less ai but don't change any animations or transitions
and also see if any errors or bugs are there".

- **Live errors** (production `error_reports`): one real one, `GET /api/core/owner/people` "too many
  SQL variables" (the console's People tab, after the sample world added many people). Prisma's D1
  adapter batches relation lookups at 98 ids, and a lookup with its own filters (the last sign-in:
  `orderBy` + `take: 1`) adds bound values on top: over D1's 100. Fix (`modules/owner.ts`): the page's
  200 ids first, then their details 90 at a time, put back in order. Same shape in `calls.ts`' call
  history (`participants: { where, take: 1 }` per conversation): `take` 100 → 90. **Rule:** a
  `findMany` of more than ~90 rows that selects a relation with its own `where`/`take`/`orderBy`
  must chunk its ids by 90. The other open rows (ids `smp…`) are the sample world's made-up errors.
- **Less AI-looking** (impeccable's craft floor: no eyebrows, no gradient text, mono only for data):
  every `Tag` eyebrow above a heading removed (landing sections, scroll story, sign-in, sign-up,
  `AuthShowcase`; the helper is deleted from `bits.tsx`), the hero's sparkle line and Statement's
  "| what UniVerse is" gone; word labels and notes in Urbanist instead of mono (numbers, wpm, scores
  stay mono); `Accent` is solid `text-pink-200` italic serif (still the brand's italic word, no
  gradient); the `primary` button lost its pink glow (inset highlight kept). No motion touched.
- **Tested:** `pnpm check` (1,362 unit tests, lean); looked at the landing hero, story and FAQ.

## M58a · Teacher home duplicate-key warning (31 Oct 2026)

A crawl of every page (student, teacher, admin) found one real bug: `/teacher` logged React's
"two children with the same key" when two live-ticker lines were identical (e.g. two recent
submissions both "Alice Johnson · Introduction to Computer Science · 60%"). The `Ticker`'s hidden
screen-reader list keyed each `<li>` by its own text (`LiveCard.tsx`). Keyed by position instead.
The rest of the crawl was clean (the Trace insights/tracking 403s are the no-brand message by design;
the other "did not load" lines were the local dev server running low on memory, not app faults).
**Tested:** the warning is gone; `pnpm check` (1,362 tests, lean); `landing-story-ui` green.

## M59 · Trace Live globe (31 Oct 2026)

The owner asked to bring in the open-source "God's Eye View" 3D globe. That app is a heavy
surveillance-style globe (Cesium/Google keys, metered; tracks planes, ships, number-plate cameras)
that doesn't fit Trace (product passports) or a platform with children, so we took the *idea* only
and built a Trace-native version from parts already here — no new dependency, no keys, no cost.

- **New tab `/trace/globe`** (`GlobeView.tsx`, page, `TraceTabs` entry): the brand's shipments on the
  existing `Planet` (`src/components/live/Planet.tsx`), reusing `GET /trace/map/tracking` (so the
  sample answer already exists — no new sample route). Polled with `useActivePoll` while active.
- **Mapping** is a pure function, `globeFromShipments` (`src/lib/trace-globe.ts`, one unit test):
  each shipment's current position → a point (pink on the move, aqua at rest), its destination → an
  aqua point, an arc between them; a cold-chain shipment over its limit is flagged in its label.
- **Rule:** reuse `Planet` for any "points on a 3D globe" need; feed it `Place[]` + index-pair arcs.
- **Not done here (owner asked to see it first):** a separate off-site demo of live aircraft dots
  from a free no-key source. And the Candour-style "Green Pass" in UniVerse Green.
- **Tested:** `pnpm check` (1,364 tests, lean); `/trace/globe` axe-clean at 1280, no console errors;
  looked at it in sample mode (shipments plotted and labelled on the globe).


## M60 · Green Pass and "how did it go?"; the live-aircraft demo (31 Oct 2026)

The owner's remaining two picks from the batch ("please do this").

- **Green Pass** (`PassSection` in `src/components/green/GreenApp.tsx`, under the hero on `/green`): a
  collectable card. Tier from the CO₂ saved (`PASS_TIERS`: Seedling 0, Sprout 25, Sapling 100, Grove
  500, Forest 2,000 kg), a stamp per kind of action ever logged (8 to collect), a member number
  hashed from the account id (never the id itself). Pure logic `greenPass()` in `src/lib/green.ts`
  (unit test). Leans toward the mouse (transform only; not on touch, not with Reduce Motion). No new
  route: it reads `GET /green/me`.
- **"How did it go?"**: after logging, Easy / Okay / Hard / Skip under the Log button. Migration
  **0187** `green_actions.feeling`; `POST /green/actions/:id/feeling` (only on your own action,
  `oneOf(FEELINGS)`). `GET /green/me` adds `easiest` (`easiestKind()`: the kind with the most "easy",
  at least two), shown on the Pass with "Log it again" (picks that kind in the form). Each action in
  "What you did" shows "felt easy" etc. Sample mode: `sampleGreenMe` has feelings and `easiest`; the
  POST falls through to the sample write catch-all.
- **Live-aircraft demo (not in the app):** a private page, https://claude.ai/artifact/GTsMpvx63QWjGrLNi2i4Ac
  (also sent to the owner as `live-sky-globe.html`). Planes as pink dots with 10-minute streaks on a
  dotted globe in the Globynk look; land from a 0.5° bit mask made from `public/geo/world-110m.json`.
  Data: OpenSky Network `GET /api/states/all` (no key; anonymous ~400 credits a day, 4 per call, so
  every 2 minutes, planes moved along their course in between). Where outside data is blocked (the
  Claude viewer, this cloud container) it shows clearly labelled made-up flights between 40 real
  airports. **Before it could ship:** OpenSky allows non-commercial use only; the fit is Trace (air
  freight) near the brand's own shipments, via a server route with caching, never the browser
  hitting OpenSky per visitor.
- **Tested:** `pnpm check`; the feeling route by hand (own action ok, bad value 400, someone else's
  404); `/green` in the browser at 390 and 1280, light and dark: log → prompt → Easy → saved, axe
  clean, no sideways scroll, no page errors. Test rows removed.

## M61 · More of Candour in Green: honest feedback, a share nudge, a streak reminder (31 Oct 2026)

The owner: "add more features of candour, I really want those". Candour (candour.app) is a café tool:
loyalty stamps, private feedback that reaches the owner before a bad review, happy customers nudged
to share, a reward for leaving feedback, reminders to come back, insights for the owner. Adapted:

- **"What made it hard?"**: answering "Hard" saves at once, then asks for a short private note
  (migration **0188** `green_actions.feelingNote`, ≤300 characters, only with HARD; same route
  `POST /green/actions/:id/feeling { feeling, note }`). Nobody sees it except the owner console.
- **Share nudge**: "Easy" offers "Share your Green Pass?" (Web Share, else copy text + `/green` link;
  no public page, so no names leave the app).
- **Feedback earns a badge** (Candour's free stamp): `honest` in `BADGES`, 5 answers
  (`GreenTotals.feedback`, counted in `greenMe`).
- **Streak reminder** (Candour's "come back"): daily job `green-streaks` (`greenStreakNudges`): people
  who logged yesterday but not yet today get one in-app notification (`email: false`, at most 450, ~11
  queries). No push yet (would be a query per person).
- **Owner console → Analytics → "How Green feels"** (`GET /owner/green-feel?days=`, owner only): Easy /
  Okay / Hard per kind (hardest first), answer rate, the latest 30 notes. No names, emails or places.
- **Not done (needs accounts/money, [owner]):** Apple / Google Wallet passes (Candour's lock-screen card).
- **Tested:** `pnpm check` (1,367 tests; new server test for the note rules); `/green` at 1280 dark and
  390 light: Hard → note → saved; Easy → share step → copied; axe clean, no sideways scroll. The
  console panel's SQL was run on the local database; the panel itself was not opened in a browser
  (owner sign-in needs the full build).

## M62 · Security review and the first fixes (31 Oct 2026)

The owner: "check if the security of the system is good or not or if anyone can hack my website".
A read-only review (the `universe-security` checklist) found the basics solid (sign-in checks, demo
tokens off in production, central access rules, `?` placeholders everywhere, upload and CSP
hardening, no committed keys) and these holes. Fixed here:

- **Stripe webhook** (`src/app/api/webhooks/stripe/route.ts`): Stripe's library accepts an event
  signed with an *empty* secret, so with `STRIPE_WEBHOOK_SECRET` unset anyone could fake a payment or
  a subscription. Now 503 without a secret (like Razorpay). The old `transactionId` branch (student
  accounting) now completes a payment only if the session is `paid` with the same amount and
  currency.
- **LMS (LTI) linking by email** could let any admin (or approved NGO rep) register a fake LMS and
  sign in as any non-admin account. Turning `trustEmails` on is now owner-only (POST and PATCH in
  `src/app/api/lti/platforms`).
- **Public receipt** (`/api/receipts/[id]`) no longer returns the payer's email (page updated).
- **Student documents** (`privateLink`, `src/server/private-files.ts`): only their owner or an admin
  of *that person's school* (`schoolsOf` / `inSchools`), not any school's admin.

**Still open (next):** the Next.js update (critical advisories, needs a full build test);
`pdfjs-dist` 5 → 6 and `zod` 3 → 4 (major versions: own item with testing); rate limits keyed on any
made-up `Authorization` header (`cloudflare/worker.ts` `rateLimited`); approved organisation reps
become admins with no school (`applications.ts`), so they cover everyone without a school; the
admin sign-in code's 5-tries lockout lives in one server's memory; the certificate PDF takes the
token in the address. **[owner]:** check `STRIPE_WEBHOOK_SECRET` is set in Cloudflare; add the
"Private files" rule (DEPLOY-CLOUDFLARE.md); keep `SESSION_SECRET` until the LMS fix is live (done
now); turn on Bot Fight Mode.

## M64 · Every PRO feature free for the owner (31 Oct 2026)

The owner: "in owner console every pro feature should be free". The code already meant it
(`isPro = plan === 'PRO' || u.owner`, billing's `user.owner ? 'ENTERPRISE'`, school admin tools'
`user.owner`), but router handlers get the resolved `User`, which never had `owner` set (only
`getSessionUser` sets it), so the owner saw "FREE · YOUR PLAN" and "Talk to us about PRO".
`src/server/router.ts` now sets `owner = true` on the owner's own user object (only when
`isOwner(user)`: a verified Google sign-in with the owner's email). **Rule:** handlers may trust
`user.owner`; never set it anywhere else.

## M63 · The landing: no repeated scroll story; each section arrives its own way (31 Oct 2026)

The owner (screenshot of the scroll story showing Relief's words beside UniVersity's picture): "remove
this part… in the start it is same, and below this all the details need ultra smooth animations which
are unique". The scroll story (M44, `ScrollStory.tsx`) repeated the hero's five pictures and
headlines, and mid-scroll could pair one app's words with another's picture: **removed** (file deleted).

Every section below used the same fade-up (`Reveal`). Now `bits.tsx` has `Motion kind="…"` around a
section and every `Reveal` inside follows it: `tilt` (tips up like a card set on a table), `sweep`
(glides in from the reading side; mirrored in RTL), `fan` (alternate sides with a slight turn), `depth`
(settles forward), `mask` (rises out of a clipped line), `scrub` (tied to the scroll through a spring),
`up` (default). Transform and opacity only; Reduce Motion keeps the fades (MotionConfig "user", and
`scrub` reads Reduce Motion itself). Assignments are in `src/app/page.tsx`, one kind per section and
no two neighbours alike. **Rule:** a new landing section picks a kind its neighbours don't use.
Tested: scrolled the whole page at 1440 and 390: nothing left invisible, no sideways scroll, no errors.

## M65 · Maps: sharp, not glowing, and smoother to move (1 Nov 2026)

The owner (Market map screenshot): "the light here is too much, make it professional and sharp…
the maps are not smooth, make it ultra smooth in all the maps".

- **Glow:** scan halos were drawn with additive blending (`lighter`), so close places burned into one
  white blob. Now plain blending, about half the size and a third of the strength (`MarketMap.tsx`).
- **Smoothness (`WorldCanvas.tsx`, every map: Trace market and tracking, Relief, Green):** each frame of
  a drag, pinch, wheel or glide used to redraw every country *with a blurred shadow*. Now the land
  picture is drawn once and, while the map moves, only slid and scaled (`paint(t, busy)`); a quick
  draft with a 35% margin is drawn when it no longer covers the screen, and the sharp one when the map
  rests (`busyUntil`, `touch()` on every hand movement). The blurred shadow is replaced by a 1.6 px
  offset fill (crisp edge, no blur). Tracking lines: a wide faint stroke under a crisp one instead of
  `shadowBlur` every frame.
- **Rule:** never `shadowBlur` or `filter` in a map's per-frame drawing; draw a second stroke instead.
- **Tested:** `pnpm check`; the market map in sample mode looks right (halos subtle, labels readable).
  Frame timing could not be judged here: this container's browser has no graphics card, so every
  full-screen canvas is slow regardless (old and new measured the same).

## M66 · Fleet in motion: zoomed in, a camera, real cars, at the bottom of Tracking (1 Nov 2026)

The owner (screenshot): "needs to be zoom in, can't see anything… more realistic and functional…
animations of car… put this at bottom section of the tracking".

- **Moved** to the end of `TrackingMap.tsx` (after "Journeys today"), taller (420 / 560 px).
- **Camera** in `CityView.tsx`: opens zoomed in on the hub (1.7×; 1.35× on phones), fewer blocks (9 /
  7) so buildings are bigger; drag to move (a finger only sideways so the page still scrolls), pinch,
  ctrl/⌘ + scroll, double-click, and + / − / fit buttons. The camera eases to its goal each frame
  (`cam`, `zoomAt`, `clampGoal`); the ground and building pictures are redrawn sharper for the zoom
  (`res` = dpr × zoom step, capped at 3) only once the zoom rests. Labels are drawn after the camera,
  on screen, so they stay the same size.
- **Cars:** 56 small lit boxes (body colour, glass roof, a dark side) driving their lanes with head
  lights ahead and pink tail lights; drawn before the buildings, so towers in front hide them.
- **Tested:** `pnpm check`; `/trace/tracking` in sample mode at 1440 and 390: city last on the page,
  zoom in and drag work, axe clean, no sideways scroll, no errors.

## M67 · Trace's Live globe made useful (1 Nov 2026)

The owner (screenshot of overlapping labels on a net-covered globe): "this globe doesn't feel useful at
all… make it functional… more detailing… ultra smooth".

- **`Planet` has an `interactive` mode** (other uses unchanged): drag to turn (a finger sideways only,
  so the page scrolls), pinch / ctrl or ⌘ + scroll / + − buttons to zoom (1–3.2×, eased), `focus` turns
  it the short way round to a place (eased, stops the idle spin), no net, sparks or pings, land dots
  brighter (continents read clearly), names only on `selected` places and the one pointed at,
  `onPick` on a click. Rotation is now stateful (`cy`/`cp`), not time-based, in that mode.
- **`GlobeView`**: the globe beside the shipments list (click one, or its point on the globe) and the
  chosen one's card: product, batch and units, from → to, time left, distance left, speed,
  temperature against its limit (red when over), "Open in Tracking". Opens on the first shipment on
  the move. `globeFromShipments` also returns `at` (each shipment's point) and ETAs read "3 h 26 min"
  (`minutesText`, tested).
- Fixed: duplicate React keys in `Planet`'s screen-reader list when two places share a name.
- **Tested:** `pnpm check` (1,368 tests); `/trace/globe` in sample mode at 1440 dark and 390 light:
  picking a shipment turns the globe and fills the card; axe clean, no sideways scroll, no console
  errors.

## M70 · "UniVerse explained": twice as wide, nothing colliding, zoom out to see it all (1 Nov 2026)

The owner: "the whiteboard of universe explain has glitched… some tables are colliding… make it
like twice the size… add more zoom out… I should be able to see it fully".

- **Zoom out to 2%**: Excalidraw stops at 10% (`MIN_ZOOM`). A pnpm patch
  (`patches/@excalidraw__excalidraw@0.18.1.patch`, `patchedDependencies` in the root `package.json`)
  sets it to 0.02 in both its dev and prod builds. **Upgrading Excalidraw: redo the patch** (`pnpm
  patch @excalidraw/excalidraw@<v>`, change `MIN_ZOOM`, `pnpm patch-commit`), or the board can't be
  seen whole again.
- **Twice as wide** (`guideElements`): W = 2 × the banner (34,140); the hand-made bands sit side by
  side in pairs and `packed(…, W)` makes half as many code bands, so the board is 34,140 × 22,901
  (was 17,070 × 37,845) and fits a screen at about 3.5%.
- **No colliding boxes**: wrapping assumed 0.6 em a letter, too little for the hand-drawn font, so
  Excalidraw wrapped again and grew boxes into the ones below. Now 0.68 em (`EM`), and `fit()` lowers a
  box's text size (down to 12) until it fits the box's height. Measured with a throwaway script: no
  frame overlaps, no box whose text needs more height than it has (only arrow labels and the Venn's
  intended overlap remain).
- **To see it:** owner console → Explain UniVerse → **Make a fresh one** (an existing board keeps its
  old positions; ids are unchanged so top-ups still work).
- **Not checked in a browser here** (the board needs the owner's sign-in and the board server).
  Excalidraw draws every shape each frame, so with ~1,300 shapes very low zoom is as smooth as
  Excalidraw allows; nothing else was changed for speed.

## M69 · Live air traffic on Trace's Live globe (1 Nov 2026)

The owner: "also add aircraft globe in the app" (after the off-site demo, M60).

- **`GET /trace/aircraft`** (`src/server/aircraft.ts`, signed in): OpenSky Network's `states/all`, no
  key, kept 15 minutes in memory and in Cloudflare's cache (`caches.default`), so the whole site asks
  at most ~96 times a day (anonymous allowance ~100). Trimmed to airborne planes with a position,
  rounded to 0.01°, at most 4,000 (`planesFrom`, `src/lib/aircraft.ts`, tested): `[lat, lon, track,
  speed m/s, altitude m]`, no call signs. On failure: the last planes (or none) and a note, retried
  after 2 minutes. Sample mode: `sampleAircraft()` (1,600 made-up flights between 32 airports).
- **Owner switch "Live air traffic"** (`aircraft` in `FEATURE_SWITCHES`) turns the route off.
- **UI:** an "Air traffic" toggle on `/trace/globe`; `Planet`'s new `swarm` draws each plane as a dot
  with a 90 km trail, moved along its track (`ahead`) every half second since the data's time.
  Name pills on the globe no longer overlap (stacked).
- **[owner]:** OpenSky's terms allow non-commercial use only; for a paid product ask them or move to a
  paid feed. This container can't reach OpenSky, so the live feed was only seen failing gracefully
  ("did not answer"); sample mode shows the planes.
- **Tested:** `pnpm check` (1,370 tests); `/trace/globe` at 1440 and 390: toggle on, 1,600 planes
  drawn, axe clean, no sideways scroll, no errors.

## M68 · Collaborate simpler (8 tabs → 5) with 16 new tools (1 Nov 2026)

The owner: "add more features in the collaborate section and merge few sections because it is becoming
too complex… at least 15 more features… apple notes, word, pdf, sheets, presentation, canva, editing
and coding apps like vs code… and some more small features".

- **Tabs** (`COLLAB_TABS`): Home (also `/spaces`, linked from Home's intro), **Create** (`/studio`, also
  `/docs`, `/boards`, `/sheets`, `/slides`), Files, Code, Tasks. Create opens with "Make something
  new" (documents/sheets/slides, whiteboards, code), then the tools in groups.
- **16 new tools**, all in the browser (nothing sent anywhere), opened as `/studio?tool=<id>`:
  Write: Quick notes (`QuickNotes.tsx`, Apple Notes-like: pin, colour, search, `[ ]` tick boxes, kept
  on the device, "Make it a document"), Word count (reading/speaking time, most-used words), Clean up
  text (case, spaces, sort, de-duplicate), Compare texts (line diff), Markdown preview (sandboxed
  iframe, copy HTML). PDF: Join PDFs, Take pages out (`1-3, 5, 8-`), Pictures to PDF (`PdfTools.tsx`,
  pdf-lib loaded on use). Sheets: Table tools (paste from a spreadsheet or CSV → column totals and
  CSV / JSON / Markdown). Design: Colour palettes (4 harmonies or from a photo), Gradients (CSS and a
  1920×1080 slide background), QR codes (`encodeQr`), Record the screen (`getDisplayMedia` → .webm).
  Code: JSON formatter, Regex tester, Encode/decode (Base64, URL). UI in `QuickTools.tsx`; logic in
  `src/lib/quick-tools.ts` (tested).
- **Not done:** notes syncing between devices (they live in the browser, by design; "Make it a document"
  is the way to keep one), and a real-time co-edited notes app (Docs does that already).
- **Tested:** `pnpm check` (1,375 tests); `/studio` at 1440 dark and 390 light: five tabs, Quick notes,
  Word count, Compare, Table tools, Colours, QR, Regex and Join PDFs opened and used; axe clean on the
  tools (the only flags left were page chrome under the moving background, varying run to run).

**Next.js update tried and undone (1 Nov 2026):** `next` 16.4.2 builds, but the built Worker answers
500 on every page ("Unexpected loadManifest(/.next/server/preview-props.json)"): the Cloudflare
adapter `@opennextjs/cloudflare` must be updated with it (latest 1.20.15). Reverted on the branch, so
`main` stays on 16.3.8 until both are updated together and checked with `local:build` + `local:serve`.

## M71 · 29 more tools in Collaborate → Create (1 Nov 2026)

The owner: "just add more features in the collaborate section… at least 25 more". Create now has 51
tools in six groups (Write, PDF and files, Sheets and data, Present, Design and media, Code), all in
the browser; nothing is sent anywhere (except Dictation, which uses the browser's own speech service).

- **Write:** Find and replace (case, whole words), How easy to read (Flesch ease, grade), References
  (APA 7 / MLA 9), Read aloud (`speechSynthesis`, voice and speed), Dictation (`SpeechRecognition`
  where the browser has it), Symbols to copy.
- **Sheets and data:** Calculator (own parser, no `eval`, history), Chart maker (bar/line → PNG), Unit
  converter (8 kinds), Percentages, Date calculator (days, weekdays, days on), Random picker and
  groups (crypto-random shuffle).
- **Present:** Quick presenter (Markdown slides split by `---`, full screen, arrow keys; slides in a
  sandboxed iframe), Countdown, Quote cards.
- **Design and media** (`ImageTools.tsx`, one canvas each, Save PNG): Resize for social (7 sizes, fill or
  fit), Collage (2–6), Profile picture (round, ring), Screenshot frame, Watermark; Contrast checker
  (WCAG AA/AAA), Colour codes (HEX/RGB/HSL).
- **Code:** Code picture, Fingerprints (SHA-1/256/512 of text or a file), Unique IDs, Password maker
  (crypto), Timestamps, Web address parts, Token reader (JWT, decoded locally only, with a warning).
- **Files:** `src/components/studio/MoreTools.tsx`, `ImageTools.tsx`, logic `src/lib/quick-tools-2.ts`
  (10 tests). `QuickTools.tsx` now exports its small parts (`Btn`, `Field`, `Out`, `area`, `copy`,
  `save`). Panels: `/studio?tool=<id>` (`img-<id>` for the picture tools).
- **Tested:** `pnpm check` (1,385 tests); all 29 opened by address at 1440 dark and 390 light: axe clean
  inside the page, no sideways scroll, the calculator answers. The one page error seen
  ("localStorage… sandboxed") comes from the test helper's init script running inside the sandboxed
  previews, not from the app.

## M72 · Collaborate → Create smoother, with 30 big tools (1 Nov 2026)

The owner: "upgrade the existing tools and features of the collaborate section with ultra smoothness and
also add more 30 features in there like big features". Create now has 81 tools in eight groups.

- **Smoother list (every tool benefits):** a search box (`/` focuses it, Enter opens the first match,
  Esc clears); group chips that glide to their group; **Starred** and **Used lately** shelves (kept on
  the device, `uv-create-stars` / `uv-create-recent`, read with `useSyncExternalStore` so the first
  paint matches the server); a tool's code starts downloading when the pointer rests on its card
  (`LOAD` / `preload` in `studio/page.tsx`), so it opens at once; the tool glides in and the list
  glides back (AnimatePresence, `spring.smooth`, exits faster; Reduce Motion: fades only); Esc goes
  back (not while typing or in a full-screen view); going back restores the list's scroll spot; cards
  lift a little on hover and press in on tap; "New" badges on the 30.
- **30 tools** (`/studio?tool=<id>`, all in the browser, their work kept on the device with `useKept`
  in `studio/kept.ts`):
  - Plan and organise (`PlanTools.tsx`): mind map (keyboard: Tab / Enter / arrows / Delete / F2; save
    PNG; copy as a list), outliner (Tab in/out, Alt+arrows move a branch, fold, tick), sticky-note wall
    (drag by the top strip, colours, votes, line up by votes), timeline/Gantt (today line, done %, PNG),
    flowchart from `A -> B: label` text (loops curve back; left-right or top-down; PNG), timetable
    (colour per subject, print), habit tracker (21 days, streaks), decision helper (weighted 1–5
    scores, ranking).
  - Study and teach (`StudyTools.tsx`): flashcards (decks, 3D flip, five Leitner boxes, paste many),
    grades (weighted average, "what I need on the rest", 4.0 GPA), revision planner (exam dates and
    hours → a day plan, warns when short, `.ics` for a calendar, print), rubric maker (click cells to
    mark: total), word search (print or play: tap first and last letter), certificate (PNG / print),
    spin the wheel (crypto-random pick, eases to a stop, optional "take the winner off"), noise meter
    (microphone level on the `Dial`, a limit, seconds too loud; nothing recorded).
  - Data (`DataTools.tsx`): graph plotter (up to six `y =` formulas, drag/scroll zoom, values under
    the pointer; own compiler with implicit times, no eval), statistics (+ histogram), data explorer
    (open a CSV, sort, filter, totals by group, save what's shown), budget (in/out by kind, Ring,
    CSV), invoice (tax, discount, print or PDF), world clock with the hours that suit everyone.
  - Make (`MakerTools.tsx`): CV builder (modern / classic, print to PDF), word cloud (spiral layout,
    PNG), teleprompter (full screen, mirror, keys), code playground (HTML/CSS/JS in a
    `sandbox="allow-scripts allow-modals"` iframe without same-origin, console shown via
    `postMessage`; inline `onclick=` attributes are blocked by the site's `script-src-attr 'none'`,
    which it says), Code 128 barcodes (SVG/PNG), hide parts of a picture (pixels / blur / black box,
    saved as a new file), slideshow video (canvas + MediaRecorder: mp4 where the browser can, else
    webm; the tab must stay open), signature pad (smooth, speed-weighted strokes; trimmed see-through PNG).
- **Logic** in `src/lib/big-tools.ts` (11 tests): `compile`, `stats`, `histogram`, `flow`, `treeLayout`,
  `wordSearch` + `seeded`, `code128` (the table is checked: 107 unique patterns, each 11 wide),
  `studyPlan`, `weighted` / `needed`, `nextBox` / `isDue`, `decide`, `wordFreq`, `spiral`, `invoice`,
  `streaks`.
- **Trap:** an `sr-only` element inside a sideways-scrolling table escapes the scroll box unless the
  box is `relative` (it made the whole page scroll sideways at 390). Paper-like sheets (white in both
  themes) use `text-[#4b5068]` for grey text, not `zinc-600`, which dark mode re-points.
- **Not done:** sharing or real-time co-editing of these tools' work (they're personal, on the device;
  Docs, Whiteboards and Code are the shared ones). The other tabs (Home, Files, Code, Tasks) were
  not changed.
- **Tested:** `pnpm check` (1,396 tests); `scripts/checks/create-tools-ui.mjs` on the dev server: the
  list (search, star, Esc, scroll kept) and all 30 tools at 1280 dark and 390 light: axe clean inside
  the page, no sideways scrolling, no page errors.

## M73 · "Too many SQL variables" fixed for every list, not just People (1 Nov 2026)

The owner forwarded the "1 problem(s) need a look" email: `GET /api/core/owner/people`, "D1_ERROR: too
many SQL variables" (production `error_reports`, 1×, 31 Oct 19:10 UTC: before M58's fix went live
that night; the email came on 1 Nov because the diagnosis ran at 08:15 UTC).

- **The real cause (checked on local D1 with 150 people):** Prisma reads a related list for all the
  rows it found in one query (`WHERE userId IN (…every id…)`). It cuts that list at 98 ids, **except**
  when the related list has its own `orderBy`, `take`, `skip`, `cursor` or `distinct`: then every id
  goes into one query, and past ~98 rows D1 refuses. A plain or `where`-only related list is cut
  correctly. M58 fixed only People; the same shape is in chat conversations, chat search, boards,
  collaborations, groups, internships, scholarships and more, waiting for a big enough school.
- **Fix, once for every query** (`src/lib/d1-split.ts` `readsOrderedRelation` / `planPages` /
  `readInPages`, run by `withListSplit` in `src/lib/db.ts`): a `findMany` with no `take` or a `take`
  over 90 that reads such a related list (at any depth) runs in pages of 90 rows, one after another,
  and the pages are joined: the same rows in the same order (skip respected, stops at a short page).
  Also inside the long-`in`-list split. M58's hand-made chunking in the People route is removed.
- **Tested:** 3 new unit tests (`d1-split.test.ts`); on local D1 with 150 people: take 140 ordered,
  no take, skip 20 + take 100, a long `in` list with a related `take`, all correct (each failed
  before with "too many SQL variables").
- **Owner:** mark the report resolved in the owner console (Errors).

## M74 · Every Create tool upgraded, and 56 more (1 Nov 2026)

The owner: "upgrade all the existing tools and add more than 50 new features and tools in the
collaborate section". Create now has **137 tools** in eight groups.

- **Upgrades for every tool** (`studio/page.tsx`): **Focus** fills the window with the tool (Esc
  leaves it first, then goes back to the list); **‹ ›** and the `[` `]` keys go to the previous or next
  tool in the same group (with "3/19"); **Copy link** (with a tick); **More in <group>** shows three
  more cards under the tool; **drop a text file** (.txt, .md, .csv, .json, code…) on any tool and it
  fills the tool's first text box (set through the native value setter plus an `input` event, so
  React hears it as typing; 2 MB cap; pictures and PDFs keep their own buttons). Copy buttons
  answer on themselves (`CopyBtn` in `QuickTools.tsx`: a tick and "Copied"), so every tool using `Out`
  got it. **Text is kept** when you leave and come back for the older text tools (word count, clean
  up, compare, table, JSON, Markdown, find and replace, readability, references, read aloud, picker,
  chart, presenter) and the calculator's history (`useKept`, keys `uv-draft-<tool>`). The "New" badge
  moved to the 56.
- **56 tools** (`/studio?tool=<id>`, all on the device; work kept with `useKept`):
  - Write (`WordTools.tsx`): journal (private, a mood a day, month view, search, download), letter
    writer (6 templates; blanks found from `[…]`), fancy letters (Unicode styles), line tools, numbers
    in words (with rupees/dollars/pounds/euros "… only"), Roman numerals, Morse (played as beeps),
    placeholder text, word play.
  - Plan and organise (`OrganiseTools.tsx`): priority matrix (drag between the four boxes), week
    planner (drag between days), goals with steps and rings, checklists (5 templates), countdowns,
    meeting notes (actions with who/when; Markdown), SWOT, pros and cons (weighted), reading list.
    Present: stopwatch (digits drawn straight to the page per frame, no re-render; laps best/worst),
    room poll (full screen), agenda timer (runs through the parts, overrun in red).
  - Study and teach (`ClassTools.tsx`): periodic table (all 118 from `src/lib/elements.ts`, places
    worked out from the atomic number; families, search, facts card), quiz maker (take it, score,
    print with an answer key), maths drill (60 s, best kept), equation solver (working shown),
    fractions, shapes (8, with formulas), number facts (HCF/LCM), seating plan (tap two to swap),
    dice and coins (crypto-random), traffic light and scoreboard (both full screen).
  - Sheets and data (`MoneyTools.tsx`): loan/EMI with a yearly schedule, savings growth (chart),
    split the bill (fewest payments), price with discount and tax (in or on top), age, BMI (with a
    "rough guide, ask a doctor" note).
  - Design and media (`MediaTools.tsx`): photo booth (camera, 8 filters, 3-2-1), pixel art (fill,
    mirror, pick, undo; 1024 px PNG), meme maker, app icon maker (5 sizes), clean a photo (finds
    EXIF and GPS in a JPEG, `jpegDetails`; re-draws a clean copy), colour-blind view (Machado
    matrices in linear light), metronome (Web Audio look-ahead scheduling, tap tempo), tuner
    (autocorrelation pitch, cents needle), focus sounds (white/pink/brown noise, timer).
  - Code (`DevTools.tsx`): number bases (BigInt; text as bytes), name styles, shadow maker, cron
    reader (words and the next 5 runs, UTC), HTML escape, hidden characters (zero-width, no-break…),
    status codes, key tester, sample data (example.com emails).
- **Logic** in `src/lib/more-tools.ts` (14 tests): Morse, `numberToWords`, Roman, `fancy`, anagram /
  palindrome, `lorem`, primes / factors / HCF / LCM, fractions, `solveQuadratic`, `loan`, `growth`,
  `age`, `settle`, `convertBase`, `nameStyles`, `cron`, HTML (un)escape, `mockRows`, `noteOf` /
  `detectPitch`, `COLOUR_BLIND` / `simulateColourBlind`, `jpegDetails`. Shared bits in
  `studio/bits.tsx` (`useFull` + `FullBtn` for full screen, `Segments`, `Stat`, `rnd`).
- **Traps:** a hook that returns an object holding a ref makes the React lint treat every field as a
  ref: destructure it (`const { ref: fullRef, full: isFull, … } = useFull()`). An `aria-label` must
  start with the button's visible text (axe): use `sr-only` text after it instead. Text on a pink
  badge is `#171f44`, not `indigo-900` (light mode re-points indigo to violet).
- **Not done:** sharing these tools' work between people (they're personal; Docs, Whiteboards and Code
  are the shared ones); the photo booth and tuner need camera / microphone permission each visit.
- **Tested:** `pnpm check` (1,413 tests); `scripts/checks/create-tools-ui.mjs --new` (the 56) and
  `--old` (M72's 30 plus 13 upgraded older tools) on the dev server at 1280 dark and 390 light: axe
  clean inside the page, no sideways scrolling, no page errors; focus mode, Esc, `]`, a dropped file
  and text kept after a reload all checked.

## M75 · Saved work on the account, sharing by link, and 55 more tools (1 Nov 2026)

The owner: "Add more than 50 plus more features in collaborate section and make bigger features and
changes in the system". The bigger change: Create's tools stop being device-only.

- **Saved work** (migration **0189** `tool_saves`, model `ToolSave`; routes `GET/POST
  /api/collab/saves`, `GET/PUT/DELETE /api/collab/saves/[id]`, `POST/DELETE
  /api/collab/saves/[id]/share`, public `GET /api/collab/shared/[token]`; checks in
  `src/lib/tool-saves.ts`, tested). Every tool that keeps work (`useKept`, ~150 of them) gets **Save
  to account** and **Share** in its bar with no change to the tool: `useKept` now lists itself while
  mounted (`keptNow()` in `studio/kept.ts`), so Save collects the open tool's latest state (`uv-…`
  keys only, 200 KB, 300 saves a person). Save again saves over the open save. Create's list shows
  **Saved to your account** (open, rename, share / stop sharing, delete; `Saves.tsx`). Opening a save
  writes it to the device and reopens the tool (a `gen` key). So work now follows the person to every
  device.
- **Sharing:** a 24-character unguessable token (`shareToken`); `/studio?shared=<token>` opens the tool
  with the shared work in its **own scope** (`KeptScope`, keys `shared:<token>:uv-…`), so a viewer's own
  work is never touched; a banner says who shared it (first name only) and **Keep it as mine** copies
  it over. Stop sharing makes the link 404 at once. Only the owner can read, change, share or delete
  a save (404 for anyone else). The shared answer has no email or id. Viewers need to be signed in
  (Create is behind sign-in). Sample mode: the list is empty and saving says so.
- **55 tools** (192 in all): Write (`PenTools.tsx`): essay planner, writing prompts with a timer, poem
  helper (syllables, haiku, rhymes), acrostic, typing practice, glossary (→ Flashcards), Cornell
  notes, interview practice. Plan (`LifeTools.tsx`): Kanban (drag, WIP limit), event planner, trip
  planner, routines (guided timer), day planner, RACI (checks one A), sleep log, OKRs, birthdays.
  Study (`ScienceTools.tsx`): times tables, spelling test (read aloud), telling the time, number line,
  Venn, history timeline, probability simulator, trigonometry, triangle solver, matrices, molar mass
  (from `elements.ts`), physics formulas. Data (`CalcTools.tsx`): line of best fit, survey size, fuel,
  pay, recipe scaler, timesheet, best value. Present (`StageTools.tsx`): bingo (cards + caller), quiz
  game board, name tags, speaking queue. Design (`ArtTools.tsx`): event poster, business cards, colour
  mixer, type scale, blob shapes, ASCII art, drum machine, piano (keyboard keys, record), photo grid.
  Code (`WebTools.tsx`): CSV to SQL (quoted safely), JSON to TypeScript, link preview tags, file
  permissions, flexbox playground, subnet calculator. Logic in `src/lib/tools-5.ts` (10 tests).
- **Traps:** a local named `X` shadows lucide's `X` icon (rename locals). Some mid colours can't reach
  4.5:1 with navy or white text: put the label on a small white chip (`inkOn` in `bits.tsx` picks
  navy or white otherwise).
- **Not done:** live co-editing of one save by several people at once (a shared link is a copy; Docs,
  Whiteboards and Code are the live ones); shares open only for signed-in people.
- **Tested:** `pnpm check` (1,425 tests); `scripts/checks/create-saves-ui.mjs` (save, list, share,
  another person opens and keeps it, stop sharing, delete; someone else gets 404; only `uv-` keys; no
  email in the shared answer; axe) and `create-tools-ui.mjs --m75` and `--old` at 1280 dark and 390
  light: axe clean, no sideways scrolling, no page errors.

## M76 · Live editing together, and view links without signing in (2 Nov 2026)

The owner, on M75's two "left out" points ("a shared link gives a copy, not live editing together"
and "people must be signed in to open a shared link"): "please do both of this and then merge".

- **Two kinds of link** (Share in a tool's bar is now a small menu; the Saved list has a view-link
  and an edit-link button each): **view link** `/s/<token>` (the `shareToken`) opens for anyone, no
  sign-in (`src/app/s/[token]/View.tsx`, built once as `/s/open`, kept out of search, no referrer):
  the work in its own scope (`view:<token>:`), read-only (changes aren't saved), re-checked every 20 s
  while in use (`useActivePoll`) so it updates by itself; "Sign in to keep a copy" (or "Keep a copy"
  when signed in) goes to the M75 copy flow. **Edit link** `/studio?edit=<token>` (new `editToken`,
  migration **0190**, with `version` and `editors`) opens the work **live** for signed-in people.
- **Live editing** (`GET/PUT /api/collab/live/[token]`, `useLive` in `Saves.tsx`, `KeptSyncProvider`
  in `kept.ts`): every tool's `useKept` part sends its own changes (`push`, after the 250 ms pause)
  and takes in others' (`sub`); nothing in the 190 tools changed. The server writes one part on top of
  the version it just read (a conditional `updateMany` on `version`, retried 4 times), so two people
  editing different parts never wipe each other; the same part: the last change wins. Everyone with
  it open (seen in the last 10 minutes) and the owner get a realtime refresh of the live address
  (every 3 s without live updates, 60 s with them, only while the tab is in use). A part changed here
  in the last 2 s isn't overwritten by an older copy coming back. A banner shows "editing live" and
  who else is there (first names, seen in the last 2 minutes; `touchEditors` writes at most once a
  minute). The owner's own Open on a save with an edit link opens it live too; Save over it bumps the
  version so everyone picks it up. Stop sharing ends both links (404 at once).
- **Registry** (`src/components/studio/registry.tsx`): the tool sets, `PANELS`, `setOf`, `preload` and
  `ToolBody` moved out of the Create page, so `/s/<token>` shows the same tools.
- **Trap:** `useKept` must never send the value it opened with (React's dev double effect did, and on
  a late join that overwrote a newer change): it keeps `synced` (the value everyone last saw) and
  sends only when the value differs from it. In a one-browser test, only the page in front counts as
  "in use" (no polling behind): bring the watching page to the front.
- **Not done:** letters merged inside one text box (two people typing in the same box: the last one
  wins, within a second); edit links need sign-in (anyone could change it otherwise).
- **Tested:** `pnpm check` (1,427 tests, incl. `mergePart`, `touchEditors`); `create-saves-ui.mjs`
  twice in a row: a view link opens signed out (axe), the copy link, an edit link needs sign-in (401),
  two people edit one mind map and each sees the other's change, stop sharing 404s both links;
  `create-tools-ui.mjs --old` (the tools after the `useKept` change).

## M77: Next.js 16.4.4 and the Cloudflare adapter 1.20.15 (security update, the council's first item)

- `next` and `eslint-config-next` 16.4.4, `@opennextjs/cloudflare` ^1.20.15, together. **Trap:** Next.js
  16.4.x with the older adapter built but answered 500 (`loadManifest` / preview props): always move
  the two together.
- The build also refreshed `guide-data.gen.ts` (the explainer board's route list now has M75/M76's
  routes); that file is meant to be committed.
- **Tested:** `pnpm check` (1,427 tests, lean 0); `pnpm local:build` + `local:serve`; the full crawl
  196/204 clean (the 8 are the known ones: Trace's no-brand 403s for a student, the calendar link's
  503 without `SESSION_SECRET`, `/parent`'s outside script unreachable from the sandbox);
  `create-saves-ui.mjs` on the built Worker (save, view link signed out, live editing, stop, delete).

## M78: security fixes from M62's open list (the council's second item)

- **Rate limits** (`cloudflare/worker.ts` `rateLimited`, `src/lib/rate-key.ts`): keyed by the account
  the token *names* (Firebase `user_id`/`sub`, a session token's `uid`, a demo token's email) together
  with the address, no longer by the token's last 40 characters. A new token each hour keeps one
  count; a made-up token gets the address's count, not a fresh one; a forged name only ever counts
  at the forger's own address (no one can use up someone else's limit from elsewhere). Not a sign-in
  check: routes still verify. **Trap:** an opaque token (an integration's API key) counts per address.
- **Admin sign-in code lockout in the database** (migration **0191**, users `twoStepTries`,
  `twoStepTriedAt`; `src/server/two-step-tries.ts`). The old in-memory count never added up (it reset
  after every wrong try) and lived on one server. Now each try is counted *before* the code is
  checked (an atomic increment), so tries sent all at once can't slip under the limit: five tries, then
  15 minutes after the last one. The right code starts the count again.
- **Organisation reps** (`applications.ts` `approveApplication`): someone approved as ADMIN while in no
  school would have been an admin of the main school (everyone without one). They now get their own
  organisation, named from the application's institution. Adding an admin to *your own* school: an
  invitation, or Users.
- **Certificate PDF** (`impact.ts` `certificates/:id/pdf`): no longer takes the sign-in token as
  `?token=` (nothing in the app used it; addresses land in history and logs).
- **Share links** (`/s/<token>`, `shared/`, `live/`): 24-character random tokens can't be guessed;
  the address and per-person limits above cover them; nothing more added.
- **Still open:** `pdfjs-dist` 5 → 6 and `zod` 3 → 4 (major versions: own item with testing).
- **Tested:** `pnpm check` (1,432 tests, incl. `rate-key.test.ts`, `two-step-tries.test.ts`, the
  no-school representative in `school-scope-people.test.ts`).

## M80: put Create work on a course (the council's "Collaborate → course" link)

- Share in a Create tool has a third choice for teachers and admins: **Add to a course**
  (`src/components/studio/ToCourse.tsx`, loaded only when opened). A sheet lists the courses they teach
  (`/api/core/courses/my`) and that course's modules; Add makes (or reuses) the save's view link and
  adds it as a LINK item (`/api/courses/<id>/modules`, `add-item`); a course with no modules gets a
  new published "Shared work" module. No new server code: the modules route's own rules decide who
  may add (only the course's teacher; others see "Only the course's teacher can add to it").
- Students open it like any course link: `/s/<token>`, read-only, always the latest version.
- **Trap:** the course list is a core route (`/api/core/courses/my`), the modules a Next route
  (`/api/courses/<id>/modules`).
- `apps/web/AGENTS.md` is rewritten by `next dev` 16.4 (its own block markers); committed as it says.
- **Tested:** `create-course-ui.mjs` (dev server): 1280 dark and 390 light, axe and no sideways
  scrolling on the sheet, the student sees the item, the link opens signed out, not offered to a
  student; `pnpm check`.

## M79: Real people in the owner console (the council's "know who really uses it")

- Overview → **Real people** (`console/real-people.tsx`, first card): real accounts, used it today,
  this week, came back this week (joined over a week ago), new in 7/30 days, never came back, and per
  app the people who did something there in 7 and 30 days (UniVersity: active people in a course;
  Trace scans, Relief posts, Green actions, Play scores). Shows how many sample and demo accounts are
  left out.
- Server: `GET /api/core/owner/real-people` (owner only, kept 5 minutes), one query of sub-selects
  (`src/server/real-people.ts`, `realPeopleColumns`). Made-up accounts: `@sample.universe.test`,
  ids `smp…`, the demo sign-in accounts and alice/bob from migration 0002. **Trap:** stored dates end
  in `+00:00`; compare in the same form. No names or emails leave the server.
- The live site on 3 Nov: 8 real accounts (2 this week, 1 today), 306 made-up ones left out.
- **Tested:** `real-people.test.ts`; the query on the local and (read-only) the live database;
  `console-ui.mjs` now opens the card too (axe, no sideways scroll).

## M81: first visit: "Here to…" on the landing (the council's first-visit path)

- Under the hero's Get started / Sign in: **Here to** Learn · Teach · Protect my brand · Help people ·
  Look around (`HERE_FOR` in `src/app/page.tsx`, a `nav` named "What are you here for?"). Learn and
  Teach open UniVersity's sign-up with the role already picked (`?as=student|teacher`, read in
  `register/page.tsx`; they still confirm with Continue); Protect my brand → Trace sign-up; Help
  people → Relief sign-up; Look around → the sample product passport `/t/demo` (no account).
- **Trap:** in `register/page.tsx` the `as` effect must come after `individual`'s `useState` (lint:
  "accessed before it is declared").
- **Tested:** `landing-here-ui.mjs` (390 and 1280: five choices, each lands where it should, the role
  is picked, axe and no sideways scroll); `pnpm check`.

## M82 · STORMFALL on the site, its game files kept out of the code history; Ridgeline Ops removed (3 Nov 2026)

The owner chose STORMFALL over Ridgeline Ops ("only one should stay": STORMFALL). The branch
`claude/stormfall-unity` (its own note "M41", a number already taken on main) was started before
M42–M81, so it was brought over by hand onto today's code instead of merged.
- **The game:** an original Unity 6.6 URP tactical shooter (a lobby, the Kaldera Isle battle royale,
  Outbreak on Floodmere and Dust Range). Source: `games/stormfall/` (its `README.md`,
  `Docs/TECHNICAL_SPEC.md`, `Docs/GUNPLAY_MATH.md`; the newest is in the owner's `Universegames` repo).
  Not part of the pnpm workspace or the Cloudflare build. Traps from its session: Unity fills a
  public `[Serializable]` class array with empty objects (runtime fields `[System.NonSerialized]`);
  one MonoBehaviour per file named after the class; keep the `.meta` files.
- **On the site:** `/play/stormfall` (`src/components/play/Stormfall.tsx`), computers only
  (`useDesktop`: hover, fine pointer, 1024 px), 16+ through `useRatingGate`, scores stay inside the
  game. The card shows on /play (3D worlds, computers) and the landing's worlds row. `STORMFALL`
  (name, age, rating) lives in `src/lib/play.ts` with no imports so the landing doesn't load the
  game page's code. The loader patch and the 24 MB data parts with a fetch hook are
  `scripts/stormfall-web.mjs` (unchanged, see its header): the CSP stays as it is.
- **Game files out of the history (the council's item):** `public/games/stormfall/` (58 MB: loader,
  main script, code, data in three parts) is gitignored and filled during every build by
  `scripts/fetch-stormfall.mjs` (in `package.json` `build`, and in `local:setup`): it downloads each
  file from one pinned commit of this public repo (`scripts/stormfall-files.json`: `f3e79386…`, the
  head of `claude/stormfall-unity`), checks size and SHA-256, retries 3 times, keeps files already
  right (a second build downloads nothing), deletes anything not listed. If GitHub can't be reached
  the site still builds and the game's page says it couldn't be downloaded (`--strict` fails
  instead). **Keep the branch `claude/stormfall-unity`**: it holds those files. New build: copy it
  with `stormfall-web.mjs`, push the folder on a branch, put that commit and the checksums from
  `node scripts/fetch-stormfall.mjs --hash` in the JSON.
- **Ridgeline Ops removed:** `src/lib/play/ops/`, `src/components/play/ops/` (M40 and its later rig
  and scenery work on branches), its `GAMES` entry and `.ops-*` styles. Old `ops` scores stay in the
  database and are skipped (`isGame`). Eleven games plus STORMFALL in all copy.
- **Tested:** `pnpm check`; the fetch twice (6 files, 58 MB, then nothing); `local:build` +
  `local:serve` with `scripts/checks/stormfall-ui.mjs` (see the commit).

## M83 · The council's leftovers: zod 4, pdf.js 6, live air traffic opt-in, the guide tidied (3 Nov 2026)

The owner: "the other agent has done few works what the council said and you can do remaining one".
- **zod 3 → 4.6** (`src/server/dto.ts`, its only user): `z.strictObject` (unknown properties still
  answer "property x should not exist"), `z.enum` for Prisma enums, `z.url({ protocol: /^https?$/ })`
  (a `javascript:` or `ftp:` link is refused), `z.ZodType`. New `dto.test.ts` (it had no tests).
- **pdf.js 5 → 6.5** (`src/lib/pdf.ts`): a document no longer has `destroy()`; the task that opened it
  does. `openPdf` / `openPdfData` remember each document's task and **`closePdf(doc)`** ends both;
  the five callers use it, and the PDF editor now closes its documents when it closes (it never did).
  `isEvalSupported` is gone (pdf.js 6 never evals). Its new renderer worker (`rendererSrc`, pages
  drawn off the main thread) is left off: it changes how pixels reach our canvases (thumbnails use
  `toDataURL`); try it as its own item. Checked in the browser: the editor draws a page and three
  thumbnails, no errors.
- **Live air traffic opt-in** (OpenSky's free feed is for non-commercial use): `optIn` on a
  `FeatureSwitch` = off until the owner turns it on, stored as `"<id>:on"` (`parseSwitches` adds it
  to the off list unless that is stored; `composeSwitches` writes it; the console's list is read with
  `offFromList`, literally). **Bug fixed on the way:** the "Live air traffic" switch never did
  anything (the Worker only refuses changes, and the planes feed is a read); `GET /trace/aircraft` now
  checks `featureOff('aircraft')` itself and answers "Live air traffic is turned off." Opt-in
  features stay out of the per-school switches, rollouts and the console's "N switched off" note.
- **AGENTS.md "Where things stand"** rewritten as a short map by area (no duplicate lines), with the
  rule: never reuse a work number (look at other branches' notes too). STORMFALL's comments say M82.
- **Tested:** `pnpm check`; `dto.test.ts`, the opt-in tests in `school-switches.test.ts`; the PDF
  editor with a 3-page PDF on the dev server (page and thumbnails drawn, no console errors).

## M84 · The pink river on a background thread (3 Nov 2026)

The owner: "upgrade every single thing… most important one ultra smoothness".
- **Measured first** (`local:build` + `local:serve`, headless Chromium, scripts kept out of the repo):
  the river (`LightTrail`) drew on the page's main thread on every page, about 60 frames a second;
  at rest the main thread was 92% busy on `/login` and 68% on `/student`. This machine draws without
  a GPU, so the numbers are inflated; the change between them is what counts. The next biggest
  always-on cost: the planet card on the hub and the landing (`Planet`, thousands of dots a frame).
- **The river now draws on a background thread** where the browser can (Chrome, Edge, Firefox,
  Safari 16.4+): `LightTrail` makes its canvas, hands it to `src/components/river.worker.ts` with
  `transferControlToOffscreen`, and only tells it what changed (size, scroll, theme, pointer,
  hidden, "move"). The drawing moved unchanged to `src/lib/river-paint.ts` (`makeRiver`), used by
  the worker and by the page when there's no OffscreenCanvas or the worker can't draw (it posts
  `unsupported`). At rest: `/login` 92% → 15% busy, `/student` 68% → 6%, `/hub` 162 → 241 frames in
  4 s. The same picture pixel for pixel (Reduce Motion still frames against the old code: no pixel
  differs on `/hub` dark and light and the landing; sign-in ≤1/255 on some pixels).
- **Rules for code that builds on it:** the canvas is made inside the effect (a canvas can be handed
  over once and StrictMode runs effects twice), so don't put it in JSX. The worker can't see the
  page: whatever the river depends on goes in a message (the scroll comes from scroll events, and
  once after each page change through `resync`). The worker stamps the pointer with its own clock.
  Judge it by the main thread's busy time: in headless Chromium without a GPU, `/login`'s frame
  count fell (232 → 193) because the worker's frames share the same CPU for compositing; real
  devices composite on the GPU.
- **Bug fixed on the way:** whether the river keeps moving is decided when a frame runs (`tick`),
  so a "move" that arrives before the first frame (the page went idle while the thread was still
  starting) no longer leaves it still until the next scroll. `river.worker.test.ts` covers it.
- `pnpm lean` counts `new URL('./x.worker.ts', import.meta.url)` as a use.
- Sign-in's layout shift (0.083 in the first measurement) measured 0 in three runs; not reproduced.
- **Left for later:** the planet card (next item); the page transitions' blur is the owner's chosen
  look and runs on the compositor, untouched.
- **Tested:** `pnpm check`; `river.worker.test.ts`; screenshots in dev and on the built site, on the
  background thread and on the page (drawn, moving, following scroll and theme, no errors).

## M85 · The planet on a background thread; live cards drawn at their real size (3 Nov 2026)

The owner: "…most important one ultra smoothness". After M84 the biggest always-on cost was the
planet (the hub's card, the landing's World section): thousands of dots stamped every frame on the
page's main thread.
- **The planets you only look at draw on a background thread** (`src/components/live/planet.worker.ts`),
  like the river: `Planet` renders `WorkerPlanet` (makes its canvas in the effect, hands it over and
  sends what changed: places, land, size, pointer, on screen, tab hidden) or `PagePlanet` (the globe
  you turn, Trace's Live globe, and browsers without OffscreenCanvas or fonts on a thread; its
  `unsupported` message or an error switches to it). The drawing moved unchanged to `planet-paint.ts`
  (`drawPlanet`, `planetState`, `planetPoints`, `planetLinks`); the live cards' colours, glow sprite and
  maths moved to `live/paint.ts` (no React; `canvas.ts` re-exports them, so the other cards are
  unchanged; on a thread the sprites are OffscreenCanvases).
- **Land:** the page draws the land picture once per visit (`landBits`: 512×512, one byte a pixel,
  shared by every planet); the thread finds a place's pixel with `maskIndex`, the maps' Mercator
  written out because d3 isn't loaded there. `planet-paint.test.ts`: exactly d3's pixel for 150,000+
  places and the edges.
- **Trap: fonts on a background thread.** A thread has its own fonts, so the planet's thread loads
  Urbanist itself (by full address: a thread's own address may not be a web page's) and waits for it,
  2 s at most, before its first frame: a canvas that drew text before the font was ready kept the
  stand-in (bolder, wider names), even after it loaded, in about one run in three.
- **Bug fixed on the way: live cards were squashed and soft.** `useLiveCanvas` measured its canvas
  with `getBoundingClientRect`, which the page's entrance animation scales for a moment
  (`scale(0.96, 0.9)`): the hub's planet was drawn 845×342 into an 880×380 box, so it was stretched
  taller and blurred. It now takes the layout size from its ResizeObserver (`contentRect`), like
  WorldCanvas; every card on /hub, /student, /relief, /green, /trace and /play now draws at its box's
  size. **Rule:** size a canvas from layout (ResizeObserver, `clientWidth`), never from
  `getBoundingClientRect`.
- **Result (built site; this machine draws without a GPU, so read the numbers as relative):** the
  page's main thread at rest on /hub 99.5% → 5% busy, on the landing 91.5% → 17% (river and planet
  both on threads; M84 alone left /hub about 73% busy). The same pictures pixel for pixel (Reduce
  Motion still frames against the old code: hub, landing at 1280 and 390, on the thread, on the page
  and on the built site).
- **Tested:** `pnpm check`; `planet-paint.test.ts`; planet screenshots (still and moving) in dev and on
  the built site; the Live globe draws, turns and zooms; card sizes on six pages.

## M86 · Maps open and zoom without freezing the page; a pinch zooms the map, not the page (3 Nov 2026)

The owner: "…most important one ultra smoothness". Measured page switches in the app on the built
site (click a link, watch 1.5 s).
- **The stall:** opening Trace (it lands on Tracking) froze the page for about 0.7 s on this machine:
  `loadWorld` projected every country outline with d3 (resampling, clipping, areas) on the page's
  main thread, each time a page with a map opened; zooming in loaded the sharper 1:50m outlines the
  same way (seven times bigger); the hub's planet (M85) did it too, for its land.
- **Now on a background thread** (`src/components/trace/map/world.worker.ts`): `loadWorld` asks it for
  a map file; it fetches it, projects it (`world-shapes.ts` `projectWorld`, no DOM) and sends back
  plain numbers (drawing steps, points, boxes, label points, areas; transferred, not copied). The page
  replays them into one Path2D per country (`toCountries` in `engine.ts`: the same moveTo / lineTo /
  closePath calls d3 makes). Without workers `projectWorld` runs on the page. A failed download can now
  be tried again (it stayed failed until a reload). `world-shapes.test.ts`: the replayed calls equal
  d3's own drawing, country by country, to the last digit. The projection now lives in
  `world-shapes.ts` (engine.ts re-exports `BASE`).
- **Names measured once:** WorldCanvas keeps country and city name widths (`measure`); a sharp redraw
  measured every name again.
- **Bug fixed: a pinch (Ctrl/⌘ + scroll) over the city view (Trace → Tracking) or the Live globe zoomed
  the whole page**, not the map: React's `onWheel` listens passively, so its `preventDefault` did
  nothing ("Unable to preventDefault inside passive event listener"). New `usePinchWheel`
  (`src/lib/use-pinch-wheel.ts`) listens on the element itself; WorldCanvas already did. **Rule:**
  never call `preventDefault` in React's `onWheel` or `onTouchMove`; use a native listener with
  `{ passive: false }`.
- **Result (built site, hub → Trace, three runs):** the longest main-thread task while switching went
  from 729 ms to 50–66 ms, the worst frame gap from 117–733 ms to 83 ms.
- **Pictures unchanged:** the Relief map (no live dots) pixel for pixel, as are the planets; Trace's
  maps have moving dots, so two runs of the same code differ there anyway.
- **Tested:** `pnpm check`; `world-shapes.test.ts`; map and planet screenshots before and after;
  the pinch on the city view and the Live globe (page zoom stopped, map zoomed, no warning); page
  switches on the built site.

## M87 · Safer libraries, the deploy tool the adapter asks for, checks on every push (3 Nov 2026)

The owner: "…security, development, testing…".
- **Dependency audit** (`pnpm audit --prod`): 32 known issues (1 critical, 10 high), almost all in
  build tools that never reach a visitor. Fixed with pnpm overrides in the root `package.json`, each
  pinned to a release at least two weeks old (a guard against freshly published bad versions):
  **dompurify 3.4.17** (critical and high: the HTML cleaner inside Excalidraw's Mermaid diagrams, it
  runs in the browser), **re2js 2.8.8** (high: the regex engine in Firebase's Firestore), undici
  7.30.1, fast-uri 3.1.9, qs 6.16.1, source-map-js 1.2.2, glob 10.5.0 and sharp 0.35.5 (build and
  local tools). Left: 12, none critical: body-parser (high) and serialize-javascript in build tools,
  whose fixes are 11 days old (take them in a later pass); katex inside mermaid (low: mermaid needs
  0.16, the site's own KaTeX is 0.18.9); webpack, deepmerge, minimatch and glob 9+ in build tools
  (fixes need new major versions or don't exist).
- **wrangler 4.142 → 4.151.3:** OpenNext 1.20.15 asks for ^4.148 (it warned on every install);
  4.151.3 was the newest release older than two weeks. It brings a newer local Workers runtime
  (miniflare) for `local:serve`. **Rule:** move wrangler up when the adapter's peer range moves.
- **Checks on every push** (`.github/workflows/check.yml`): GitHub runs `pnpm check` (types, lint of
  the changed files, unit tests, lean) on every branch push, so a branch and its pull request show a
  tick or a cross before anyone merges. Free on a public repository, no secrets, deploys nothing.
  **Rule:** don't merge a branch whose Checks run is red.
- **Tested:** `pnpm install`, `pnpm audit`, `pnpm check`; `local:build` + `local:serve` on the new
  runtime: sign-in, the hub, Trace's tracking map, the Live globe and a whiteboard open and draw with
  no errors.

## M88 · Less CPU per request: one Prisma query compiler per Worker copy (3 Nov 2026)

The owner: "the cpu time usage is alot can you see why is it happening" (Cloudflare, since 28 Oct:
3.62k requests, 465k CPU ms, about 128 ms a request; a typical Worker uses ~2 ms, one that renders
pages 10–20 ms). Only 1.5% of what the $5 plan includes, but far too much per request.
- **Measured** on `local:build` + `local:serve` (CPU per request from the kernel's thread times of
  workerd; CPU profiles through wrangler's inspector on :9229, which wants the header
  `Origin: https://devtools.devprod.cloudflare.dev`): a page as a browser asks for it comes from the
  edge cache, ~10 ms; the 15-minute cron ~17 ms; **an API request through Next.js and Prisma ~90 ms,
  half of it Prisma building its query compiler again** (`new QueryCompiler({ datamodel })`: the
  whole 323-model schema parsed in WASM), because every request makes its own client (`src/lib/db.ts`,
  on purpose: a shared client made requests wait on each other's promises). The first request in a
  fresh copy of the Worker ~450 ms (Next.js code loading, Prisma's WASM, the compiler); few visitors
  means many fresh copies.
- **Fix:** `patches/@prisma__client@6.19.3.patch` (pnpm patch, `patchedDependencies` in the root
  `package.json`): the client engine keeps one compiler per Worker copy (`globalThis.__prismaQC`, by
  compiler class, provider, connection info and datamodel). Safe to share: compiling is synchronous
  and does no I/O, so no request waits on another's promise; each client still has its own D1
  executor. One client's disconnect never frees it (`free` is a no-op on it); a Prisma panic drops it.
  Result on this machine: an API request ~90 → ~20–25 ms of CPU; 60 requests at once from three
  accounts answer exactly as one at a time; reads and writes checked.
- **Rules:** keep one Prisma client per request (db.ts). Upgrading Prisma means carrying the patch
  over (pnpm stops on a patch for a version that's gone; `src/lib/prisma-patch.test.ts` fails if the
  runtime lacks it), or checking whether Prisma now shares the compiler itself.
- **Also:** GitHub's first Checks run failed: install scripts are off in this repository (`.npmrc`
  `ignore-scripts=true`), so the Prisma client was never generated there; the workflow now runs
  `prisma generate` itself (an M87 fix commit), and the run is green.
- **Not changed:** a fresh copy's first request still loads Next.js (~90 ms here) and builds the
  compiler once (~70 ms); avoiding that would mean changing how OpenNext starts. Pages were already
  edge-cached.
- **To see where CPU goes on the live site:** Cloudflare → Workers & Pages → universe-web →
  Observability → events sorted by CPU time.
- **Tested:** `pnpm check`; `prisma-patch.test.ts`; CPU before and after on the built Worker; 60
  requests at once; a board and a Green action created and deleted.

## M89 · Buttons and loading: busy buttons keep their size, placeholders stay smooth under load (3 Nov 2026)

The owner: "please work on buttons also, i want my site to be ultra smooth in every aspect even in
loading of something or screen".
- **Measured first.** On the built site I clicked 31 tabs, menus and pop-up openers on nine pages
  and read their Event Timing. Click handlers take 1–4 ms. With the river and planet paused (on this
  machine they share the CPU, as it has no GPU), every control shows its result in under 100 ms
  (slowest 96 ms). Already fine:
  - iPhones show pressed states (a page-wide touch listener in `SheetGestures`);
  - the font is preloaded;
  - a page change shows its skeleton only after 180 ms.
- **Busy buttons keep their size** (`globals.css`, `[aria-busy="true"]`). The spinner now sits over
  the label instead of beside it. The label stays hidden but is still read out; icons are hidden.
  A button that starts saving no longer grows and pushes its neighbours (checked: same widths and
  positions before and while busy, light and dark). The rules are in the base layer, so a button's
  own position utility (e.g. `absolute`) still wins.
- **Placeholders shimmer on the compositor.** `.skeleton` used to sweep its background
  (`background-position`), so the page's own thread repainted every placeholder on every frame. While
  a page was busy loading (thread blocked 250 ms of every 300), the shimmer fell to ~20 frames a
  second. It is now a `::after` layer that only moves (`transform`), with the same band and timing;
  under the same load it stays at ~60 frames a second. All ~230 placeholders get it (skeleton
  screens, page-change skeletons, lists). The app's own Reduce Motion setting now stills them too.
- **Rules:** a placeholder is `.skeleton` and has no `::after` of its own. Its shimmer layer needs
  the placeholder positioned (`:where(.skeleton) { position: relative }` in the base layer, so
  `absolute` still wins) and clipped (`overflow: hidden`).
- **Deploy fix (PR #107):** #106's deploy was refused: "encoded sourcemaps must not exceed 60 MiB
  (received 97543 KiB)". wrangler uploads source maps by default from 4.150 (M87 moved it to
  4.151.3). `upload_source_maps: false` in `wrangler.jsonc` restores the earlier deploys' behaviour;
  a dry run uploads 49 MB (11 MB gzipped) and no maps.
- **Left as is:**
  - the menu fold animates real widths (by design, M33; used now and then);
  - the river's and planet's frames (the owner's rule, M56a).
- **Tested:**
  - `pnpm check`;
  - busy-button sizes and screenshots in both themes;
  - the shimmer under load (frames that moved in 3 s: 56–62 before, 188–193 after);
  - 31 controls clicked on the built site.

## M90: Quick notes like Apple Notes (4 Nov 2026)

The owner: "this quick note needs a lot of work i like apple note app… made it like that" (a
screenshot showed the search icon sitting on the text).

- **What it is now** (`src/components/studio/QuickNotes.tsx`, Collaborate → Create → Quick notes):
  - three columns on a computer: folders (All notes, your folders, Recently deleted), the list,
    the note;
  - on phones, folder chips over the list, and the note opens over it with "‹ Notes";
  - the list: search, Pinned first, then Today / Yesterday / Previous 7 days / Previous 30 days /
    month / year; each row shows the title, time, first line and "2/5" for a checklist; swipe to
    pin or delete;
  - the note: date, a big title, and lines with round tick boxes:
    - Enter adds the next item; Enter on an empty item ends the list;
    - Backspace at the start un-ticks or joins lines;
    - arrows move between lines;
    - pasted lines split;
    - Ctrl/⌘+Shift+L makes a checklist;
  - one toolbar row: Checklist, Pin, More (colour, folder, "Move ticked items down", "Make it a
    document"), Delete;
  - Recently deleted keeps notes 30 days, with Recover, Delete now and Undo;
  - an empty note goes away when you leave it.
- **Data:**
  - still plain text in `uv-quick-notes` (same shape plus optional `folder` and `deletedAt`), so old
    notes open unchanged;
  - folders in `uv-quick-folders`;
  - now through `useKept`, so Save, view links and live editing carry the notes (they didn't
    before);
  - text rules live in `src/lib/quick-notes.ts` (tested): the title is the first line, a line
    `[ ] ` / `[x] ` is a checklist item.
- **"Make it a document"** now fills the Doc: title as a heading, a real checklist, "- " lines as
  a list (`noteToHtml`, through `doc-import:`). Before, it only copied the text.
- **Fixed for every tool:** `useKept` writes what's still waiting (its 250 ms pause) when the tab or
  the tool closes, so the last words typed aren't lost.
- **Fixed site-wide:** the search icon over the text in 8 search boxes. `.input`'s side padding is
  now `:where(.input)`, so a `ps-9` beside it wins. The `.input.pl-10` patch is removed.
- **Rules:**
  - lines are `<textarea>`s that grow (`field-sizing: content`, measured where missing), 16 px so
    phones don't zoom;
  - no focus box on the note's own fields (`focus-visible:shadow-none!`): the caret shows where you
    are, as in Apple Notes;
  - the React lint doesn't allow a parent's ref to be changed in a child, so the "put the caret in
    the title" signal is a prop (`titleCue`).
- **Tested:**
  - `pnpm check`;
  - a browser run: wrote a checklist, ticked it, searched, deleted to Recently deleted;
  - axe clean at 390 / 1280, light / dark;
  - no sideways scroll.

## M91: The CreditKarma photos' look everywhere, and the lag (4 Nov 2026)

The owner sent ten slides of a CreditKarma design ("use this photos and make website like this"),
chose "the photos' look, keep pink" when asked, and said "the website and app looks laggy a lot".

- **The look** (one unlayered block at the end of `src/app/globals.css`, so it wins over M52–M57):
  - Light mode: an #ececec page with gold, steel blue and amber light in the corners; white cards;
    ink #111113 pills and main button.
  - Dark mode: #0b0b0c with dimmer warm light; solid #151517 cards; white pills and main button.
  - In both themes, a near-black side menu with a white pill for the chosen entry.
  - The headline frosts are the photos' (dusk steel blue into brown, honey gold, moss olive).
  - The hero cards (`.trace-hero`: hub, Trace) are near-black with warm light in both themes.
  - The planet, live cards and wallet cards drop aqua for warm gold and steel (`TONES` in
    `live/paint.ts` keeps its key names: a `shortcut:` comment says so).
  - The landing's buttons are white pills and its page is black.
- **Scales:** `indigo/violet/purple` are ink in light mode and graphite in dark mode; `aqua` is white
  in dark mode (what was "chosen" in Aqua Jade is white now); `zinc` is neutral. The light-mode
  coloured-text overrides (`.text-indigo-600` was violet) follow.
- **The lag, measured** (the built site, signed in, a phone screen with a 4× slower CPU):
  - Signed in, the home, UniVersity and Trace pages scrolled at about 30 frames a second, with stalls
    up to 400 ms. The public pages were fine (60).
  - Hardly any of that time was script. It was drawing:
    - the frosted bars and the side menu's glass: about 25% of the compositor's time;
    - the canvases: about 22%;
    - the home page's wallet cards: their idle sway recomputed a 3D tilt, a glare gradient and a
      holo gradient 60 times a second (repaints on every frame);
    - see-through hand-made cards over the moving river, blended again on every frame.
  - The site-wide scroll reveals cost nothing measurable, so they stay.
- **Fixes:**
  - no glass anywhere (cards, bars, tab bar, side menu, toasts);
  - solid cards, including hand-made rounded bordered boxes with a see-through dark fill (one CSS
    rule, not inside another card);
  - on touch screens, the wallet sway is a CSS animation (`.wcard-sway`, compositor only; nothing
    per frame);
  - live cards (`useLiveCanvas`) and the planet worker draw every other frame on touch screens (30 a
    second, the same speed of motion).
  - The river is untouched (the owner's rule, M56a; it already caps its pixels).
- **Rules for what builds on this:**
  - new screens use `.panel` / `.card` / `.btn-primary` and the tokens, and never a translucent card
    fill or `backdrop-filter`;
  - pink only for the river, live dots and `--ins-hot`;
  - a dark card inside a light page re-points its text greys (see `.trace-hero`'s `--color-zinc-*`).
- **Left for later:**
  - about 200 files still have their own navy or aqua colours (the maps, the night city, some
    editors and canvases): moved over one by one;
  - the landing's italic pink accent word becomes the photos' two-tone heading in M93.

## M92: The owner console, professional; UniVersity scrolls smoother (4 Nov 2026)

The owner: "the owner console dashboard doesn't look professional, it looks like it was made by AI",
with the CreditKarma photos as the model.

- **Overview (`console/overview.tsx`):**
  - The top is six headline cards in the photos' "credit factors" style: People with an account
    (dusk frost), New this week (gold), Waiting for approval, Open errors, Deletion requests,
    Suspended.
  - Each card has a thin-line icon in a circle, a round arrow button, the label, one big number and a
    tiny chart beside it. An amber dot shows when something waits. A tap opens the right tab.
  - The Students, Teachers and Admins tiles went: the Everyone card already shows them.
  - The sample-data tool moved to the bottom.
  - The trend line is ink or white with today's point in pink. Bars are solid, avatars plain grey,
    and the timeline dots small grey (no gradients, no glows).
- **`src/components/ui/FactorCard.tsx`** (reusable: any page's headline numbers):
  - `FactorCard` with `tone` plain, dusk, gold or olive;
  - five tiny charts, all drawn in currentColor so they work on a frost or in either theme: `Dots`
    (where a value sits on a scale), `Ticks` (thin bars), `Wave` (a soft line with its two peaks),
    `Rings` (a small count), `Matrix` (a dot grid).
- **The header (`deck.tsx`):**
  - near-black with warm light (`.trace-hero`), a date line, a thin crown icon and a two-tone title;
  - no grid, drifting glows, heartbeat line, rotating beam, mono eyebrow or italic accent;
  - console cards are solid (`card` in `shared.tsx` uses the tokens), and table headings are in
    sentence case, not mono capitals.
- **Every tab bar (122 places, `TabPill` in `Glide.tsx`):**
  - the chosen pill is solid: ink in light mode, white in dark mode;
  - a tab whose chosen pill is white shows its label in ink (`html.dark … :has(> .tab-pill)` in
    globals.css, so no caller changed);
  - the line and soft variants are plain too.
- **The river in light mode** is pinks only (its violets went with M53's palette).
- **UniVersity's home scrolled at ~45 frames a second on a phone-speed CPU after M91.** Measured:
  - hiding its canvases cut the compositor's work by 41% and the per-frame hand-over by 63%;
  - stilling its live dots cut the page's own work by 17%.
  Fixes:
  - live cards draw at 1.5× on touch screens (not 2×);
  - `.live-dot` and `.deck-ping` pulse with a ring that only scales and fades (`::after`,
    compositor), not an animated box-shadow that repainted every frame.
- **Measured after M91** (the built site, 4× slower CPU, 6 s of scrolling): the hub went from 302
  frames, median 33 ms and worst 417 ms to 359 frames, median 17 ms and worst 83 ms (smooth).
  UniVersity went from 258 to 282 frames, Trace from 251 to 263, before this item's fixes.
- **Tested:**
  - `pnpm check`;
  - the console as a test owner (`--owner-test`-style sign-in on the dev server): axe clean at 390 and
    1440, light and dark; no sideways scroll; live cards draw.

## M93: The landing like the photos' website: two-tone headings, no navy (4 Nov 2026)

The owner's slide 7 (the CreditKarma website: "Where Credit Meets **Confidence**").

- **Two-tone headings:**
  - `Accent` (`landing/bits.tsx`) renders `.accent-word`, and the 20 headings that use it turn into
    the photos' style: the heading in a quiet grey, weight 500, and its key word bright (white in dark
    mode, ink in light).
  - CSS only: `:is(h1, h2, h3):has(.accent-word)` in globals.css.
  - The italic pink serif word (M58) is gone, and so are the gradient words in Collaborate's and
    Messages' headings.
- **No navy left on the landing:**
  - the hard-coded navy in its cards, the flow card, the call-to-action, the cookie notice and the
    business section is near-black now (#1d2650 → #151517, #131a3d → #0f0f11, #222c5a → #1d1d20, in
    9 files);
  - the planet section's band is dark with the photos' warm light under the planet (it was navy into
    Aqua Jade), and its notes are solid;
  - the "One app for the whole school" band runs honey into pink (it was periwinkle).
- **Rule:** a heading's key word goes in `<Accent>` (or a span with `accent-word`). Never colour a
  heading's words by hand.
- **Tested:**
  - `pnpm check`;
  - the whole landing scrolled through at 1280 in dark mode (every section revealed): no page errors.

## M94: The last navy and aqua moved over (4 Nov 2026)

The owner: "please do the left on purpose part" (M93 left ~200 files with their own navy and aqua).

- **One mapping, applied by script to 188 app files and the older half of globals.css** (226 lines,
  above the M91 block), so every leftover shade lands on the same new colour:
  - navy shades → near-blacks and graphites (#0a0f2b → #0b0b0c, #171f44 → #111113 ink, #1d2650 →
    #151517 card, #222c5a → #1d1d20, #2b3568 → #27272a, plus ~20 nearby navies);
  - Aqua Jade → the photos' warm gold (#74ffed → #f0cc8a), except UI text in aqua → white;
  - the same for `rgb()` triplets.
- **Left alone on purpose:**
  - documents and emails on white paper (`src/server/`, certificates, CVs, report cards);
  - colours people choose (slide themes, sheet render, course colours, accent choices, collaborator
    colours, hall tints);
  - sample data;
  - the river (the owner's rule).
- **By hand:**
  - the maps' palette is neutral (`WorldCanvas` `PAL`: near-black sea, graphite land, grey labels;
    light mode neutral greys);
  - live cards are near-black with warm light and a pink glow in both themes;
  - Messages' tab deck uses the solid pill, and its unread count reads on the white pill;
  - `fuchsia` leans pink in both themes, so the leftover indigo → fuchsia gradients (avatars, badges)
    read graphite into pink, not purple;
  - Play's heading is two-tone;
  - the browser bar, the start-up background, the installed app's colours (`manifest.json`) and the
    offline page are #0b0b0c / #ececec;
  - `textOn()` (`src/lib/contrast.ts`) puts ink #111113 on light fills (test updated).
- **Tested:**
  - `pnpm check`;
  - axe clean with no page errors on the hub, UniVersity home, Messages, Trace's market map, Play,
    Collaborate and the landing, at 390 and 1280, light and dark (28 runs).
- **Note for later:** Messages lives at `/student/inbox` (and `/teacher/inbox`, `/admin/inbox`); there
  is no `/messages` page.

## M95: A check of what else to improve, and the quick fixes (4 Nov 2026)

The owner: "please check what else you can improve in this system".

- **What was checked:**
  - the live site's `error_reports` (read-only);
  - first-load script per page (`node scripts/bundle-report.mjs` on the last local build);
  - `pnpm audit --prod`;
  - GitHub Checks;
  - axe and page errors on the main pages (done in M94).
- **Errors on the live site:**
  - Nearly every frequent report is made-up sample data (ids `smpe…`, from "Fill with sample
    data"), not real.
  - The real ones are rare (1–3 hits each) and old. The owner console People list's "too many SQL
    variables" (31 Oct) stopped after M73 (1 Nov), so it can be marked resolved.
  - The rest are browser bots or Google's sign-in and reCAPTCHA code.
- **Fixed:**
  - Every `AudioContext.close()` now has `.catch(() => {})`, so closing twice no longer throws "Cannot
    close a closed AudioContext" (Play's voice, the docs converter and five Create tools).
  - The owner console loads each tab's panel when it is first opened (17 panels, `next/dynamic`,
    `ssr: false`, the console skeleton while loading). Its first load was 481 KB of script, the
    biggest page apart from the editors.
- **Found, not done (the next items):**
  - **First-load size** is the biggest lever. No page meets the A4 targets (0/244): a typical app
    page loads ~370 KB gzipped before it works, about 140 KB of it the framework, and ~230 KB of
    dashboard-wide pieces in ~45 chunks. Next step: find what every dashboard page imports up
    front (assistant, command palette, tour, sheets, sounds…) and load each when first used,
    measuring per page.
  - **body-parser 2.4.0** (the one high library issue; it comes in through `@opennextjs/aws`'s
    express, which the Worker doesn't run): add the override from 5 Nov, when the release is two
    weeks old.
  - The other 11 audit items are low or moderate and build-time only (webpack, glob, minimatch,
    serialize-javascript), plus KaTeX's low one.
- **Tested:**
  - `pnpm check`;
  - the console as a test owner: overview, flows, errors, server and people tabs open, axe clean,
    light and dark, desktop and phone.

## M96: Lighter first load on every page (4 Nov 2026)

The owner: "please do all the still to do" (M95 found that no page meets the first-load targets).

- **Measured:** first-load script (gzipped, `node scripts/bundle-report.mjs` on a local build).
  - Every app page went down about 46 KB, about 11–12%: /student 410 → 364 KB, /hub ~372 → 333,
    /green 379 → 346, /play 378 → 344, the editors (docs, sheets, slides) about 46 KB each.
  - /console went 481 → 377 KB (with M95's lazy tabs).
  - About 39 KB of each figure is the old-browser polyfills, which current browsers skip.
- **The big one: the sign-in layout's file was loaded by every page.**
  - `(auth)/layout.tsx` referenced its client parts itself (`Link`, `LightTrail`, `UniverseLogo`,
    `ApiWarmup`, `MaintenanceGate`, `AuthShowcase`).
  - Webpack kept some of those, which other entries also reference, inside the sign-in layout's
    chunk. Every page's client manifest then pointed at that chunk, bringing along the sign-in
    picture and the landing's flow card.
  - The fix: the whole frame is one client component, `src/components/auth/AuthFrame.tsx`, and
    the layout only renders it.
  - **Rule:** a server layout or page that uses several client parts the root layout also uses
    should wrap them in one client component, rather than referencing each one itself.
- **Loaded when used, not with the page:**
  - the install guide (`InstallBanner` → `InstallGuide`, dynamic);
  - the email switch in the notifications panel (`Topbar`);
  - the incoming-call screen and the mini player (`DashboardShell`, dynamic, `ssr: false`; they
    load just after the page).
  - `PendingPage` stays static, because it wraps every page's content.
- **How to find what a page loads:**
  - `node scripts/bundle-report.mjs`;
  - a page's scripts are the `<script src>` tags in `.next/server/app/<page>.html`;
  - its client manifest is `.next/server/app/(group)/<page>/page_client-reference-manifest.js`
    (eval it with `globalThis.__RSC_MANIFEST = {}`).
  - `productionBrowserSourceMaps` produced no maps with this config, so readable strings in a chunk
    were enough to identify it.
- **Tested:**
  - `pnpm check`;
  - the built site: sign-in shows its frame, form and picture; the hub's notifications panel opens
    with the email switch; axe clean; no page errors.

## M97: UniVersity and Trace scroll smoothly too (4 Nov 2026)

The owner: "please do all the still to do" (after M91–M92, UniVersity and Trace still scrolled less
smoothly than the hub).

- **Measured on the same machine and build** (a phone-sized screen, a 4× slower CPU, 6 s of
  scrolling):
  - Switching every animation off took Trace to 354 frames, whereas hiding the canvases changed
    nothing.
  - A sampler of `document.getAnimations()` during the scroll (`scrollanims.mjs`-style) showed what
    runs:
    - the edge beam (`beam-once` / `beam`): a conic gradient whose angle is a registered custom
      property, so the whole card repaints every frame; up to 8 cards at once on UniVersity;
    - the reveal's `filter: blur()` transition;
    - decorative loops: the passport glow drift, bar glints, instrument pings.
- **Fixes:**
  - the edge beam is gone: `beamOn` / `beamOff` and their CSS, and the console's unused
    `deck-orbit`, which shared `--beam`. That also drops a `getComputedStyle` per revealed card;
  - the reveal (`[data-sr]`) is transform and opacity only, with no blur;
  - `scroll-motion.ts` sets `<html data-scrolling>` while anything scrolls (and for 180 ms after), and
    the decorative loops pause meanwhile (`animation-play-state: paused` on `.passport-glow`,
    `.mkt-drift-a/b`, `.ins-ping`, `.ins-live`, `.ins-grain`, `.wcard-sway`, the logo's beams, and
    `.bar-glint::after`). Live dots keep pulsing.
- **Result (frames in 6 s, 360 = 60 a second; frames over 50 ms):**
  - hub: 294 → 378 (4 slow);
  - UniVersity: 232 → 290 (82 → 24 slow);
  - Trace: 243 → 297, median frame 17 ms (77 → 47 slow).
- **Rule:** a new looping decoration goes in the `html[data-scrolling]` pause list, and never
  animates a custom property, `filter` or `background` (those repaint every frame).
- **Tested:**
  - `pnpm check`;
  - the built site: axe clean at 390 (light and dark, scrolled through) and 1280; no page errors.

## M98: Trace's live board smooth; a site-wide sweep before merging (4 Nov 2026)

The owner: "Trace's live instrument board still causes some jerky frames… do this one and see what
else… make sure everything is good and after that push and merge it, don't leave anything behind".

- **The board's numbers set off a storm of blur animations.**
  - `Roll` (instruments) and the console's `Ticker` count by rewriting their text on every frame.
  - `scroll-motion.ts`'s `rollChanged` took each rewrite for a new value and started a blur roll:
    168 rolls in 6 s of scrolling on Trace.
  - Fixes:
    - a figure that changes twice within 250 ms is treated as animating itself and left alone
      (`selfMoving`);
    - the roll is opacity and a small rise only (no blur);
    - `Roll`, `Ticker` and `Rolling` carry `data-no-motion`, so the page-wide count-up doesn't count
      them a second time.
- **A trap found and fixed:**
  - M98's first pause list ended a `html[data-scrolling]` selector in `.play-scene > *`. Each time
    scrolling started or stopped, the browser restyled the whole page: 19 s of style work in a 6 s
    scroll on Trace.
  - Now `.play-scene` is paused and its children `inherit`.
  - **Rule:** never end a selector keyed on a `<html>` attribute that toggles often in `*` or
    `> *`.
- **The count-up waits for React.** It could rewrite a figure before React hydrated that part of the
  page (React error #418, seen now and then on Green and Play). `countUp` now waits until the
  element carries React's `__reactFiber$` marker (retries for 2 s), with a `shortcut:` comment.
- **Also:**
  - Green's tank wave, Play's little scenes and ripples, and Collaborate's aurora pause while
    scrolling;
  - star ratings on the passport (`/t/…`) and brand pages (`/b/…`) are `role="img"`, which axe
    asked for.
- **A site-wide sweep (`sweep.mjs`, scratch):** 116 page visits, covering signed-out, student,
  teacher and admin pages at 390 and 1280 in dark and light (page errors, 5xx API calls, axe,
  sideways scroll).
  - Only the stars failed (fixed).
  - The console check passes (as an owner, desktop and phone).
- **Scrolling on the final build** (a phone-speed CPU, 6 s; 360 frames = 60 a second; slow frames
  are those over 50 ms):
  - Trace: 243 → 332 frames, slow frames 77 → 16;
  - UniVersity: 232 → 315, slow frames 82 → 28;
  - hub: 403;
  - Play: 319.
- **Count-ups wait for React** (`countUp` in `scroll-motion.ts`): a figure counts up only once React
  has hydrated it (its `__reactFiber$` key, a `shortcut:`), else React's error #418 on /green and /play.
  Rebuilt and checked three times: clean.
- **Known, rare, local only:** /t/demo once in about 30 loads reported #418 ("HTML") when opened right
  after the landing in the same tab. Nothing outside React changed the page before it (a
  MutationObserver log), and the live site's `error_reports` has never had a hydration error. Look
  again only if it shows up there.

## M99: Night Shift, a survival-horror story of its own (4 Nov 2026)

The owner asked for "realistic graphics specially the night shift one with a proper story like resident
evil gameplay". Genre mechanics only: the story, names and look are ours (never a recreation of a real
game).

- **The story** (`src/lib/play/night-story.ts`, pure, seeded, tested in `night-story.test.ts`):
  - Ashgrove Academy shut for winter; the boiler room sealed after a fire in 1974 was opened again; the
    Quiet came up the pipes (blind, hunts by sound, can't stand light). You are the new night caretaker.
  - Floors: the classrooms, the library and labs, the boiler room. Each key has a room's name
    (`NIGHT_KEY_NAMES`). Two notes per floor (`nightNotes`); the bursar's memo on floor 2 holds the
    stairwell code (`nightCode(seed)`, four digits), so floor 2's stairs need the keys **and** the code.
  - `nightLayout(seed, floor, maze)` puts notes, the safe room, flares and Shades on cells of their own
    (never the start, the stairs or a key). Everyone in a room gets the same night.
  - Endings (`nightEnding`): every note read gives "The whole truth" (+1,000), else "Out into the snow".
  - Points: note 250, Shade 100, code 500, truth 1,000; `maxScore` 36,000 → 40,000 (the cap test adds
    `NIGHT_STORY_MAX`).
- **Play** (`NightShift.tsx`): E reads a note (it shows on paper; the game keeps going), hides, or puts
  the note down; G (or the Flare button) throws a flare (18 s; the Quiet won't come within 4.5 m and
  Shades near it burn). The safe room keeps both out, charges the torch to 60% and has one first-aid
  kit (+1 life, only when hurt). Running is noise: the Quiet speeds up by 25% and Shades notice from
  further. Shades are on floors 2 and 3: the beam burns them in 0.7 s (it costs battery); one that
  reaches you takes 22% of the torch. The keypad takes number keys or taps and shakes on a wrong code.
- **Look:** only the torch casts shadows (computers; `PCFShadowMap` at 512 px: soft filtering cost the
  most), with a lens pattern (`lensPattern`); 220 dust motes lit only inside the beam; strip lights
  that flicker (some badly) on a `LightPool` of four point lights (`world/core.ts`: the light count
  never changes, so no shader rebuilds, and each pixel adds up four lights, not every lamp). Each
  floor has its own walls, floor, air and lamp colour; doors line the halls. The Quiet is tall and
  hunched, with bent arms, long fingers, a mouth and a twitching head. The film finish has a dread fringe
  (`World.look({ aberr })`, 0 skips its reads) that tears when it catches you.
- **Animations:** a picked-up key flies to the key ring, notes slide up like paper, the torch lags behind
  your view and shakes near the Quiet, breathing heaves the view and the torch panel when you're out of
  breath, the intro and the ending cards fade.
- **All 3D worlds:** `World.start` builds the shaders before the first frame (`renderer.compile`, then
  waits up to 1.5 s for the parallel build; not `compileAsync`, whose check throws from a timer if the
  world closes first). Night Shift adds hidden meshes for the lower floors' materials so going
  downstairs builds nothing. Lamps own a material each: switching one off changes a colour, not a
  shader. The quality ladder now lowers a sharp screen to 1× before turning the glow off, and turns
  off every light's shadows (not only the sun's). G throws in any world (`Controls`).
- **Measured** (software graphics in the cloud box, so only the CPU side carries over): the game's own
  work per frame 95% under 6.4–7.2 ms, the same as before; frame times no worse than before even with
  the torch shadows.

## M100: every game toward 60 frames a second (4 Nov 2026)

The owner: "make every game ultra smooth with no lag and atleast 60 fps for each game".

- **Measured** with a frame-rate check of all 11 games (`fps.mjs` in the session's scratch: start a
  solo round, play for 8–30 s, time every frame and the time inside the game's own frame code). The 2D
  games' own code is light (under 4 ms a frame, 95% of frames). Their slow frames came from drawing:
  - colour emoji drawn as text every frame (Flood Rescue's people, pets and lightning; Ocean Cleanup's
    every piece of rubbish);
  - a blurred shadow redrawn around Ocean Cleanup's boat on every frame.
- **Fixes** (`canvas.ts`):
  - `glyph(ctx, emoji, size, x, y)` draws an emoji from a bitmap made once, placed exactly like
    `fillText` with the current align and baseline, under the current transform;
  - `halo(color)` is a soft glow made once, drawn under a shape instead of `shadowBlur`.
- **3D worlds:** see M99. Shaders are built before the first frame. The quality ladder steps the
  resolution down first, and turns off every light's shadows. Night Shift's lights come from a fixed
  pool. Skyline Obby and Orbit Breach already had squash on landing, landing dust and bursts (M38–M41).
- **The frame rate on screen** (`FpsMeter.tsx`): a gauge button in every game's top bar shows frames a
  second (green from 55, amber from 40, red below), remembered on the device (`uv-play-fps`). It lets
  the owner check 60 on their own phone and computer. The cloud box draws 3D in software, so only the
  CPU side can be measured here.
- **Known:** the games' frame rate in this box is capped near 50 by its software compositor, even for
  still pages; real devices draw with their graphics chip.

## M101: STORMFALL's page, a graphics choice and the frame rate (4 Nov 2026)

The owner asked to "upgrade the stromfall game also" (realistic look, 60 frames a second). STORMFALL is a
Unity game: its graphics and play live in the Unity project and change only with a new Unity web build,
made in the Unity editor. That editor can't run in this cloud box, and the source for the current build
(lobby, Outbreak) is in the owner's own Unity project, not in this repository (`games/stormfall` here
is older). So this item does what the page controls:

- **Graphics: Smooth, Balanced (default), Sharp** on the Deploy screen (`Stormfall.tsx` `QUALITY`):
  how many pixels Unity draws per screen pixel (`devicePixelRatio` 1, ≤1.5, ≤2), the biggest lever on a
  sharp screen's frame rate. Remembered on the computer (`uv-stormfall-quality`). WebGL asks for the
  fast graphics chip (`powerPreference: 'high-performance'`).
- **Frame rate** button while playing: the same `FpsMeter` as the other games.
- **[owner]** For in-game changes (lighting, effects, animations), open the Unity project, make them,
  then "Tools → Build Stormfall for Web" and copy the build in (`scripts/stormfall-web.mjs`, then the
  new checksums in `scripts/stormfall-files.json`).
- **Checked before merging** (production build, phone and computer): every 2D game holds 60 frames a
  second at phone size (Type Race 54) with the gauge on; inside a running game, axe found labels on plain
  boxes (Night Shift's keys and lives, Supply Run's trucks: now `role="img"`) and a too-faint "Your best"
  on Ocean Cleanup's menu (now zinc-300 in dark). The camera fly-in in Obby and Orbit counts from the
  first frame drawn, so waiting for shaders no longer cuts it short.

## M102: the 3D worlds look real: sky, light, rock, lava, planets (4 Nov 2026)

The owner: "upgrade all the games even more like realistic graphics to all of them and add some unique
games also". This item is the shared 3D engine and the three worlds; the other games follow (M103 on).

- **Engine** (`world/core.ts`):
  - `World.sky(look, relight)`: three's physical daylight sky (`Sky`, with a `gain` uniform added because
    it's made for a darker exposure than ours), kept round the camera, and the same sky made into the
    world's light from all around (`envFrom`: a PMREM of a copy of it), so metal and glass reflect it. Call
    `lights()` first: the sun light moves to where the sky's sun is. `relight` false only moves the dome
    (a change in steps; relight once at the end, it takes a few milliseconds).
  - `World.envFrom(scene)`: the light from all around taken from any scene (Orbit: the planet and the sun).
  - Options: `ao` (ambient occlusion, computers: three's GTAO at half size; glows, sprites, points, lines and
    see-through things are hidden from its view or they'd cast dark halos), `haze` (fog that thickens like
    air, `FogExp2`), `tone` ('aces', 'agx', 'neutral') and `exposure`. The quality ladder drops the
    occlusion first (after a sharp screen comes down to 1×).
  - `box`/`boxes` take a list of six materials (+x, −x, top, bottom, +z, −z): grass on top, rock round
    the sides. Only for single boxes: merged boxes lose their face groups.
- **Nature** (`world/nature.ts`, new; all worked out on the graphics chip, nothing to download):
  `cloudSea` (an endless lit cloud layer, keep it under the camera with `follow`), `lavaSea` (cracking
  crust over flowing, glowing lava), `islandRock` / `rocks` (craggy rock under a floating island, many
  merged into one mesh), `starfield` (stars of real colours and brightnesses, sized on screen),
  `milkyWay` (computers only: it's fine detail over the whole sky), `planetMaterial` ('earth': oceans with
  shallows and sun glint, forests, grassland and deserts by rainfall and latitude, ice caps, drifting
  clouds, city lights on the night side; 'desert'; 'giant' with bands and a storm), `ringMaterial`,
  `lightBeam` (a torch's dusty beam; points along +z). The noise octaves drop from 5 to 3 on phones.
- **Textures** (`world/textures.ts`): `glowCracks()` (an emissive map: only the cracks glow),
  `neonEdge()`; floor tiles have puddles (mirror-smooth, darker), lockers and wood panels are grimier near
  the floor. `cloud()`, `lava()` and `planet()` were replaced and removed.
- **Skyline Obby:** a clear-morning sky with the sun behind the player, two layers of cloud far below,
  big floating islands with pines in the distance. Pads are grassy islands on craggy rock (Sky Islands),
  cooling basalt with glowing cracks (Lava Peaks) or black glass with neon edges (Neon Void); the special
  pads keep their colour as a material (pink jelly to bounce on, crumbling sandstone, glowing crystal,
  clear ice, a stone plaza with a flag, gold at the end). Lava Peaks has a smoky dusk and a lava sea;
  Neon Void a night with stars and the Milky Way. The sky changes over two seconds between worlds, then
  its light is made again. Rock under a pad that moves, crumbles or blinks is its child (it goes with it);
  the rest is one mesh per world.
- **Orbit Breach:** the planets are drawn on the graphics chip (earth, desert, ringed giant), real-coloured
  stars and the Milky Way, a sun with a halo; the decks are painted panels (light, not bare metal: space
  reflects nothing, so metal looked black) and the station reflects its planet (`relight` per station).
- **Night Shift:** the torch's beam shows in the air (`lightBeam` on the camera, aimed with the torch's
  sway, brightness with the battery), puddles on the floor catch the torch, ambient occlusion in corners.
- **Checked:** screenshots of all three worlds (and Obby's later worlds through a temporary start
  switch, removed); `pnpm check` clean. The cloud box draws 3D in software (1–2 frames a second), so
  frame rates must be checked on a real device (the gauge in the game's bar).

## M103: Flood Rescue and Ocean Cleanup in real 3D (4 Nov 2026)

The owner's "realistic graphics to all of them", for the two flat action games. Their rules didn't change:
they still run in the game box's pixels (steering, hit circles, the water line), exactly as before.

- **`world/board.ts` (new): a flat game drawn in 3D.** `Board(world, 'side' | 'top', span, tilt)` fits the
  camera to the box each frame (`fit()` is true when the size changed: lay the scenery out again then) and
  `at(px, py)` gives the point on the plane under a pixel (a ray from the camera, so it is exact even with
  the camera tipped); `scale(px, py)` is world units per pixel there. Side views use the plane z = 0
  (tipped 9° so roofs and pads show their tops); top views use the sea (y = 0). Also: `rainField` (rain
  moved entirely on the graphics chip, slanting with `wind`), `stormSky` (rolling clouds lit by
  lightning), `ocean` + `swell` (a sea whose swell is the same sum of waves on the chip and in `swell()`,
  so floating things bob and tip with it; two layers of ripples; foam on crests by `foam`), `label`
  (a number or emoji as a sprite, its picture made once), `timerRing` (a ring that empties),
  `waterNormals` (the new `water` surface in textures.ts).
- **Flood Rescue:** a night town of lit windows (one facade picture, tiled in world units) in two far rows
  fading into rain, the play houses with flat roofs, parapets and tanks, the hill and a white hospital
  with a red cross, the H pad with lights that pulse green while it helps. The flood is three's `Water`
  (a mirror, smaller on phones) made murkier (its shader's reflection term is dimmed); timer rings, counts
  and the lightning warning are hidden from its mirror. Real lightning (a jagged tube, the clouds and the
  town flash). A modelled helicopter: pink paint, white belly, canopy, skids, tail rotor, main rotor and its
  blur, a green light and a strobe, a searchlight (a spot light with shadows on computers and a beam), and
  the winch line; the person being winched rises up it. People are instanced (one mesh per body part), wave,
  and have pets. The counters moved off the canvas into chips (one pill on phones).
- **Ocean Cleanup:** the open sea under the physical sky (sun glitter, a swell, foam in the storm), the
  weather and sea changing with the stage (calm → choppy → storm, with rain and lightning). Every floating
  thing is a model (one mesh each, vertex colours): bottles, cups, bags, cans, ghost nets with floats,
  turtles, fish, octopuses, power-up buoys; oil is a black slick with a thin film's rainbow. Rings on the
  water keep the flat game's language (red: sea life, gold: power-ups, pink: nets). A white cleanup boat
  with a pink rail, a cabin and the scoop; a foam wake (instanced, additive: black is see-through); the
  shield is a dome, the magnet's reach and the sweep are rings on the water. Combo and the cleared count
  moved to the HUD.
- **Removed:** the flat drawing helpers (`useGameCanvas`, `burst`, `drawEffects`, `glyph`, `halo`): nothing
  draws them now. What's left (steering, `calmMotion`) is `play/steer.ts`.
- **Checked:** screenshots at 1280 and 390 (and with the flood high and items placed mid-screen through a
  temporary switch, removed); axe clean at 390 light and 1280 dark while playing; `pnpm check` clean.
  Phones skip the effects chain, so they draw faster than computers in this box.

## M104: the other six games look real (4 Nov 2026)

The owner's "realistic graphics to all of them", for the games still drawn flat. Rules and inputs didn't
change; each keeps its buttons and keys (accessible), and the 3D part loads with the game.

- **Type Race** (`RaceView.tsx`): the lane strip became a 3D circuit in a park: asphalt with painted lanes
  (`roadTexture`), red-and-white kerbs, a chequered start line and gantry, a grandstand full of colour,
  trees; every racer a clear-coated race car in their own lane with a name over it, the camera chasing
  yours, nitro flames at the exhaust. A lap is still 600 letters round the whole circuit; cars ease to
  their letters (`approach`). The SVG car and its `play-flame` style are gone.
- **Recycle Rush** (`SortView.tsx`, `world/props.ts`): a rubber conveyor belt (it scrolls) in a recycling
  plant, all thirty things modelled (`sortables()`: one vertex-coloured geometry each, about a unit,
  shared), four wheelie bins with their symbol stickers. The bin buttons are laid exactly over the 3D bins
  (the box's four columns, `Board.at`; mirrored in right-to-left). A sorted thing flies into its bin and
  the lid pops; a wrong one bounces off the rim; e-waste in the wrong bin burns; a missed one drops off the
  end; the next one glows pink, golden ones are gold metal. `OnBelt`/`BinArt` and their CSS motion are gone.
- **World Pin**: Trace's map has a `look="satellite"` (`WorldCanvas`): deep sea, lighter shallows along the
  coasts (a blurred stroke, drawn only when the land picture is redrawn), land coloured by climate band
  (`CLIMATE`: ice, tundra, forest, farmland, dry grass, desert, savanna, rainforest: a likeness, not a
  survey) with terrain grain (`grain()`, multiplied, clipped to land), thin white borders, white names.
  World Pin uses it; the Trace maps keep the flat look. The map is dark in both themes, so World Pin's marks
  use the light colours.
- **Supply Run** (`TownView.tsx`): an aerial 3D town in the flat map's own 600 × 400 plan: the river with
  muddy banks, streets that bridge it (each street is the plan's quad mapped to the ground, so the markers
  line up), houses with tiled roofs, parks of trees, the depot; trucks in their supply's colour drive the
  streets (along the middle street, a cross street, into the block) and back on the trip's times; the
  airdrop flies straight over. Rain dims the sun and falls in 3D. The need markers stay DOM on top.
- **Spot the Fake** (`world/shots.ts`): each product is modelled and photographed once in a little studio
  (one renderer, then released; the emoji shows until the picture is ready); the passports have a real QR
  layout (21 × 21, finders and timing), a barcode, a holographic seal sticker (`.play-holo`: only its sheen
  turns, by transform; paused while scrolling and with Reduce Motion), UV fibres under the lamp
  (`.play-fibres`) and a rubber-stamp COPY.
- **Quiz Clash** (`StudioView.tsx`, loaded after the questions): a TV quiz set behind them: a glossy floor, a
  round stage with a lit rim, podiums, an LED wall running a wave in the topic's colour, moving heads on a
  truss whose beams cut the haze (three on phones), the crowd in the dark. A right answer turns it green and
  the crowd jumps, a wrong one flashes red, a boss question goes gold, the lightning round strobes. The
  header and answers sit on dark panels so they read over it.
- **Checked:** screenshots of all six at 1280 and three at 390; axe clean (390 light, 1280 dark) while
  playing, no sideways scrolling; `pnpm check` clean.

## M105: two new games, Fire Line and Reef Rescue (4 Nov 2026)

The owner: "add some unique games also". Two original games (our own designs, no copy of any game),
each in an app that had only two, both realistic from the start on the M102–M104 parts.

- **Fire Line** (Relief, big, 150 s; rules in `src/lib/play/wildfire.ts`, tested; view `FireLine.tsx`): a
  dry forest valley from the air (a 40 × 24 grid: forest, meadow, rock, a lake, three 2 × 2 villages).
  Lightning starts fires on a seeded schedule (never within 9 cells of a village), the wind turns every
  20–30 s, and a fire tick every 650 ms lets each burning cell light its neighbours (`igniteChance`: forest
  more than meadow, downwind far more than upwind, never rock, water or wet ground). The tick's random
  numbers come from the seed and the tick number, so a room's valleys only differ by how each pilot fights.
  Steer the water bomber (`steer.ts`, like Flood Rescue) over the lake to fill its tank (3 drops), drop
  with Space: every burning cell in reach goes out (30 points, once per cell) and the ground stays wet.
  A village caught costs 400; 1.5 s before the end the villages still standing (2,000 each) and the
  forest still green (up to 3,000) are added and announced. Cap 40,000 (tested), par 20,000.
  Drawn on `world/board.ts` ('top', tilted 34°): the ground's vertices on the box's own grid coloured by
  cell (ash, wet, burning), ~1,700 instanced trees that turn orange then black, instanced flame and smoke
  quads facing the camera, a ring on the ground where the water lands, steam puffs, the bomber's shadow.
- **Reef Rescue** (Green, 3D world, 240 s; rules in `src/lib/play/reef.ts`, tested; view `ReefRescue.tsx`):
  swim a reef (forward goes where you look, up and down too; Space/Q up, C down, Shift fast; phones: the
  joystick and Use / Up / Down). Take coral from the nursery to the eight bleached patches and plant it (E:
  600, it grows), hold E 1.6 s by a ghost net to free its turtle (1,000, it swims off), collect 22 pieces
  of plastic (80), keep off the jellyfish (−150, a stun). Air lasts 80 s under water and fills at the
  surface; out of air, you're carried up. Everything done ends the round early with 2,000 and 10 a second
  left. Cap 18,000 (`reefBest` under it, tested). The look: caustics rippling on the sand (added to the
  sand's light in its shader), the surface from below (bright straight up), shafts of light, swaying sea
  grass (moved in the shader), corals, rocks, three schools of fish, marine snow, jellyfish that pulse, a
  diver whose fins kick. In a room the others are drawn too (`Crowd`).
- **Registered:** `GAME_IDS` / `GAMES` (`src/lib/play.ts`), `GameStage` (views, preload, controls),
  `GameIcon` (Flame, Fish), the arcade's cards (a Fire Line scene; Reef in the 3D worlds), the counts on the
  landing and in apps.ts ("Thirteen games"), the screen-text catalog, `big-games.test.ts` (13 games, four
  worlds; Relief and Green have three each). No database change: scores keep the game's id as text, the
  room and leaderboards take any id in `GAME_IDS`. The turtle model moved to `world/props.ts` (shared with
  Ocean Cleanup).
- **Checked:** screenshots at 1280 and 390, the Play home; axe clean (390 light, 1280 dark) while playing
  after making the "burning" chip orange-700; the fire was slowed after the first try (a village burned in
  14 s); `pnpm check` clean.
- **After the production build** (`pnpm local:build` passed): each 3D game now frees its effects
  passes when it closes (`World.dispose`: three's `EffectComposer.dispose` doesn't); the satellite map's
  shallows are three widening strokes instead of a canvas blur (Safari doesn't draw `filter`); Fire Line's
  two flames per cell sit either side of the cell's middle.

## M106: Relief for organisations: NGOs, supplies, volunteer shifts (4 Nov 2026)

The owner: "can you improve the whole system do anything what you can do". The next of the owner's
seven ideas (25 Oct, "work on all 7 of them"): organisation accounts for Relief. Migration **0192**.

- **What people get** (Relief → Organisations, `/relief/orgs`; phone tab "Orgs"): start an organisation
  (NGO, food bank, shelter, clinic, faith or community group, school) or join one with a 6-character code
  (`?join=<code>` opens it filled in). Its page (`?org=<id>`, no `[id]` route) has five tabs: Overview
  (four `FactorCard`s, About, the invite code for coordinators, Leave), Needs (what it handles; open needs
  within ~25 km of its base, most urgent first, "Take for <org>"), Supplies (+/−, set a count or "+20" /
  "−5", running-low level, the last 40 changes with who), Shifts (create, sign up, cancel; names of who's
  coming), Members (roles, remove). The Organisations home lists my organisations, my shifts and every
  open shift that still needs people (next 30 days). On the map, a coordinator can post "as" the
  organisation, and cards say "Offered by <org>" / "<org> is helping".
- **Server** `src/server/relief-orgs.ts` (rules in `src/lib/relief.ts`: `RELIEF_ORG_ROLES`, `runsOrg`,
  `mayChangeRole`, `supplyLow`, `nextQuantity`, `shiftState`). Non-members get 404 for an organisation.
  OWNER does everything but leave it ownerless; COORDINATOR runs it but only moves volunteers;
  VOLUNTEER sees it and changes stock counts (not the item). A count changes in one SQL statement
  (`MIN(1000000, MAX(0, quantity + ?))`) and is logged in `relief_supply_moves`. A shift place is taken
  by a guarded update (`filled < slots`) before the sign-up row, given back if the row already existed.
  The last member leaving deletes the organisation (cascade). Caps: 5 started per person, 500 members,
  200 items, 100 shifts ahead. Every change `publish`es a `refresh` of `/relief/orgs/<id>` and
  `/relief/orgs` to the members (no polling).
- **Relief changes** (`src/server/relief.ts`): `relief_posts.orgId` (posted in its name, coordinators
  only) and `helperOrgId` (taken for it); its coordinators can deliver or give back what it took
  (`reliefAction` takes the body now). `shape` adds `org`, `helperOrg`, and `helping` for them.
- **Notifications** (bell and push, `email: false`): a join (to coordinators), a role change, a sign-up
  (to the shift's creator), a cancelled shift (to everyone signed up), and a daily-job step
  `relief-shifts` (`shiftReminders`): "starts in about N hours" for shifts in the next 24 h, once each
  (checked by the notification's link), so no time zone is shown wrong.
- **Not merged with the school's NGO marketplace on purpose**: `ngos` / `ngo_projects` /
  `volunteer_shifts` are school-admin records (80G receipts, QR check-in for students); Relief
  organisations are self-serve communities with members. A later item could let a school's NGO link
  to a Relief organisation.
- **Sample mode**: `sampleReliefOrgs` / `sampleReliefOrg` (`src/lib/sample/impact.ts`: a food bank I own
  and a shelter I volunteer at), and `/relief/watch` now answers `null` in sample mode (it reached the
  real server before).
- **Trap found**: `.input` is declared in `@layer utilities` after Tailwind's own utilities, so
  `w-20`, `py-1.5` and the like on an `.input` do nothing (sitewide, older code too). Size a wrapper
  instead (the stock count field). Fixing the layer would change many inputs at once: left for a sweep.
- **Not done (later)**: SMS / WhatsApp requests into an organisation's inbox (needs a Twilio or WhatsApp
  Business account: **[owner]**, M107 builds it behind a switch, off); a public organisation page.
- **Checked**: `scripts/checks/relief-orgs-ui.mjs` (start, join, counts, a volunteer refused a rename,
  a full shift refuses a third person, take for the organisation, volunteer can't deliver, coordinator
  can; every tab at 390 and 1280, light and dark, axe clean, no sideways scrolling, no page errors);
  `src/server/relief-orgs.test.ts` (rules, guarded shift place, stock log, owner rules); `pnpm check`.

## M107: Relief text requests (SMS / WhatsApp) into an organisation's inbox, behind a switch (5 Nov 2026)

The rest of the owner's Relief idea: "SMS/WhatsApp requests behind a switch". Migration **0193**.
**[owner]**: off until the owner turns on "Relief text requests" (console → Server → Feature
switches, opt-in like live air traffic) and sets `TWILIO_AUTH_TOKEN` in Cloudflare; Twilio charges
for each message in and each thank-you reply.

- **How it works**: someone without the app texts an organisation's Twilio number (SMS, or WhatsApp
  through Twilio). Twilio posts to `POST /api/core/relief/texts/inbound` (public; the Worker refuses the
  path while the switch is off). `src/server/relief-texts.ts` checks `X-Twilio-Signature`
  (`twilioSignature`: base64 HMAC-SHA1 with the Auth Token over the URL plus the sorted form fields;
  compared without early exit), finds the organisation by `relief_orgs.textNumber` (E.164,
  `textNumber()` in `src/lib/relief.ts` also reads `whatsapp:+…`), files a `relief_texts` row (body ≤
  1,000), tells its coordinators (bell and push, no email) and answers TwiML with one thank-you
  message. Unknown numbers and more than 10 messages an hour from one phone get an empty answer (no
  paid reply, nothing filed). The signature covers `req.url`: the webhook in Twilio must be exactly
  `https://universeimpact.com/api/core/relief/texts/inbound`.
- **Coordinators only** see texts (they hold the sender's number): `GET /relief/orgs/:id` adds
  `textsOn`, `texts` (new ones and the last 14 days) and `org.textNumber` for them, `null` for
  volunteers. Needs tab → "Text requests": the message, the number as a `tel:` link, "Put on the map",
  "Text back" (`sms:`, from their own phone: we send nothing ourselves) and "Handled"
  (`POST /relief/texts/:id/close`). The number is set in Overview → Edit (only shown while text requests
  are on; one organisation per number).
- **Put on the map**: `/relief?text=<id>&org=<id>` opens the map's form filled from the message
  (`guessNeed` in `src/lib/relief.ts`: kind by words, people from "family of 5" / "3 children",
  urgency from "urgent" / "emergency", a title of ≤ 80 characters) in the organisation's name, with a
  warning to take out names, addresses and phone numbers. `createReliefPost` with `textId` checks the
  text first (`textToPost`: a coordinator of the same organisation, not posted yet) and marks it POSTED
  after (`textPosted`).
- **Fixed on the way**: the map's form forgot everything typed when "Tap the map" was pressed (it was
  unmounted and remounted). Its draft now lives in `ReliefApp` (`Draft`, `EMPTY`).
- **Not built**: replies sent by UniVerse (would need Twilio's REST API and the account SID: more paid
  messages); a shared number for the whole site (each organisation brings its own).
- **Checked**: `src/server/relief-texts.test.ts` (the signature against Node's own HMAC, off/unset,
  wrong token, a body changed on the way, filing and the reply, unknown number and flood, numbers and
  guesses); `scripts/checks/relief-orgs-ui.mjs` now also: the webhook refused while off, texts for
  coordinators only, closing, a text posted only in its organisation's name, and the text put on the
  map from the form (kept while the place is tapped); `pnpm check`.

## M108: the EU Digital Product Passport for Trace: GTINs, GS1 Digital Link, a supplier portal (5 Nov 2026)

The owner's seven ideas: "the EU Digital Product Passport for Trace (GS1 codes, supplier portal)".
Migration **0194**. Rules in `src/lib/dpp.ts`, server `src/server/trace-dpp.ts`.

- **What a brand gets** (Trace console → each product → "Digital Product Passport", loaded on open with
  `next/dynamic`): the product's GTIN (8/12/13/14 digits, check digit checked, stored as GTIN-14, one
  product per GTIN) and the passport after the Ecodesign regulation (2024/1781): maker (legal name,
  address, website), made in, materials (share, recycled share, origin, supplier), substances of
  concern (CAS numbers checked) or "It has none", carbon footprint and method, recycled content and
  recyclability, years it lasts, repair score, spare-part years, care, repair, end of life,
  certifications, documents (https only). A checklist (`DPP_PARTS`, `dppScore`) shows the 10 parts
  and what's missing; the button shows "n of 10".
- **Public**: every unit's page (`/t/<code>`, `scan()` adds `gtin` and `dpp`) shows a "Digital Product
  Passport" card (`src/components/trace/DppCard.tsx`, longer texts in `<details>`); the product's page
  `/dpp?g=<GTIN>`; the JSON `GET /api/core/trace/dpp/<GTIN>` for customs, shops and recyclers (sample
  products never answer). `/t/demo` has a full sample passport (GTIN `09520123456788`: GS1 keeps prefix
  952 for examples, so it's nobody's real product).
- **GS1 Digital Link**: with a GTIN, the print sheet's QR codes (and the CSV) hold
  `https://universeimpact.com/01/<GTIN>/21/<code>` instead of `/t/<code>`: shop tills that read GS1 QR
  codes (GS1's "Sunrise 2027") get the GTIN, phones get the passport. The Worker answers `/01/…` before
  Next.js (`cloudflare/page-match.ts` REDIRECTS, `gs1Target`): with a serial (AI 21: our signed code)
  to `/t/<code>`, without to `/dpp?g=<GTIN>` (AI 10 lot kept as `&lot=`); anything else to `/dpp`,
  which says there's no passport (so a made-up address never starts Next.js: `page-routes.test.ts`). `src/app/01/[...gs1]/page.tsx` does the same for `next dev`. `pageFor` no longer adds
  a bare "?" to a redirect without a query.
- **Supplier portal**: "Ask your suppliers" makes a link per material (`/supply?k=<32 characters>`,
  shown once with Copy; only its SHA-256 is stored; 60 days; "New link" replaces it). The supplier
  needs no account: they fill in the material, origin, maker, shares, footprint, certifications and
  document links (`parseSupplyAnswer`), can correct it until it's used, and the brand's members hear
  (bell, no email). "Add to the passport" merges it (`mergeSupply`: replaces a material of the same
  name, keeps documents once). Nothing a supplier sends is public until the brand adds it.
- **Trap**: a brand could enter a GTIN it doesn't own (first come, first served). Checking ownership
  would need GS1's "Verified by GS1" API (paid, an account: **[owner]** if wanted). The page says the
  brand declares it.
- **Not done**: the battery passport's extra fields (2027), access levels for authorities only, JSON-LD
  in the GS1 web vocabulary, a supplier answering for several products at once.
- **Checked**: `src/lib/dpp.test.ts` (GTINs, GS1 routing, cleaning, score, merging) and
  `src/server/trace-dpp.test.ts` (wrong check digit, another brand, public view, sample products, the
  link's hash, expiry, answering, adding); `scripts/checks/trace-dpp-ui.mjs` (all of it through the API
  and the pages /dpp, /t/<code>, /supply and the editor at 390 and 1280, light and dark: axe clean, no
  sideways scrolling, no page errors); `pnpm check`.

## M109: a health check of the whole system before merging (5 Nov 2026)

- **Live errors** (production `error_reports`, read-only): nothing new from real people since M95; the
  only reports of the last ten days are our own test browsers (HeadlessChrome, after the 4 Nov deploys,
  filed as ignored) and the sample world's made-up rows. Nothing to fix.
- **Text fields ignored the sizes screens asked for** (found in M106): `.input` sat in the utilities layer
  after Tailwind's own utilities, so `w-*`, `py-*`, `text-*` and `rounded-*` on a field did nothing (106
  files: compact selects in rows, small count fields, the Relief alerts' "Within" select stretched to
  full width). Its width, padding, corners and text size now sit in `:where(.input)` (no specificity,
  like M90's side padding), so a utility wins and a bare `.input` looks as before. Phones still get 16 px
  text (the touch rule's `!important`), so fields never zoom the page.
- **Libraries**: overrides for KaTeX inside mermaid (0.16 → 0.18.9, the version we use directly: one copy,
  and an advisory fixed) and webpack for the offline-app builder (5.97 → 5.104.1). `pnpm audit --prod`:
  10 → 7. Left: body-parser (high, inside the build tool's local server; its fix turns two weeks old
  today, a scheduled task applies it), serialize-javascript (low, two weeks old tonight), deepmerge (low,
  no fix yet), glob/minimatch (moderate, only new majors under two weeks old).
- **Production build** (`pnpm local:build`) passes with everything on the branch (M102–M109); its one
  warning (a duplicate `case` in a third-party PDF chunk) isn't ours. On the built Worker:
  `relief-orgs-ui.mjs` and `trace-dpp-ui.mjs` pass (GS1 addresses answered by the Worker with a 302),
  the pages with compact fields render without errors.

## M110: the size alarm and Relief's emergency line (the council, 5 Nov 2026)

- **The council** (5 Nov; read-only counts on the live site): 8 real accounts, 2 used it this week, no
  new sign-up in 30 days, no real use of UniVersity, Trace or Relief in 30 days; the server code at 48.3
  of Cloudflare's 64 MiB (43 in October) and builds at 15–20 of their 20 minutes, with nothing warning
  before either wall. Its call: a 30-day pause on new apps, games, looks and graphics; one real class on
  UniVersity; this alarm and Relief's line (M111–M114 do the rest). The owner: "do whatever the council
  said".
- **Size alarm** (`scripts/worker-size.mjs`): measures what the next deploy uploads in about a second.
  esbuild bundles `cloudflare/worker.ts` as wrangler does (minify, keepNames, production, workerd
  conditions) with Next's server handler left out, then adds the handler file's size and each
  WebAssembly module once. 5 Nov: 49.0 MiB against wrangler's exact 48.3 (wrangler re-minifies the
  handler a little), so it errs ~0.7 MiB high. A warning past 55 MiB, a stop past 60 MiB; build minutes
  from `node_modules/.cache/universe-build-start.json` (written by `build-budget.mjs`, the build's first
  step, so the install isn't counted), a warning past 16.
  - Runs before every `wrangler deploy` and `wrangler dev` (`wrangler.jsonc` `build.command`, watching
    only `.open-next/server-functions`, so editing files never re-runs it) and at the end of
    `pnpm local:build` (`--strict`). It stops only on Cloudflare (`WORKERS_CI`) or with `--strict`; the
    build variable `SIZE_ALARM_OFF=1` lets one deploy through; it never stops a deploy because it
    couldn't measure. A full `wrangler deploy --dry-run` (the exact number) takes over a minute, which is
    why the deploy doesn't run one.
  - Adds `server` and `minutes` to `.open-next/assets/build-size.json`: Console → Health numbers → App
    size shows "Server code" and "Build time", red past the warnings, and the App size tile warns.
  - **Trap:** the deploy command runs `d1 migrations apply` before the deploy, so a stopped deploy has
    still applied its migrations (as with any failed deploy: keep migrations additive).
  - **When it warns, make it smaller**, biggest first (measured 5 Nov with the alarm's own esbuild
    pass): Next's server handler is 41.7 MiB; our direct API path (`cloudflare/worker.ts` →
    `api-direct.ts`, `fast-*.ts`) bundles a second copy of the server code it calls (~2 MiB of
    `src/server` minified, plus @google/genai, zod, ethers, stripe). Rarely used heavy libraries behind a
    dynamic `import()`, or one app in its own Worker (service bindings), are Cloudflare's own advice.
- **Relief:** the "I need help" form says "UniVerse isn't an emergency service. If anyone is in danger,
  call your local emergency number first (112 in Europe and India, 911 in North America)." The reply to a
  texted request (M107) ends "In danger? Call your emergency number now." (plain ASCII and short: one
  160-character text for organisation names up to ~60 characters).
- **Checked:** `src/lib/worker-size.test.ts` (levels, thresholds, minutes), `relief-texts.test.ts` (the
  reply); a real `wrangler deploy --dry-run` runs the alarm first ("[custom build] Server code: 49.0 of 64
  MB") and a failing alarm stops it before any upload; `pnpm check`.

## M111: the launch focus in the guide, and the guide trimmed (the council, 5 Nov 2026)

- **The pause is a rule now** (AGENTS.md §4, first bullet): until 5 December 2026 no new apps, games,
  looks or graphics; fixes for what real people hit, safety, library updates and what the first real
  class needs; the goal is 10 real people who come back on another day (Console → Overview → Real
  people). An agent asked for something new says once that it's paused and why, then does what the
  owner decides (the owner can always override). On 5 December: each app's numbers with the owner,
  then keep / Lab / remove.
- **§4 "Where things stand"** lists what's live by area with the M numbers to look up, instead of four
  pull requests' worth of items (8,500 → 4,500 characters). The [owner] list, the next numbers and the
  waiting-on-the-owner list are unchanged.
- **§8 "Design and motion"** keeps the live look (M91), the rules that carry over (the classes that
  carry the look, Urbanist, `--radius-card`, `<Accent>`, no eyebrow labels, the river), the motion layer
  and the reading rules. The M52 navy and M53 violet paragraphs are gone: M91–M94 replaced them, and
  `.btn-primary` is a white pill in dark mode and an ink pill in light mode (`globals.css`, the M91
  block), not the Baby Pink they described.
- **Left as it is:** the handoff file (each session reads only the notes it needs) and the plan's old
  queue text (history).

## M112: lead with UniVersity; the other four apps marked Lab (the council, 5 Nov 2026)

- **`lab` on an app** (`src/lib/apps.ts`): Trace, Relief, Green and Play carry it; `<LabTag>`
  (`src/components/apps/LabTag.tsx`, real text, 11 px) shows "Lab" after the name on the landing's app
  tabs (not the small sign-in tabs: no room), the landing's apps grid ("The ones marked Lab are new."),
  the hub's app cards and the side menu's app switcher. On 5 Dec the owner decides per app from the
  Real people numbers; removing `lab` is a one-word change.
- **One line for what UniVerse is:** UniVersity stays the default tab; the FAQ's "What is UniVerse
  Impact?" leads with UniVersity and "What does Lab mean?" is new; the page description (search results,
  link previews) now starts "A calm place for a school's classes, grades and messages".
- **Rated games off the public page:** Play's "Worlds to explore" shows Skyline Obby, Orbit Breach (12+)
  and Reef Rescue, not Night Shift (18+) or STORMFALL (16+); the Play text and FAQ no longer name
  STORMFALL, and Play's one-liner is "Thirteen games that teach, solo or with friends." Both games stay
  on /play behind the age check: nothing was removed from Play.
- **Checked:** `scripts/checks/launch-focus-ui.mjs` (M113's commit; the landing's four tags, UniVersity
  chosen, the Lab question, Play's worlds without the rated ones, the hub's tags; axe at 390 and 1280,
  light and dark), `landing-here-ui.mjs` again; `pnpm check`.

## M113: a teacher brings a class into UniVersity (the council's first ten, 5 Nov 2026)

- **Found by walking the path** (none of it had been tried end to end):
  1. A student had no way to join a teacher's course themselves: no link or code ("your teacher or
     admin enrolls you"), although `POST /courses/:id/enroll` existed (the campus network uses it).
  2. The landing's "Learn" leads to "I'm a student", whose account stays shut (`awaitingApproval`: only
     the application page) until an admin checks a student card, "a day or two": a class of 30 meant 30
     approvals before anyone saw anything.
  3. A new teacher waits for an admin (by design: staff see students' work). The owner gets an in-app
     notice and approves at Admin → Approvals. Left as it is.
- **The class link `/join?course=<id>`** (`src/app/join/page.tsx` sends `?course=` to `CourseJoin`;
  `?code=` is still a school's emailed invitation). `src/lib/course-invite.ts` keeps the class on the
  device for a day (`uv-join-course`, course-id-shaped values only), so sign-up and sign-in (Google's
  window, a new tab after checking an email) come back: `homeFor` sends a STUDENT with a waiting invite
  to the link. The card reads `GET /api/core/courses/:id` (the catalogue view; people already in it get
  the full view with `enrollments`) and joins with `POST /courses/:id/enroll` (a place, or the
  waitlist). It covers signed out (Create my account → `/register?app=campus&as=student`; Sign in →
  `/login?…&next=`), join, already in, not published yet, full, the teacher's own link and a staff or
  parent account; the invite is forgotten once nothing is left to come back to, and on "Not now".
  **Trap:** the platform API is `/api/core/...`; `/api/courses/:id` has no route of its own.
- **Signing up from a class link:** a Student with `accountType: INDEPENDENT` (the existing no-wait path:
  an independent learner's account opens straight away), the "Which describes you?" question hidden, one
  line saying so, "Continue as a student". Nothing new is allowed: any independent learner could always
  sign up and join a published course through the API.
- **The teacher's side:** "Invite students" in the course header (for the teaching team who manage it)
  opens a sheet with the link, Share (the phone's share sheet, else WhatsApp) and Copy (`InviteButton`
  takes `href` now); an empty course says "No students yet" with the same link on its Announcements tab.
  A draft course offers "Publish <code>" instead (only published courses can be joined; `courseAccess`
  selects `status` now so the board knows).
- **Not done (the pause):** a class code to type in, a QR code, a notice to the teacher per join (the
  class list shows them), verifying a student card later for someone who came from a link.
- **For the owner:** when your teacher signs up, approve them at Admin → Approvals (you get a notice).
  They make or open a course, tap Invite students (Publish first if it's a draft) and send the link to
  the class; each student signs up from it and is in the course a minute later.
- **Checked:** `src/lib/course-invite.test.ts` (a day, course ids only, cleared; homeFor sends only a
  student back); `scripts/checks/launch-focus-ui.mjs` on the built Worker: a draft course made for the
  check, "No students yet", Publish, the link, the Invite students sheet; a student joins in one tap and
  lands on the course (enrolled on the server), the link again says "You're in"; a student with a
  waiting invite is sent to it, "Not now" goes home and forgets it; signed out: the invite, then sign-up
  with the account-opens-now line, no student-card question, "Continue as a student"; the teacher's own
  link; the course deleted afterwards. Axe clean at 390 and 1280, light and dark. It also covers M110's
  Relief line (shown for needs, not offers) and M112. `landing-here-ui.mjs` and `relief-orgs-ui.mjs`
  pass again; `pnpm check`; the production build (the M110 alarm said 49.0 of 64 MB, 7.9 minutes).
- **Trap:** `/app` (the installed app's start) decides in an inline script before React, so it doesn't
  look at a waiting invite; sign-up and sign-in use `homeFor`, which does.

## M114: who may call each API route, checked by a test (the council, 5 Nov 2026)

- `src/lib/route-gates.test.ts`: every `src/app/api/**/route.ts` calls one of the shared gates
  (`getSessionUser`, `route(req, …)` from `server/assignments`, `requireAdmin`, `requireFeature`,
  `authorize`, or `publicRoute`, which says it's public), or is on `OPEN` with the reason it answers
  without a sign-in. An entry that guards itself another way names the check its file must contain:
  the cron jobs' secret header, the payment webhooks' signature checks, a school's API key (OneRoster,
  the REST API), the token in a private link, the platform router. 55 of 546 routes are open; none of
  them asks for emails or phone numbers itself (the API-key ones serve a school its own people). A stale
  entry (gone, or now signing people in) fails too.
- The platform API's own routes (`src/server/modules`, behind `api/core`) sign people in unless declared
  `public: true`: all 21 declarations are listed with why (keep each on one line so the test can read it).
- **Checked:** the test fails on a probe route with no gate (made and deleted for the check).
- **Adding a route:** use a gate. If it truly must answer without a sign-in, add it to `OPEN` with the
  reason and the check it does instead; never return emails or phone numbers from it.
- **Libraries** (`pnpm audit --prod`: 7, as M109 left them): nothing more could be pinned under the
  two-week rule today. body-parser 2.4.0 (the high one, inside the build tool) turns two weeks old at
  11:39 UTC and the scheduled task applies it at 12:00; serialize-javascript's fix tonight; glob and
  minimatch only have new majors under two weeks old; deepmerge has no fix.

## M115: body-parser 2.4.0, the last high library issue (scheduled, 5 Nov 2026)

- The scheduled task from the owner's "please do all the still to do" (4 Nov), run once body-parser
  2.4.0 (published 22 Oct, 11:39 UTC) was two weeks old. Root `package.json` override
  `"body-parser@>=2.0.0 <2.4.0": "2.4.0"`: scoped and pinned like the newer overrides (the task said
  `"body-parser": "^2.4.0"`; the lockfile only ever had 2.3.0, inside the build tool's local server, so
  the scoped pin does the same today and can't pull a release under two weeks old later).
- `pnpm audit --prod`: 7 → 6, no high or critical left. Still open: glob and minimatch (moderate, only
  new majors as fixes), serialize-javascript (low, its fix two weeks old tonight), deepmerge (low, no fix).
- **Checked:** `pnpm install` (lockfile: body-parser 2.4.0 only), `pnpm check`.

## M116: the first impression, bigger and more striking (the owner, 6 Nov 2026)

- **The ask and the pause:** "Please upgrade the project into something really big and attractive". The
  launch focus (AGENTS.md §4) pauses new looks and graphics, so the owner was asked once; they chose
  **"Polish the first impression"**: the landing page and UniVersity's first screens (sign-up, sign-in)
  more striking, in the current look; everything else stays paused.
- **The student home under the hero** (`src/components/landing/ProductWindow.tsx`, UniVersity's tab only):
  a big picture of `/student` as it really looks in the M91 look (the near-black menu with the white
  pill, the frosted headline cards with `.karma-icon`, big numbers with a small unit, pink only for the
  live class, the unread count and the newest mark). Drawn in HTML (no image files), so it stays sharp
  and follows the look; a window from 768 px, a phone below. It lies back (rotateX 24°, scale 0.88) and
  tilts up flat as it scrolls in (a spring on the scroll, transform only), pulled up under the hero on
  wide screens (`lg:-mt-40`) so its top shows on the first screen. One `role="img"` with a label; nothing
  in it is a control. Reduce Motion: flat and still. A made-up student (Maya) on the real screens; no
  usage numbers. **If the student home changes a lot, change the picture too.**
- **Bigger hero:** headline `text-[3.25rem]` → `xl:text-8xl` (96 px from 1280), buttons a size up
  (`HERO_BTN`), the line under it `sm:text-xl`; on phones a dark text shadow where the river runs straight
  behind the words (the river itself is untouched). **The headline's words had no spaces** (inline-block
  spans with a margin): screen readers, search and copy-paste read "Theschooldayrunsitself.". Now each
  word is followed by a real space (`Fragment` + `' '`).
- **Bugs fixed on the way:**
  1. **Sign-in and sign-up on phones were wider than the screen:** the form's column (`AuthFrame`, a flex
     item) took the app tabs' full width, and the page's `overflow-x-clip` hid it, so the form's right
     edge ("Forgot pass…", the role buttons) was cut off and "no sideways scrolling" checks passed.
     `min-w-0` on the column. **Trap:** a flex or grid item holding a scroller needs `min-w-0`; check
     "nothing past the right edge", not only `scrollWidth` (the new check does).
  2. **Glass (§8):** the sign-in and sign-up cards (`/75` + `backdrop-blur-md`: the river showed
     through), the scrolled top bar and its phone menu, the app tabs, the landing's cards (`glass` in
     `bits.tsx`, renamed `tile`, now solid `#111113`) and the cookie notice are solid now.
  3. **Motion (§8):** no blur filters animated on the landing (hero words, the app switch, the hero
     scenes' feeds, the language word); the FAQ answer fades in under 300 ms instead of animating its
     height; the top bar no longer animates its width (`max-w-7xl` ↔ `max-w-5xl`, 500 ms): one width (the
     hero's, `max-w-6xl`), only its fill fades; buttons name their transitions; `hover:brightness` gone.
  4. The sign-in logo said "Universe IMPACT / Global Universities & NGO Network" (`UniverseLogo`
     `showText`, only used there): now "UniVerse Impact" like the website's top bar.
  5. The cookie notice is shorter (one line less on a phone) and sits in the safe area.
- **Checked:** `scripts/checks/first-impression-ui.mjs` (the headline's size and words, the picture as a
  phone or a window and flat when reached, gone on Trace's tab; sign-in and sign-up fit a 390 px screen;
  no glass on the cards, top bar and tabs; the logo; axe at 390 and 1280, light and dark);
  `landing-here-ui.mjs` and `launch-focus-ui.mjs` again (its hub scan now waits 2.5 s: right after the hub
  opens, its title is still fading in and axe measured the half-faded grey at ~1.7:1; 4 s later it's
  clean, so a timing fault of the check, not the hub); `pnpm check`; the production build (server code
  48.9 of 64 MB, 49.0 before).
- **Left out on purpose (the pause):** the in-app screens after sign-up (the student home itself), the
  other apps' tabs (only the shared fixes reach them), the rest of the landing's sections' layout.

## M117: a smoother first visit, and the picture never over the hero (the owner, 6 Nov 2026)

- **The ask:** "push and merge after that can you improve more like this and make everything ultra
  smooth"; then, with a screenshot of the live site: "the dashboard is not aligned properly here please
  fix that". PR #111 (M110–M116) was merged first and is live (no new real errors after it).
- **Measured** on the built site (a budget phone: 390 × 844, CPU 4×; page opens on Lighthouse's slow 4G;
  `smoothness.mjs`, `speed.mjs`, `bundle-report.mjs`, plus scratch scroll and idle-CPU profilers):
  - taps, menus and scrolling in the app were already smooth (1.0% slow frames); the landing scrolled at
    ~300–320 of 360 frames with 0–5 slow ones (runs differ by ±10 frames);
  - **the landing's headline appeared at 4.1 s** on a first visit: framer's `initial` sent the whole hero,
    and the website's top bar, at opacity 0 until all the page's script had run;
  - **the landing kept a phone's main thread 66% busy while it sat still**; with the hero picture hidden,
    20% (the river is ~13 points of it, the drifting corner lights ~6);
  - the landing loaded 318 KB of script (gzipped), the four Lab apps' sections and pictures included.
- **Fixes:**
  1. **The owner's screenshot:** `ProductWindow` was pulled up with `lg:-mt-40`, which covered "Get the
     app" and the hero picture's cards wherever the hero filled the screen (1280 × 720: 45 px). It sits in
     the flow now; the hero is `lg:min-h-[calc(100svh-9rem)]`, so the picture's top still shows on tall
     screens. The hero picture's third card spilled 17 px out of its 480 px box: 500 px now (and the
     sign-in picture box `.auth-scene` with its smaller steps). `first-impression-ui.mjs` checks both at
     six laptop and desktop sizes.
  2. **The hero shows at first paint:** `.hero-in` (made for this: it starts at opacity 0.001, so it counts
     as painted) in steps (`rise(ms)` in `page.tsx`) for the tabs, each word, the line, the buttons and the
     picture; the top bar drops in with `.nav-in`. `AnimatePresence initial={false}` keeps the tab-switch
     glides (only the first render skips framer).
  3. **The UniVersity picture's endless motion is CSS** (`.campus-turn`, `.campus-turn-back`,
     `.campus-breathe`, `.campus-wave` in `globals.css`): off the main thread, paused while scrolling (the
     `html[data-scrolling]` list) and off screen (`[data-away]`). The turn and counter-turn start and pause
     together, so the tiles stay upright.
  4. **The four Lab apps load on demand:** their hero pictures are in `HeroScenesLab.tsx` (split from
     `HeroScenes.tsx`, which keeps UniVersity's and the shared `still` / `useStep` / `pop`), and they and
     the Lab sections (`TraceSection`, `Business`'s four, `ImpactMore`'s three) are `next/dynamic` in
     `page.tsx`; a picture keeps its 480 px place while it loads. Sign-in's `AuthShowcase` too.
- **Results** (same machine, same settings):
  - landing, first visit: headline (LCP) 4096 → 1584 ms; script 318 → 284 KB; blocking 338 → 313 ms;
  - landing, return visit: LCP 1452 → 540 ms; the processor free 8 s later 36% → 68%;
  - landing at rest: main thread 66% → 44% busy; sign-in at rest 9%;
  - scrolling: unchanged (296–316 frames with the picture, 307–321 with it hidden: noise);
  - sign-in about the same (LCP 1.2 s; blocking 170–275 ms between runs; +2 KB of lazy-loading helper).
- **Rule:** what shows at first paint never uses framer's `initial` (the server sends it at opacity 0);
  give it `className="hero-in"` and a `rise()` step. An endless decorative loop is CSS, not a framer
  `repeat: Infinity`, and goes in the `html[data-scrolling]` pause list.
- **Not done (next):** the dashboard's first load (the hub is busy ~1 s and the student home ~0.7 s at 4×
  CPU: the shared app code starting up, no single component; M109's "what every dashboard page imports up
  front"); the four Lab pictures still loop in script (only on their tabs); the river stays as it is (the
  owner, M56a).
- **Checked:** `first-impression-ui.mjs` (with the overlap and spill at six sizes, and Trace's picture
  loading on its tab), `landing-here-ui.mjs`, sign-in's Relief picture loading on its tab, `pnpm check`,
  the production build (server code 48.9 of 64 MB).

## M118: the games without lag: lighter 3D drawing, a Graphics choice, memory given back (the owner, 6 Nov 2026)

- **The ask:** "when I was playing games it was alot of lag in the system please improve that and also
  see if any other problems are there". Live `error_reports`: nothing from Play. M102–M105 (4 Nov) made
  every game but two a 3D scene with the full effects chain, and their frame rate was never checked on
  a real device (this box draws WebGL in software).
- **Measured** with a counter of the WebGL calls each frame (draw calls; pixels written as "screens":
  each pass's size × its samples over the canvas's pixels), since this box can't time a real graphics
  chip. Skyline Obby on a computer, before → after (Balanced):
  - draw calls 705–747 → 421; pixels written 25.9 → 6.2 screens; shadow pixels 8.4 M → 4.2 M; passes
    23 → 15. Sharp (everything on): 723 draws, 7.9 screens, 4.2 M. Smooth: 359 draws, one pass.
  - shaders rebuilt mid-game: ~40 → none in 20 s of play (8 small effect shaders still build when a
    round starts).
  - WebGL contexts: 4 rounds made 4, gave back 0 until the browser got round to it → 4 of 4 at once.
  - the river behind a game: graphics thread 77% busy (the game's menu) → under 1% with a game open.
- **What cost so much** (all in `world/core.ts`):
  1. Ambient occlusion (GTAO) drew the whole scene a second time, and that second `render()` drew the
     sun's 2048² shadow map again. Now only in **Sharp**, and its scene view skips the shadow map
     (`shadowMap.autoUpdate` off around it).
  2. Every pass of the chain wrote 4 samples a pixel (both of the composer's buffers had `samples: 4`,
     and the canvas itself was `antialias: true` under the chain). Now only the scene's buffer is 4×
     (`sceneBuffer`, kept as the composer's read buffer after each frame: the chain swaps them).
  3. Output, film finish and the glow's own additive step were three full-screen passes: one now
     (`FINISH` on three's `OutputPass`, which keeps setting the tone-mapping defines; the bloom pass's
     blend draw is skipped through its private `_fsQuad`, three r180).
  4. The quality ladder waited for under 45 frames a second (45–59 juddered on), restarted at full
     quality every round, and its last steps rebuilt every shader mid-play (shadows off, then the
     effects chain off: the ~40 rebuilds above).
  5. `dispose()` freed only colour maps: normal, roughness and glow maps, shader textures and shadow
     maps stayed, and the context waited for garbage collection (a laptop's shared memory filled as
     rounds were played).
  6. The river (LightTrail) kept drawing full-screen at 60 frames a second under the game.
- **Fixes:**
  - **Graphics: Smooth / Balanced / Sharp** (`world/gfx.ts`, kept as `uv-play-gfx`), a button in every 3D
    game's bar (not Spot the Fake or World Pin): Smooth draws straight to the screen at 1× (edges
    smoothed there), no shadows or effects; **Balanced** (default) the sun's shadows, glow and film
    finish at up to 1.5×; Sharp adds the corner shadows at up to 2×. A change mid-round applies the
    sharpness and effects at once; shadows and edge smoothing from the next round. Phones keep their
    pipeline (no shadows, no chain); the choice only sets their sharpness (1, 1.5, 2).
  - **Frame pacing** (`Pace` in gfx.ts, tested): a frame is late past 1/55 s, or past the screen's own
    frame time and a tenth (measured once from 40 frames on the game's menu), so a 50 Hz screen or a
    battery saver's 30 isn't taken for a slow device. While the average is late, late frames add up
    (a frame counts at most 0.25 s, so a device at 3 frames a second still steps down); half a second
    lowers the sharpness a quarter step, to 0.6×; there the corner shadows go, then the glow; if even
    that is late (1.5 s), the next round starts a choice lower. Nothing in it rebuilds a shader. The
    sharpness that held is kept per choice (`uv-play-fit`) and the next round starts one step above it.
  - **Memory:** `dispose()` frees every texture on every material and shader, every light's shadow map,
    and loses the context when the canvas has left the page (`isConnected`: React's second effect run in
    development keeps it).
  - **The river rests** while the arena is open: `<html data-arena>` (arena.tsx) counts as hidden in
    LightTrail.tsx, like a hidden tab; it carries on when the game closes (it never stops while seen, so
    M56a's rule holds). The arena's grain lost its `mix-blend-mode` (it made the browser redraw the
    whole arena into a layer of its own every frame; on the dark stage it looks the same).
  - The frame-rate pill no longer wraps on phones next to the new button.
- **Rules for what builds on it:** never change shadows, `shadowMap.enabled` or the effects chain while
  a world runs (every shader is rebuilt); decide them in the constructor from `gfx`. A game doesn't
  set `renderer.shadowMap.enabled` itself (Night Shift did; World decides). A pass that renders the
  scene again turns `shadowMap.autoUpdate` off around it. New effects go into `FINISH` where they can.
- **Not done:** real frame rates need a real device (the owner: the gauge and Graphics in a game's
  bar); Ocean Cleanup's sea (clearcoat and shadows over the whole view) is the heaviest surface, left
  as it is; ~8 small effect shaders still build at a round's first frame; the big announcements keep
  their drop-shadow filter.
- **Also checked:** the live errors: the only real recent one (owner People, "too many SQL variables",
  31 Oct) was fixed by M73 on 1 Nov (to mark resolved); the rest are bots or the sample world's rows.
  GitHub's checks are green on the branch.
- **Checked:** `play-gfx-ui.mjs` (Graphics cycles and is kept, no button on flat games, the river flag,
  the context given back, axe clean at 1280 light and 390 dark touch, no sideways scroll), the counter
  on all 11 3D games (no page errors), pictures of Obby (all three choices), Fire Line and Night Shift,
  `gfx.test.ts`, `pnpm check`, the production build.

## M119: Play's page without the constellation and the player card (the owner, 6 Nov 2026)

- **The ask** (two screenshots of `/play`): "remove your game constellation from here and in 2nd pic it
  doesn't feel good to me so remove it and add this kind off something else".
- **Removed from `Arcade.tsx`:** the "Your game constellation" live card (`Constellation` and `LiveCard`
  stay: Green, the homes, Trace's wallet and the console use them) and the "Your player" card (level,
  XP bar, colours and hats). `PlayerCard.tsx` is gone; the 3D worlds' look helpers (`readLook`,
  `lookHex`) moved to `look.ts`, so a look chosen before still shows in the worlds. The hero no longer
  promises "level up to unlock new looks". XP still counts (the results screen shows "+XP").
- **Waiting on the owner:** what goes in the player card's place ("add this kind of something else");
  the launch focus pauses new looks until 5 December, so nothing was added yet.
- **Checked:** `/play` at 1280 and 390, light and dark: neither card, no sideways scroll, axe clean, no
  page errors; `pnpm check`.

## M120: CPU time: page changes from the cache, the spending check hourly (the owner, 6 Nov 2026)

- **The ask** (the dashboard: 5.87k requests and 752.84k CPU ms for 28 Oct – 6 Nov): "why the cpu time
  usage is till so high … only I am using this website … if 500 people login … I will hit the 30m
  usage within few days please fix this". That is ~128 ms per request (the guard's 31 days: 2.14 M ms
  over 25,320 requests, ~84 ms); Cloudflare's docs put an ordinary Worker at 2–20 ms.
- **Where it went.** Starting a Worker isn't billed, but running code for the first time in a fresh
  instance is: on the first request V8 compiles everything that request runs. Measured locally (the
  local runtime's CPU, `cpu.mjs` in the session's scratch: restart, one request, then three warm):
  - an in-app page change (an RSC request, always through Next.js): **1,440–1,800 ms** fresh, 54–146 ms
    warm; a profile puts ~785 ms of it in the bundle's lazy module start-up (compiling Next.js and the
    app's modules), the rest in rendering;
  - the 15-minute timer 103 ms fresh / 15 warm; a light-path API call 41 / 10; the landing (cached) 38 / 10.
  With one person using the site, most page changes found a fresh instance (idle instances are let go,
  and each deploy starts new ones), so they cost about a second each: most of the bill.
- **Fixes** (`cloudflare/worker.ts`):
  1. `edgeCachedPage` keeps prerendered pages' **in-app navigation data** in Cloudflare's cache too
     (an RSC request whose only query is `?_rsc=…`): kept per build and per hash of the router's
     headers (`RSC_VARIES`: rsc, state tree, prefetch, segment prefetch, next-url; Next.js answers
     differently for each), only when Next.js marks the answer `x-nextjs-prerender: 1` (the same for
     everyone), `text/x-component`, no cookie. The same page change on a fresh instance: 1,766 → 31 ms;
     warm 54–146 → ~8 ms. In-app navigation checked in a browser from both Next.js and the cache.
  2. The spending guard reads Cloudflare's numbers once an hour (the first quarter of each hour); the
     15-minute timer stays for scheduled-call reminders and the day's remaining steps.
- **For 500 people:** a busy site keeps its instances warm, so a request costs what the warm numbers
  say, not the fresh ones; one person's month doesn't multiply by 500. CPU past the 30 M included
  costs $0.02 per extra million ms (30 M more = $0.60). **The real risk is the guard:** it pauses the
  whole site at 90% of the included CPU (27 M ms). Whether to keep that pause for CPU, or allow some
  overage, is the owner's call ([owner]).
- **Not done:** the first change to each page after a deploy, per Cloudflare location, still starts
  Next.js (~1 s); making that cold path smaller (the 49 MB server bundle) is a bigger job.
- **Rules:** only answers Next.js marks `x-nextjs-prerender: 1` may be cached; a new header the router's
  answer depends on goes into `RSC_VARIES`.
- **Checked:** the page-change and timer numbers above, in-app navigation in a browser (fresh and from
  the cache, no errors), `pnpm check`.

## M121: Messages, professional: one solid workspace, phone fixes, mark all as read, keys (the owner, 6 Nov 2026)

- **The ask:** "can you improve the message section make it look like more professional and add more
  features there" (a screenshot of Messages), then "work on message section … forget about the council
  part just do whatever I said" (the owner's call over the launch pause).
- **What was wrong** (looked at 1440 and 390, dark and light):
  - on phones the message box was crushed to a thin column (letters stacked) by eight buttons, the chat's
    name was cut to "J…" by five header icons, and the Chats / Calls / Notifications tabs ran off the
    right edge;
  - on computers three see-through floating cards (rail, list, chat) let the pink river streak behind
    every message; glowing rings round unread avatars, coloured halos behind rows and the chat header, a
    glowing pink edge on unread rows, floating pinned avatars, gradient-and-glow bubbles, and a glowing
    orbit and four tiles as the empty side;
  - "Mark as read" (swipe or menu) only cleared the manual mark on the server (`markedUnread`), so a
    chat's real unread messages came back on the next refresh.
- **Look** (`MessagingHub`, `ChatWindow`, `Composer`, `CommsDeck`; the M121 block at the end of
  `globals.css`):
  - one workspace on computers: `.msg-ws` frames the rail, the list and the chat with hairline dividers;
    every surface solid (`--card-bg`, `--msg-chat`, `--msg-rail`): nothing of the page shows through;
  - bubbles solid: mine `#b5307d` (white 5.7:1) or the person's accent, theirs `--msg-theirs` with a
    hairline; unread counts the same pink; the send button the site's main pill (`--pill-on-bg`);
  - the rings, halos, edge, float, orbit and glows deleted (markup and CSS), not hidden;
  - the empty side: "Your messages", New chat / New group / Saved, the keys, the privacy line.
- **Phones:** the composer keeps emoji, "+", the box and send/voice; stickers, formatting, translate,
  suggest, rewrite and effects moved into "+" (their pickers still open: their wrappers are
  `max-sm:contents`); a one-word placeholder; the header keeps voice, video and info (and a live huddle's
  pill), with Search and Huddle in the info panel; the deck's tabs share the width, words only.
- **Features:** **Mark all as read** (✓✓ above the list when anything is unread; `POST
  /api/chat/conversations/read-all`, one update); "Mark as read" now sets `lastReadAt` too; **keys**:
  Alt+↑/↓ the chat above or below, Alt+Shift+↓ the next unread one (going round), Esc closes the open
  chat (not while typing or with a dialog or menu open); `nextChat` in `chat-client.ts`, tested.
- **Rules:** Messages' surfaces stay solid (`.msg-ws` tokens); new composer buttons go into "+" on phones
  (`max-sm:hidden`, a `sm:hidden` item in the menu); a header button on phones goes into the info panel.
- **Not done:** mark-all doesn't tell the senders' screens live (they see the ticks on their next look);
  the sample-data order of John Doe's three messages is the seed's.
- **Checked:** `messages-pro-ui.mjs` (solid panes, mark all as read surviving a reload, the keys, the
  phone box 166 px wide and the full name, axe at 1280 and 390, light and dark, no sideways scroll),
  `chat-keys.test.ts`, `pnpm check`, the production build.

## M122: every game almost full screen (the owner, 6 Nov 2026)

- **The ask** (a screenshot of Orbit Breach with margins round the game): "every game should be in almost
  full screen mode".
- **Why it wasn't:** the arena's content was capped at 1,152 px wide (`max-w-6xl`), each game again at
  `max-w-4xl`–`6xl`, and the play areas at fixed heights (`h-[min(76vh,760px)]` for the 3D worlds,
  `min(72vh,700px)` for the big games, 62vh for the map and the sorting line, an aspect box for Supply Run).
- **Now:** `.arena { --play-h: max(22rem, calc(100dvh - 10rem)) }` (the screen less the arena's bar, the
  timer and score row and a margin) and every play area sizes from it: `WorldFrame`'s default, Fire Line,
  Flood Rescue, Ocean Cleanup, World Pin (−4.5rem for its prompt), Recycle Rush (−6rem), Supply Run
  (−9rem for its rows), Type Race's race (−18.5rem for the typing), Quiz Clash's studio (`min-h`), Spot the
  Fake up to 1,280 px wide. The width caps are gone. The how-to line under the 3D worlds' frames went (the
  intro shows it before the countdown).
- **Measured** at 1440 × 900 (dev server): Skyline Obby, Fire Line and Quiz Clash 1,392 × 716–740 (77–79%
  of the screen), World Pin 72%, Recycle Rush 67%, Supply Run 64%; none of them scrolls any more.
- **Rule:** a game's play area takes `--play-h` (less its own rows above or below); no fixed heights.

## M123: Solar Voyager replaces Orbit Breach (the owner, 6 Nov 2026)

- **The ask** (a screenshot of Orbit Breach): "please remove this game because I don't like it just add
  something else related to space and technologies and shows beautiful planets and stars and system
  around that with realistic graphics".
- **Now:** Orbit Breach is gone (`OrbitBreach.tsx`, its rules in `worlds.ts` and their tests). In its
  place **Solar Voyager** (`voyager`, app `play`, 300 s, cap 15,000): fly a survey probe through the Solar
  System and stay near each of the eight planets to survey it (1,000 each, then a card with a real fact
  and two numbers); stardust on the way (25 each), a comet that passes the Sun halfway through the round
  (250 for flying close by), the asteroid belt between Mars and Jupiter (a bump costs 150, as do the
  planets, moons and the Sun), 15 a second left once all eight are done. Boost with Shift (phones: Boost)
  drains in 5 s and fills in 10. A marker names the planet to survey next ("Mars · 15 s away", or an
  arrow at the screen's edge); a map in the corner shows the orbits, the belt, the comet and you.
- **Files:** rules `src/lib/play/voyager.ts` (pure and seeded: planets, moons, dust, belt, comet path,
  start; tested in `voyager.test.ts`), the scene `src/components/play/SolarVoyager.tsx`, the shaders in
  `world/nature.ts`: `planetMaterial` (five kinds: `earth`, `desert`, `giant`, `rock`, `venus`, with
  bands, storm, air, tint and the rings' shadow on the globe), `ringMaterial` (the planet's shadow on the
  rings, the lit and unlit faces), `planetAir` (the glow at the edge, day side only), `sunMaterial`,
  `corona`. The room server now turns a saved room whose game no longer exists into Quiz Clash
  (`cloudflare/game-room.ts`), so an old Orbit (or later Reef) room can't crash the page.
- **Traps:** the comet is drawn from the seed **before** the belt (the belt's size differs between phones
  and computers; a room must share the comet). The camera's far plane is 4,000 (set after `new World`).
  Relief worked out from one pixel to the next (`dFdx` bump) showed square blocks close up: removed;
  craters are in the colour. The marker is placed with this frame's camera (`updateMatrixWorld` after
  `follow`) and hidden during the fly-in. M122's rule holds: no how-to line under the frame.
- **Checked:** `play-voyager-ui.mjs` (drawn, the marker, Earth surveyed by flying forward and its card,
  the phone's Boost / Up / Down, axe at 1280 dark and 390 light, no sideways scroll, no errors),
  `voyager.test.ts`, `pnpm check`; screenshots on the dev server.

## For the next agent: what the owner asked for that isn't done yet (6 Nov 2026)

Read `AGENTS.md` first (the owner is not a developer: plain words, merge only when they say "merge").
The next work number is **M124**. The owner asked for these in this conversation; do them in this order,
one commit and one note each, then ask the owner before merging.

1. **Replace Reef Rescue with a modern ocean game** (the owner: "remove reef rescue game and add
   something really modern and related ocean and it should be interesting for the people"). Remove it
   the way M123 removed Orbit Breach: `ReefRescue.tsx`, `src/lib/play/reef.ts` and its test, `reef` in
   `GAME_IDS` / `GAMES` (`src/lib/play.ts`; keep the per-app counts in `big-games.test.ts`: reef is app
   `green`), `GameStage.tsx` (the dynamic import, `preloadGame`, `CONTROLS`), `GameIcon.tsx`, `Arcade.tsx`
   (`WORLD_ART`), `ImpactMore.tsx` (`WORLDS`), `scripts/checks/launch-focus-ui.mjs`, AGENTS.md section 3,
   then `node scripts/gen-guide-data.mjs`. Ideas that fit "modern": an ocean-tech mission in a realistic
   3D sea (an underwater drone or a research submarine mapping a deep-sea vent and kelp forest, tagging
   whales and sharks for science, cleaning a garbage patch with a robot skimmer, in day-to-dusk light);
   reuse `world/core.ts` (World, Controls, follow, Crowd), Reef's swim loop and `lightBeam`, and the
   M118 rules (`world/gfx.ts`: never change shadows or effects mid-round; `World.dispose` frees all).
   Real facts like Solar Voyager's cards. Write the rules pure and seeded with a test, a cap test
   (`max <= GAMES.x.maxScore`), and a browser check like `play-voyager-ui.mjs`.
2. **Skyline Obby: a richer, more realistic world round the course** (the owner: "make the surrounding
   environment more realistic and add more contents and scenes in there as well as in background and
   surrounding that should look beautiful"; then "please add background exactly like this in the
   surrounding" with two pictures). **What the pictures show** (you can't see them): (a) a valley of huge
   floating rock mountains, tall and narrow, their tops covered in jungle, waterfalls pouring off their
   edges into white mist far below, layers of cloud and haze between them, the farther ones pale and
   blue, soft sunlight through the haze, birds; (b) curved natural stone arches and layered cliffs, green
   ledges floating at different heights, a turquoise lagoon below, the same misty depth. Build an
   original scene in that style (no film's names, creatures, vehicles or exact shapes): floating rock
   towers (`islandRock`, `rocks` in `world/nature.ts`) with jungle tops, waterfalls (a scrolling
   see-through strip plus mist sprites at the foot), the cloud sea (`cloudSea`) far below, distance haze,
   arches, a lagoon, birds. Keep the course itself and its rules unchanged (`obbyCourse` in
   `worlds.ts`). Background parts must be cheap: merged geometry, instancing, no new lights, decided when
   the world is made (M118).
3. **A sweep of the whole site for other problems** (the owner: "also see what else we can change in the
   system"). Main pages at 390 and 1280 px, light and dark: sideways scrolling, axe (serious and
   critical), see-through cards (the M91 look forbids glass), page errors; read the live `error_reports`
   first (AGENTS.md section 1). Fix what's found; list what's left for the owner.

**Waiting on the owner** (ask, don't decide): whether the spending guard should still pause the whole
site at 90% of the included CPU (M120); what, if anything, goes where Play's player card was (M119);
mark the 31 Oct error report resolved in the console.

## M124: the Ballast look in light mode, the Relay look in dark mode, the river remade (the owner, 8 Nov 2026)

The owner sent three "Ballast" reels ("make the whole website like this, professional, modern, futuristic,
ultra smooth"), then: blue accent and black buttons, dark stays the default with a switch on the website,
keep the river and the attractive animations, and finally the "Relay" recording: "I want the river to look
exactly like this… keep this theme for dark mode and colour". Merged at the owner's request (an
exception to the launch-focus pause, asked and answered).

- **Light mode (Ballast):** a cool light-grey page (#f1f2f4), white cards with a hairline and a soft
  shadow, ink text, black main buttons, one blue (#2563eb) for charts, icons, links, focus and what's
  chosen; the side menu white with the chosen entry a raised white card. All in the **M124 block** in
  `globals.css` (it replaces the M91 block: same variable names; Tailwind's indigo / violet / purple /
  pink / fuchsia / aqua are re-pointed to the blue in light mode and to lime in dark mode).
- **Dark mode (Relay, the default):** near-black (#070808), lime (#c6f24a) as the accent: main buttons
  lime with ink text (`--cta`, `.btn-primary`), chosen tabs, chart marks (`--ins-hot`), focus. **Trap:**
  white text on a solid accent fill would be unreadable on lime; one rule turns it ink in dark mode
  (`.dark :is(.bg-indigo-500, …, .bg-primary)`). Use `text-white` on accent fills only if that rule
  covers the class.
- **Type:** Inter (`/fonts/inter`, variable, OFL) everywhere; the headline's key word (`<Accent>`) in
  Instrument Serif italic (`/fonts/instrument-serif`, OFL), as in the recording. Canvas text says
  `Inter, system-ui` (games, tools, maps). Urbanist is gone.
- **The website follows the theme** (it was always dark): `ThemeSwitch` in its top bar
  (`src/components/marketing/ThemeSwitch.tsx`, the circular reveal from `applyTheme`). Parts drawn for a
  dark page carry **`.flip-light`**: in light mode their white and black swap and their greys run the
  other way. Parts that look the same in both themes opt out: `.flip-keep` (light cards), `.dark` /
  `.on-dark` (dark bands such as the planet section), `.live-card`. Use `bg-[var(--surface)]` and
  friends, not hard-coded `#111113`, inside the website. The "Here to…" row (M81) is removed, with its
  `?as=` sign-up link support.
- **The river** (`src/lib/river-paint.ts`, rewritten after many rounds with the owner; compare with the
  Relay frames before changing it): fine fibres wrap round a round U-shaped bend and fan out: each arm
  is a power of the distance from the bend (upper 1.4, lower 1.6), eased in near the tip by
  d² / (d² + R²) so the turn is round; the outer fibres stay steep, the inner ones turn tighter (the
  lower arm sweeps out almost flat). **Every fibre follows the river's path but moves in its own way**
  (its own sway, wavelength, speed, timing and breath, growing with the distance from the bend so the
  bend stays tight): the owner's words, "each fibre follows its own way of motion but follows the
  lines". Earlier rounds failed both ways: fibres taking different paths looked messy; all fibres
  moving as one looked like a single line. Mostly faint green strands, a few bright white-lime ones, pale cyan
  scattered through, a quarter out of focus behind (depth). Each fibre is **one smooth curve**
  (quadratic through midpoints; straight segments looked "not smooth"). A smooth olive glow round each
  bend and along the upper arm (`glowAt`: 24-step bell falloff, and a fixed grain over the soft layer,
  or the glow shows rings), specks near the bend, bends alternating sides down the page. **Depth of
  field:** sharp at the top of a page, out of focus a screen further down (`focus`; no CSS filter).
  Drawn at up to 2× (≤4.2 M pixels) so the fine lines are crisp. Light mode: the same river in blues.
  The landing's own river is `<LightTrail own hero />` (follows the theme); sign-in keeps `own tone="dark"`.
- **Motion kept** (the owner: "I need the river and good and attractive animations"): sparks, ripples,
  pointer light, tilt, magnetic buttons, card sheen and the section entrances all stay, recoloured from
  pink to the accent. Page entrances no longer animate a blur filter (§8: filters repaint every frame);
  they rise, scale a little and fade.
- **Libraries and skills:** framer-motion 14.10.1 (Motion; the owner's "add motion"). Skills added at
  the owner's request, each with a `SOURCE.md` (what was left out and why): `design-review` (no usage
  ping, no paid upload), `web-design-guidelines` (rules kept locally), `frontend-design`, `ui-ux-pro-max`
  (local search data), `design-taste-frontend` (written guidance only, no hook or scripts). The Apple
  design skill stays off the repo (no licence; Apple's text): `sh tools/setup-apple-design.sh`.
  Impeccable is unchanged (4.7.1; a newer copy exists, ask before updating).
- **Tested:** `pnpm check`; axe (serious/critical) clean with no sideways scrolling on `/`, `/login`,
  `/student`, `/hub`, `/student/settings` at 390 and 1280 px in both themes; the river compared frame by
  frame with the recording; the production build.
- **Left:** the iPhone launch screens (`public/splash`) still use the previous page colours (a shade
  off); the live cards' moving pictures keep their own dark look.

## M125: the river redrawn on the graphics chip, to match the Relay recording (the owner, 8 Nov 2026)

The owner sent the Relay screen recording again with a screenshot of the landing: the M124 river "is so
bad and it doesn't look same at all … keep the green colour brightness light", then "do whatever you
want or install whatever you can but I need the same result". Follow-ups while it was built: "each line
in the river flows in its own direction … there are some spaces between lines and every line is bended a
little bit from start", "those river have animations from start", "there are few lines and in your
river there are a lot of lines, match the exact amount", and "the bending does not match … it is a
little shrink" (the M124 bend was a narrow point; the recording's is a full, round C).

- **What the 2D canvas couldn't do:** hard 1-pixel strokes, light clipping into a hard white knot where
  fibres pack, no real soft focus. `src/lib/river-gl.ts` draws the river with **WebGL 2**: each fibre
  is a strip whose cross-section is a bell curve (width and blur per fibre, so out-of-focus fibres are
  wide soft bands); light adds up in a half-float buffer and is tone-mapped (`1 − e^(−x)`) at the end;
  a quarter-size glow layer (a halo round every fibre, the olive glow round each bend, the top-right
  haze, the pointer's light); glitter and bokeh as points; a fine grain in the last pass so gradients
  never band. Light mode: the same river in the light look's blues, as ink density.
- **The shape is computed on the chip** from 16 fixed numbers per fibre (`riverFibres`: spread at the
  bend, each arm's reach, length and lean, sway, bow, colour, width, blur, brightness): nothing but a
  few uniforms goes up per frame. `fibreX` in the shader is the river's path; the bends alternate down
  the page as before (`u_bend`), each arm keeps its own shape for the first 45% of the way to the next
  bend, then blends over.
- **Measured, not guessed:** the arms were fitted by counting strand positions along rows of the
  recording's frames and by overlaying renders on the frames (video green, river pink). Both arms are
  `m·u^q / (1 + u^q)` (round from the bend, levelling off): below, outer fibres reach 0.5 of the screen
  height and inner ones 0.8, the inner ones leaving almost sideways; above, the outer fibres rise nearly
  upright (reach 0.12) and the inner ones fan out (0.6), and the upper arm leans on towards the top
  right a third of a screen up (`k·d³ / (d² + e²)`). **Trap:** a reading off a scaled screenshot was
  wrong by 3×; measure on the frame's own pixels.
- **The owner's line rules:** 36 fibres (30 on phones), spread evenly so neighbours keep a gap; each
  bowed a little from the bend on (`f3.z`, `f3.w`), swaying with its own size, wavelength, speed and
  direction, and light running along it up or down; about 20–25 across the river at any height, the
  same as the recording.
- **Packed at the bend, scattered at the end** (the owner's next round, comparing the lower arm with the
  recording: "when it bends all the lines are stuck together and become bright … at the bottom the lines
  are scattered … each line moves different from the start, after the middle, and scattered again in the
  end"): most fibres sit in the middle of the bundle (`riverFibres`: `w` bunched round 0.5, a few fainter
  ones either side), so they leave the bend in one bright band; everything that's a fibre's own grows
  with the distance from the bend (`spread` in `fibreX`): its sway, its bow (`1 − cos`, so the fibres
  start parallel) and its reach, which turns from the orderly fan into one of its own (from the timing
  `f1.w`) so the fibres cross and fan out downwards by the end. The final pass keeps the hue as light
  piles up (only the hottest spot at the bend goes towards white), so the band stays yellow-lime; a
  green haze follows the lower arm; denser glitter and bokeh spread wider further from the bend.
- **An even fan at the end, not a tangle** (the owner: "your lines are not scattered properly … and it
  glows more"): far from the bend each fibre's reach comes from its even rank across the bundle (`t`,
  the inverse of the bunched `w`), so the fibres spread out evenly like a comb, as in the recording,
  instead of crossing at random; their sway and bow are smaller; the glow round the fibres and the
  haze along the lower arm are stronger. **Trap:** no backticks inside the shader text (it's a
  template string); a comment with one broke the build of the test page.
- **In 3D, changing with the scroll** (the owner: "please work on this also", about the recording's
  river changing shape as the page scrolls): the river is a ribbon that turns as the page scrolls
  (`u_twist`, off with Reduce Motion): an angle that grows with the scroll and further along the river
  turns each fibre's spread from the middle of the fan against a depth of its own across the ribbon,
  so the fan narrows and widens and fibres pass in front of and behind each other (behind: softer and
  dimmer; in front: brighter). At the top of the page the angle is 0, the drawn shape exactly.
- **The top of the page** (the owner: "see how the upper line starts and how it bends before all the
  lines merge at the middle point"): measured row by row on the recording's first frame, the fibres
  leave the bend spreading fast (inner ones almost sideways, `f3.y` 0.05–0.4) and halfway up the screen
  the whole bundle swings over to the top-right corner (a smooth step 0.45–0.95 of the screen height
  across, at 0.45 of a screen above the bend). Only above the first bend; as the page scrolls the swing
  eases and rises out of view. The band at the bend is narrower (`f0.x` up to 0.025).
- **The same number of lines as the recording** (the owner: "I need exactly the same amount of lines
  that video has"): counted by finding the strands along rows of clean parts of the frames (no text or
  card) at four brightness levels; 30 fibres (26 on phones) give the recording's counts within a line or
  two (about 25 faint, 20 clear, 10–15 bright across the river at most heights). Near the bend the
  recording's fibres overlap into one glowing band (fewer separate lines): the rising fibres are packed
  tighter there (`f3.y` 0.06 + 0.5·w⁴), a little softer within a tenth of a screen of a bend, the
  innermost quarter leave almost sideways (`sideways`) leaving a dark gap, and the bend's glow is
  stronger.
- **The scroll, like the recording** (the owner: "the animation when someone will scroll is totally
  different"): the recording's river never scrolls away: it stays on screen behind every section and
  changes as if a camera flew past it. `riverCamera(sy, W, H, still)` gives, for a scroll position, which
  stretch of the river is at the top of the screen (`vs`: with the page for the first screen, then
  drifting at 0.4 of the page's speed, eased by a softplus), how near it is (`zoom`), how it's turned
  (`rot`), a shift and the focus. It eases between `STAGES` taken from the recording's sections: the
  drawn river at the top (exactly, the test checks); a screen down the S on the right, softening; two
  screens down a wide, very soft ribbon from bottom left to top right; soft arcs; around seven screens
  down sharp again across the bottom; then round again from the soft ribbon (no jump: tested). The
  shader draws the river in its own coordinates and `toScreen` applies the camera; the glows are placed
  through the same camera in JS (`toScr`) and the pointer is taken back into the river's coordinates
  (`toRiver`). Out of focus the fibres move into the quarter-size glow layer (wide blurred bands) and
  fade from the sharp one. Reduce Motion: it just moves with the page and softens, as before.
  **Traps fixed on the way:** the drawn stretch needs a wide margin (260 px) or the cut ends of soft
  fibres show; a soft fibre is kept narrower than the curve's radius (a soft minimum, not a hard
  clamp, or its width jumps) or its strip folds over itself round a tight bend; the distance to the
  nearer bend is a soft minimum (a plain `min` put a kink in every fibre halfway between bends).
- **Every bend the same pattern** (M125b, the owner after the merge: "whenever the lines take left or
  right, follow that pattern again"; then "everything exact … ultra smooth"): the river is a chain of
  bends, each the first one's shape (`upperArm`: the fast spread and the swing; `lowerArm`: the round C
  into an even fan), mirrored at odd bends. Consecutive bends turn opposite ways, so a fibre's rank is
  `w` at even bends and `1 − w` at odd ones (`rankAt`): the inside of one turn is the outside of the
  next and fibres never cross over between bends. Odd bends sit 1.55 S to the side (river pixels; the
  arms then meet in the middle, blended between 30% and 70% of the gap); the camera pans across
  (`pan`: 0 at even bends, 1 at odd ones; the caller turns it into a shift that puts odd bends at the
  mirrored hero spot). `riverCamera` now follows the river: at each bend exactly the view at the top
  of the page (tested), in between nearer, turned a little and soft. The STAGES list is gone. The 3D
  turn is limited (±0.45 rad) so the fan never pinches into a waist. The per-fibre numbers in `f0` are
  now four numbers of its own (small reach differences, depth); the shapes come from the rank.
- **Ultra smooth scrolling:** the scroll the river is drawn at glides to the page's (a 70 ms ease, so
  wheel and trackpad jumps don't jerk it), lands exactly, and jumps straight there when frames aren't
  running or with Reduce Motion. `draw` returns true while gliding, and the worker and the page draw
  another frame then even when the river isn't moving on its own.
- **Back to a river that belongs to the page, with lines that keep travelling** (M125c, the owner after
  seeing the camera version: "this is totally different … the lines travel like when you made the pink
  background lines earlier … should continue travelling even when I don't scroll, and when I scroll it
  should travel a little fast"): the flying camera is gone (no zoom, turn, pan or stage list); the river
  scrolls with the page again, bends alternating on the page as the pink river did, each the first
  one's pattern (`upperArm` / `lowerArm`, ranks flipping per bend), a little softer further down
  (`riverFocus`, never below 0.6 so the travelling lines stay clear). A flow clock (`u_flow`) runs all
  the time and up to twice as fast while the page scrolls (the scroll speed, eased over 0.3 s): it
  drives every fibre's sway, a soft swell running down each fibre, and, as in the pink river, short
  bright dashes (brightest at the head, with the soft layer's glow) travelling down every other fibre,
  and the glitter's drift. The scroll still glides (70 ms).
- **Smooth bends, the river flowing bend to bend, drawn in like the recording** (M125d, the owner: "the
  bend is not proper, it should be a smooth bend"; "check the video again and make the lines' animations
  like that"; "the river below needs to bend from the end side of right and left, not from the middle
  like at the start"):
  - every arm uses q = 2 at the tip (a lower power made inner fibres pointed there); the tip is wider
    (about 70 px round, as in the recording: lower arm length 0.32 − 0.1·w, the first bend's rising arm
    0.2 − 0.05·w) and the band at the bend thicker (`dx` up to 0.05 S);
  - after the first bend the river is a chain: below every bend `bendArm`, above every later bend the
    same arm mirrored (`topArm` with its swing only above the first), so one bend's fan meets the next
    one's; the later bends sit at the screen's edges (0.1 and 0.9 of the width, 0.08 / 0.92 on phones)
    and are drawn at S2 = (their distance) / 1.28, so the two fans meet exactly (reaches 0.34–0.94 each);
    the first bend stays beside the hero's words at the recording's size;
  - on arrival the lines draw themselves in along the river as in the recording (top right, the bend,
    then the fan) in 0.9 s, eased in and out; each fibre's tip a little ahead or behind (up to 0.12 of a
    screen) with a glowing tip; the bends' glow lights as the lines reach them (`front`, `lit`).
- **Where it runs:** first choice everywhere, on the background thread (`river.worker.ts`) or the page
  (`LightTrail.tsx`). Where WebGL 2 is missing the 2D painter (`river-paint.ts`, unchanged) draws; if
  WebGL took the canvas and then failed, the worker reports `unsupported` and the page draws in 2D on
  a fresh canvas. Lost WebGL context: it simply stops drawing (rare; not restored).
- **Tested:** `pnpm check`; `river-gl.test.ts`; renders compared frame by frame with the recording at
  1766 × 1222 (scroll 0 and 320); the real landing page at 2000 × 1044, 1280 and 390 px, light and dark;
  the app's river down a long page. The local database wasn't set up in this session, so pages that
  read it returned errors unrelated to the river.
- **Left:** a WebGL context restore; the 2D fallback keeps the M124 shape.


## M126: the river's sky-blue fibres, as in the recording (the owner, 8 Nov 2026)

The owner after M125: "not everything is perfect … see that and fix it". Compared at the recording's own
size (1766 × 1222) and in close crops, the shape, bend, glow, glitter and the light and phone versions
matched; the one clear difference was colour: the recording's river has distinct sky-blue fibres (and
blue specks) among the lime, mostly towards the top right, where ours showed pale grey-green ones.
`river-gl.ts`: the blue fibres (colours 6–8) are now a saturated sky blue (#5cb2ea, #4a9fe0, #7ec6f2),
a little more common (20–45% by rank instead of 12–42%) and brighter (+0.3), and the blue bokeh matches.
**Tested:** `river-gl.test.ts`, eslint, `tsc`; the landing compared with the recording's frame.


## M127: the river's detail and exact shape, fitted to the recording pixel by pixel (the owner, 8 Nov 2026)

The owner after M126: "the river lines still doesn't match properly with the video so match it exactly the
way it looks and it needs to be detailing". Rendered `river-gl.ts` at the recording's own size (1766 × 1222,
headless Chromium with SwiftShader) and compared with its frames (the hero at 3.1 s) by brightness profiles
across the band, a line-direction field, the band's edges row by row and the colours at each brightness.

- **Detail:** across the lower arm the recording has about 22 clear strands on a glowing base (many fine
  threads too faint to separate); ours had 12 and no base. `riverFibres(n, hairs)` now adds fine, faint
  threads after the clear lines (110 on computers, 44 on phones, 60 with Reduce Motion): width 0.45–0.75,
  brightness 0.07–0.19, ranks almost even across the bundle. The clear lines are less bunched (power 1.3),
  thinner (0.5–0.9), a few more bright ones, and dimmed less at the bundle's edges. **Rule:** a fibre with
  brightness under 0.2 gets no halo in the sharp pass (its strip stays a few pixels wide), which keeps the
  extra threads cheap; keep the threads under that line.
- **Smooth arcs:** the recording's lines never wave. Sway is 3–9 px over 520–1080 px (was 6–24 over
  130–450), and each fibre's bow is one arc across the arm (`f3.w` 0.3–0.55 of S, so `1 − cos` stays below
  π), not a wave along it.
- **The top arm runs on as diagonals:** above the swing the recording's lines lie at about 30° into the top
  right corner; ours went upright again. `topArm`: a smaller step ((0.35 + 0.5 t) S at 0.4 H, width 0.04 H)
  plus `run`, a soft ramp of slope 1.6 (scaled by S, so phones don't lose the arm off the right edge) from
  0.5 H, both easing with the scroll as before. Fitted to the recording's left edge row by row (mean error
  8 px). The innermost quarter now rise about 80 px before turning sideways (`sw` is a softplus that is 0 at
  the bend: a non-zero value there put a notch in the tip), so the C is hollow and round as in the recording.
- **The lower fan is wider:** near the bend `bendArm` reaches 0.25 + 0.67 w² over 0.23 − 0.08 w (inner lines
  leave almost flat, outer ones drop steeply), fitted by drawing the model's curves over the frame; the far
  values (0.34 + 0.6 t) are unchanged, so the chain to the next bends is as before (checked on a
  three-screen plot). **Trap:** a narrower band at the tip (0.03 S) looked closer in a zoom but made the bend
  pointed at full size; the M125d width (0.05 S) stays.
- **Light and colour:** the lime is paler (blue raised about 35 in each lime), the river brighter below its
  first bend than above it, blue fibres lime inside the bright band and turning blue as the fan spreads (above
  the first bend only in the top right), the bend's glow centred a little inside the C and less saturated,
  more haze top right. Glitter: 1300 specks (420 on phones), most of them soft dust (3.5–7.5 px, a flatter
  profile, kind 0.5 in the dot shader) close to the bends inside the band, 14% sharp sparks; bokeh softer.
- **Tested:** `pnpm check` (all passed); `river-gl.test.ts` (a new test for the threads); renders compared
  with the recording at 1766 × 1222 (bend, both arms, top right, colours, brightness levels), 1280 × 800,
  390 × 844, light mode, scrolled 1300 and 2600 px, and the arrival in frames.
- **Left:** the river further down the page (the chain of bends) keeps the M125d shape; the recording only
  shows its first bend that way.


## M128: the river as sharp as the template, measured on the template's own preview (the owner, 9 Nov 2026)

The owner after M127: "still it doesn't look … as sharp as it should be … there are a lot of changes please
look for that take your time and build it", then the source of the design: GetLayers' **Relay** template
(getlayers.ai/templates?layer=relay, a premium template by Textura agency). Its prompt and source code are
paid (the plan includes a commercial licence); only its public preview videos were used, as a picture to
measure against (`storage.getlayers.ai/templates/relay-4ee0729d77-desktop.mp4`, 4320 × 3080, the hero at
2210 × 1450 device pixels in the first frame, at rest). **Rule:** never copy or reverse-engineer its code
(the owner asked; declined: it's GetLayers' paid work, not the owner's). If the owner buys the plan, its
source can be used directly. A personal environment "UniVerse" was created to reach storage.getlayers.ai.

How it was measured (renders at the template's geometry, 1440 × 945 at 1.535, aligned on the bend's knot):
line cross-sections (core width and glow), line counts across both arms at three strengths, brightness in
nine zones (knot, outside the bend, inside the C, both arms, top right, bottom, far left), pixel zooms.

- **Why it looked soft:** (1) the canvas was capped at 2× and 4.2 M pixels, so an iPhone (3×) and big Mac
  windows stretched it; now up to 3× and 7.5 M pixels (`resize`). (2) The quarter-size glow layer drew every
  line at full strength with a 7 px blur: it carried more light than the line itself, every line a 8–10 px
  smear. Now a 14 px blur at 2.2 (dark): a smooth light between the lines, which keeps them crisp. (3) A
  width formula padded every line 40% wider; now the width has a floor of half a device pixel (`u_dpr`,
  shared by both programs in `PATH`). (4) The halo round each line was nearly half the line's brightness and
  the lines were bright enough for the tone map to flatten them, so the halo read as wide as the line: now
  0.07 and the lines dimmer (0.9). (5) Lines further back were blurred (1.6 px per unit of depth): the
  template's are all crisp; now only dimmer. Result: the template's line profile (0.70 at ±1 device px,
  0.47 at ±2) against ours 0.84 / 0.55 (was 0.94 / 0.82 / 8–10 px).
- **Lines:** 60 lines and 30 threads on computers (40 + 20 phones, 44 + 24 Reduce Motion): counts across the
  arms now the template's (e.g. 36/29/15 against 39/30/14 at prominence 6/15/40). Most lines faint
  (0.12 + 0.65 level²), 12% bright, widths 0.4–0.65 (bright 0.6–0.85, threads 0.35–0.55), the outer ranks
  dimmer (`edge` 1 − 0.5c²), only 5% out-of-focus ones. Colours back to vivid lime, sky blue a touch softer.
- **The bend:** a hot knot (strands +2.2 within 0.035 H, the core glow tighter and stronger) and its bloom
  outside the bend too (`m * 0.26` at the knot), a glow just above the bend on the rising arm; the rising
  arm's outer lines lean right a little sooner (near-bend reach 0.2 + 0.32 w²).
- **Glitter:** 2000 specks (600 phones), 85% sharp pin-points (2.4–4.6 px, a tight core), clustered close
  to the bends; a dot's kind is now explicit (`a_q.y`: 0 spark, 0.5 dust, 1 bokeh; it was guessed from the
  size). 80 bokeh discs (24 phones) spread wider, as round the template's arms and top right.
- **Further down the page:** the dashes no longer show in the wide glow layer (blurred across but not along,
  each was a box with a hard end); out of focus is gentler (the lines stay clear).
- **Tested:** `pnpm check`; `river-gl.test.ts` (updated: a third of the lines glow, all thin); renders at the
  template's geometry, 1440 × 900 at 2×, 390 × 844 at 3×, light mode, scrolled 1300 and 2600; the real landing
  page (local dev server) at 1440 × 900 2× and 390 × 844 3×.
- **Left:** the hero layout is UniVerse's own, so the bend sits beside our words (0.345 of the width), not
  the template's (0.31).

## M129: each app's own scene behind the page, the river removed (the owner, 9 Nov 2026)

The owner: "can you remove the river line and start working on the background as a good one for each app
and when i switch up to any app in the main page of website the background needs to change according to
that", then mid-way: "everything needs to be ultra smooth and transition also when i switch to another
app". Asked first (the launch focus pauses new looks): the owner chose to do it now, the river removed
everywhere, a scene per app on the website and inside the apps, themed animated scenes.

- **What shows:** one slow scene per app in its colour (`APPS[].color`, a second colour in `ALT`):
  UniVersity stars joined into constellations, sheets of paper rising; Trace a dotted globe turning
  (continents from 3D noise, 6000 points, 3000 on phones), shipments arcing between places with a ring
  where each lands; Relief a contour map (marching squares on a noise field, every third line bolder)
  drifting, requests and helpers pulsing, dashed routes of help with a dot travelling; Green an aurora
  (bands stacked along a wave on the soft layer), leaves drifting down, fireflies; Play a neon floor
  running to the horizon, triangle / circle / square / cross floating above.
- **Where:** the website and sign-in follow their app tabs (`<AppBackdrop own app={app} />`); in the
  app, `appFor(path)`; on shared pages (hub, Messages, Settings) the app chosen last (`useChosenApp`).
  Strength 1 on the website, 0.85 on sign-in, 0.7 in the app.
- **Smooth:** a switch is a 1 s transition (opacity eases in and out; the old scene drifts towards you,
  zoom 1 → 1.06, the new one settles from 0.94; only the fade with Reduce Motion); the first scene
  arrives in 1.1 s from 0.97; the scenes' own motion eases in (`pace`) instead of starting with a jolt.
  Drawn on a background thread (`backdrop.worker.ts`), every frame the screen gives on computers, 60 a
  second on phones (was 30 for the river). On the worker it keeps moving while the page scrolls; on the
  page fallback it rests while `html[data-scrolling]`, as the CSS loops do. Rests for a hidden tab and
  `data-arena`.
- **Files:** `src/lib/backdrop.ts` (scenes, painter `makeBackdrop`, frame loop `backdropLoop`, shared by
  the worker and the page), `src/components/backdrop.worker.ts`, `src/components/AppBackdrop.tsx`. Gone:
  `LightTrail.tsx`, `river.worker.ts` (+ test), `river-gl.ts` (+ test), `river-paint.ts`; `.light-river`
  is `.app-backdrop`; the landing's and sign-in's two drifting blue glows (the scenes carry their own).
- **Rules for code that builds on it:**
  - In a scene, every alpha is `a * …` (`a` carries the transition and the strength); turn shapes with
    `turned()` (it keeps the transition's zoom); never `setTransform` to a fixed matrix inside a scene.
  - Positions as fractions of the screen, read from `v.w` / `v.h` while drawing: a resize (a phone's
    address bar) never rebuilds a scene. Relief caches its contour map and rebuilds only when the width
    changes or the screen grows taller than it was built for.
  - No `Path2D`, `roundRect` or `filter` (workers, Safari); soft things go in `soft()` (the quarter-size
    layer stretched is the blur).
  - A new app: add it to `SCENES`, `ALT`, `SEED` (TypeScript asks).
- **Trap:** a tab switch on the landing still has one long page frame (117–133 ms on the built Worker,
  headless with software graphics): the landing's own content being built for the new app (React, the
  new app's pictures, e.g. Green's globe maths 43 ms). Not the background: it's drawn on its own thread,
  so its transition carries on through that frame.
- **Tested:** `pnpm check`; `backdrop.test.ts` (contours round a hill, every scene dark and light on a
  computer and a phone, the transition timings, the loop moving / held for Reduce Motion / resting);
  each scene drawn at 1280 × 800 dark and light and 390 × 844; the real landing (dev) through every tab,
  mid-switch, light mode, a phone, sign-in with `?app=green`; the built Worker:
  `scripts/checks/app-backdrop-ui.mjs` (one canvas, every tab, sign-in, `/student`, `/trace`, axe at 390
  and 1280 light and dark) passes.
- **Left:** the long page frame on a tab switch above (the landing's content, not part of this item).

## M130: the motion pass, smoother and more alive where it counts (the owner, 9 Nov 2026)

The owner: "can you make things more animated and ultra smooth and use all the plugins and connectors
and dont make it like ai slop", then chose "the whole site" (asked first; the launch focus pauses new
looks, the owner's exception).

- **What was found:** the site already moves a lot (page entrances, the scroll reveal, count-ups, the
  menu's gliding pill, sheets, the theme reveal), so this pass adds motion only where things popped or
  stalled; nothing decorative. Sources: Emil Kowalski's skill (purpose, ease-out, under 300 ms, nothing
  from scale 0), Motion's own performance audit via Context7 (`x` / `y` / `scale` run on the page's
  thread; a literal `transform` string runs on the compositor; never mix it with `layout`). PostHog has
  never received an event from the site and the database keeps no page visits, so the order came from the
  launch focus: the landing, then UniVersity's daily pages.
- **The landing's app switch:** the words, the tabs and the scene behind change at once; the hero's
  picture and everything below render a moment later through `useDeferredValue(app)` (`later` in
  `src/app/page.tsx`), which React can pause between frames. The hero's two entrances animate one
  `transform` string. The other apps' code starts loading when the pointer or focus reaches the tabs
  (`warmApps`). Worst page frame per switch on the built Worker: 33–50 ms (was 117–133); the first
  switch to Relief still 83–100 ms (its sections' first mount).
- **Content arriving:** `arrive()` in `src/lib/scroll-motion.ts`: what replaces a loading placeholder
  (`.skeleton`, `aria-busy`) glides in (280 ms, a 10 px rise, 40 ms apart, at most 8, on screen only); a
  big arrival brings in its blocks one by one; one to three rows added to a list already there glide in
  (a task added, a reply). Skipped: rows that only moved (a sort), anything already moving (the page's
  entrance, a message's own CSS arrival, framer's inline styles), `data-no-motion`, Reduce Motion.
- **Rules for code that builds on it:** don't add per-page loading fades: `arrive` does it. A list that
  animates its own rows with framer keeps doing so (`arrive` sees the inline styles and stays out). For
  a new entrance that must stay smooth during a page load, animate a `transform` string, not `x` / `y`
  (but never on a `layout` element).
- **Checks:** `scripts/checks/motion-pass-ui.mjs` (built Worker: the landing's switches timed, a glide on
  the teacher's home, none with Reduce Motion); `app-backdrop-ui.mjs` now fails a page that shows "This
  page hit a problem" (a local database without tables gave error pages that still had the canvas).
- **Trap (local):** `local:serve` uses its own database: after a fresh session run `pnpm local:setup`, or
  every signed-in page is the error page.
- **Left:** the shared `fadeUp` preset (168 uses) and the other framer `x` / `y` animations stay as they
  are: many are on `layout` elements, where a `transform` string would fight the layout animation.

## M131: the landing's globe you can use (the owner, 9 Nov 2026)

The owner, with a screenshot of the landing's planet: "make this globe ultra smooth and functional and
more detailing and people can click on it and see details like that".

- **What it does:** drag to turn it (a finger sideways only, so the page still scrolls), pinch, ctrl +
  scroll or the + / − buttons to zoom; click an app on it, or its button in the row under the heading
  (keyboards and screen readers), and the planet turns to face that app (the short way round), the app
  wears a bright breathing ring, and a card opens: the app's name (Lab when it is), its tagline and line
  from `apps.ts`, three more things it does (`DETAILS` in `WorldSection.tsx`: only what the product
  really does), "Start with …" (sign-up with that app) and "Show me …" (switches the landing's app tab and
  glides to the top). Close with ×, by picking the same button again, or another app.
- **Still smooth:** a new Planet mode, `turnable`: steered like `interactive` (Trace's Live globe) but with
  the full look (net, sparks, every name, ripples) and drawn on the background thread
  (`planet.worker.ts`: `drag`, `zoom`, `focus`, `selected`, `pick` → `picked`). The page side only sends
  pointer moves; the click is picked on the thread (`nearestPlace`, shared with the page planet).
- **More detail:** the lattice is finer on big screens (up to 18 000 points, 0.62 r², was 14 000 / 0.5).
- **Rules for code that builds on it:** `interactive` changes the look (no net over the sea, names only
  for the chosen); use `turnable` to steer a look-only planet. The zoom buttons take a `corner` (the
  landing keeps the end corner for its notes).
- **Tested:** `pnpm check` (`planet-paint.test.ts`: the click picks the nearest place within 18 px; a
  turnable planet turns to face the chosen place); `scripts/checks/world-globe-ui.mjs` on the dev server
  and the built Worker (an app's button opens its card, a click in the planet's middle picks the app it
  turned to, close, no sideways scrolling, axe with the card open at 390 and 1280, light and dark).

## M132: each app its own colour, everywhere (the owner, 9 Nov 2026)

The owner: "the colour synchronization is not proper"; asked, chose "each app its own colour" (pick Trace
and the whole page turns Trace pink: buttons, highlights, the chosen tab, the background; UniVersity keeps
lime). In the same message: "everything is not ultra smooth" (scrolling the landing; switching apps or
pages) and "realistic graphics animations" (realistic 3D backgrounds and realistic movement everywhere):
those are the next items (see "Next up" in AGENTS.md), not this one.

- **How:** `AppBackdrop` sets `<html data-app>` to the page's app (the landing's and sign-in's tab; in
  the app `appFor(path)`, shared pages the chosen app). The M132 block at the end of `globals.css`
  re-points, per app and theme, the palettes the M124 block points at the accent (indigo, violet,
  purple, pink, fuchsia, aqua) and the tokens (`--tint`, `--cta`, `--ins-hot`, badges, card hover).
  Dark: Tailwind's 400 is the accent with ink text; light: a shade with white text at 4.5:1 (pink-600,
  fuchsia-600; orange and emerald one step darker, 700). UniVersity keeps M124 (lime / blue) and its
  scene now wears it too (`CAMPUS` in `backdrop.ts`). The landing's tab pill is `var(--tint)` with
  `--ink-contrast` text. The main buttons ease into the new colour (0.45 s) as the scene changes.
- **Rules:** a person's own accent (Settings → Appearance, `[data-accent]`) wins over the app's. The
  M132 block was generated (Tailwind's pink / orange / emerald / fuchsia); change a shade there for
  both palettes and tokens. A new app needs its block (or it keeps the M124 accent).
- **Tested:** `pnpm check`; `scripts/checks/app-colours-ui.mjs` on the built Worker: the landing for each
  app and `/trace`, `/relief`, `/green`, `/play` signed in, dark and light: `data-app` right, the main
  button in the app's colour, axe clean (contrast included).

## M133: realistic movement, and the landing's scroll in step (the owner, 9 Nov 2026)

The owner asked for "realistic movement everywhere: spring, momentum and depth across the site, plus
smoothing … scrolling the main page, and switching apps or pages" (the 3D backgrounds are the next item).

- **Springs, run by the compositor:** two real spring curves as CSS `linear()` (generated from a damped
  spring: press damping 0.55, 12 % give; glide damping 0.8, 1.5 %): `--spring-press` and `--spring-glide`
  in the M133 block at the end of `globals.css`, `SPRING_GLIDE` / `springGlide()` in `page-transition.ts`
  (falls back to the old glide where `linear()` is missing). Buttons go down at once and spring back;
  cards lift and settle; the page's entrance and its parts settle on the spring.
- **Depth on page changes:** the page you leave sinks back a little (scale 0.985 with its slide), the new
  one comes forward out of a little depth.
- **The landing's reveals** (`Reveal` in `bits.tsx`) animate one `transform` string on a framer spring
  (bounce 0.16): compositor-run, so they don't stutter while the page scrolls.
- **Momentum:** the landing's globe (and Trace's Live globe) keeps turning when thrown and slows down
  (`turnBy` / `letGo` in `planet-paint.ts`, shared by the page and the background thread); let go after
  holding still and it stays.
- **Scrolling the landing:** the parts that follow the scroll (`.scrub`), the reading-progress line and the
  hero picture's drift were framer scroll listeners and springs on the page's thread (they lagged when it
  was busy); now CSS scroll-driven animations (`animation-timeline: view()` / `scroll(root)`), in step with
  the scroll itself. Without scroll timelines (Firefox today) they stand still and the line is hidden.
- **The colour on a switch (M132's cost):** a new `data-app` restyles the whole page (about 35 ms), so
  `AppBackdrop` now applies it when the page is idle after a switch (the buttons still ease into it with
  the scene), and a head script (`appHeadScript` in `apps.ts`, the same rules as `appFor` and
  `useChosenApp`) sets the first one before the first paint: no flash of the wrong colour.
- **Measured on the built Worker:** scrolling the whole landing, 1 of 223 frames over 34 ms (worst 50);
  the landing's app switches 50 ms after the first visit to each app (the first two 100 ms: those apps'
  sections mounting); the app's page switches 50–67 ms.
- **Rules:** motion tied to the scroll: a CSS scroll timeline, never a scroll listener. An arrival that
  must settle: `--spring-glide` (CSS) or `springGlide()` (WAAPI). Keep the two curves in sync.
- **Tested:** `pnpm check` (`planet-paint.test.ts`: thrown, it carries on and slows; held still, it
  stops); on the built Worker `scripts/checks/motion-pass-ui.mjs` (now also the landing's scroll timed,
  its scroll-tied parts on scroll timelines, and the app's page switches timed), `world-globe-ui`,
  `app-colours-ui` and `app-backdrop-ui` (axe in dark and light).

## M134: inside the app, the Ballast reels' shapes (first pass) (the owner, 9 Nov 2026)

The owner sent the three Ballast reels again: "can you make the design and ui of these video exactly
the same". Asked: inside the app only (the website keeps its look); dark stays the default (light mode
is Ballast's colours since M124); the app scenes stay behind the pages.

- **Side menu:** compact rows (13.5 px, 34 px tall on computers), plain grey icons, the chosen one in ink
  on its raised card; the brand 15 px semibold; the app switcher a light card with a hairline. **Bug
  fixed:** the switcher's app name was white on white in light mode (invisible).
- **Top bar:** the title 20 px semibold with a 12 px grey line; the search a white field with a hairline
  and ⌘K; the round buttons (theme, language, bell) wear a hairline ring (`.app-topbar .btn-icon`).
- **Number tiles** (`KpiCard`): Ballast's metric card: the name on top with a small grey icon, the figure
  under it, a change as a small tinted badge. The Karma look's first-two-tiles colouring (`.kpi-row`
  first black, second blue) is gone: all plain cards. `color` is kept on KpiCard only for callers.
- **Cards:** 12 px corners (`--radius-card`, the M134 block at the end of `globals.css`).
- **Left for the next pass:** gradient icon tiles and progress bars (Your day, Finish setting up…) to
  Ballast's flat tinted squares and one-colour bars; Ballast's card headers (title, grey line, "···");
  tables and lists page by page.
- **Tested:** `pnpm check`; axe on the teacher's and the student's home, light and dark (dev server);
  screenshots in both themes.

## M135: every area inside the app in the Ballast style (the owner, 9 Nov 2026)

The owner: "i need every area of project needs to look like this inside and should be ultra smooth".
Rules for the app's page area (`main#main`, DashboardShell: every signed-in page), so all pages follow
without being edited one by one (the M135 block at the end of `globals.css`):

- **Density:** on computers every rem is 15 px (`html:has(main#main)`), the reels' compact sizes; phones
  keep 16 px; `text-xs` stays 11.25 px (above the 11 px floor).
- **Icon squares:** a small rounded square with a gradient and no picture (`w-7`…`w-14`, rounded-lg/xl/2xl)
  becomes Ballast's flat tinted square (13 % of the app's accent) with the icon in the accent.
- **Progress fills:** an empty rounded bar with a gradient is one colour, the accent.
- **Buttons and badges:** buttons 13.5 px on computers; badges 6 px corners, semibold (secondary buttons
  were already outlined, M124).
- **Fixed on the way:** the admin home's initials squares (blue on a 30 % blue tint) failed contrast in
  light mode; the tint is 10 % there now.
- **Rules:** a new icon tile or progress bar that should keep its gradient (a person's own colours, a
  picture) needs an `img` inside or a class outside the matched shapes; don't add page-by-page density.
- **Tested:** `pnpm check`; axe on eight app pages (teacher, student, courses, grades, attendance, admin,
  hub, Trace) in light and dark on the dev server; screenshots.
- **Left:** Ballast's card headers ("···") and tables page by page.

## M136: phones at full frame rate and sharpness (the owner, 9 Nov 2026)

The owner: "the mobile website and app both are downgrade please increase the frame". Phones had been
given less on purpose to save work (M91, M92): the live pictures (`live/canvas.ts`: the planet on the
page, the live cards) drew every other frame (30 a second) at 1.5x; the landing's planet on its
background thread at 30 a second; the app scenes (`backdrop.ts`) at 60 a second and at most 1.5x.

- Now every frame the screen gives (60, 90 or 120 a second) on phones too, the live pictures at 2x like
  computers, the app scenes up to 2.5x (at most 3.5 M pixels).
- **Rule:** don't bring the phone limits back without the owner: they asked for full frames. If a weak
  phone struggles, lighten the drawing (fewer dots), not the frame rate.
- **Tested:** `pnpm check` (the frame-loop tests).

## M137: the improvement sweep (the owner, 9 Nov 2026: "please do from 1 to 6 all of them")

After the review of the live `error_reports` (every NEW report is the sample world's, ids `smp…`; no real
person hit a new problem since 7 Nov) the owner asked for all six suggestions. This item is 1, 2, 4, 6;
3 (Ballast card headers and tables) and 5 (realistic 3D backgrounds) are their own items.

- **1 · the console's People list ("too many SQL variables", 31 Oct):** already fixed by M73 (1 Nov:
  lists that read an ordered related list go in pages of 90); no change. The owner marks it resolved.
- **2 · an old tab after a release:** the recovery script (`recovery-script.ts`) already reloads a tab
  whose files are gone and catches blank pages. The gap: the app scene's and the planet's background
  threads failing to load in such a tab were reported as errors, though both fall back to drawing on
  the page. Their `onerror` now marks it handled (`preventDefault`).
- **4 · which pages people use:** `src/lib/analytics.ts` + `components/Analytics.tsx` (root layout): one
  `$pageview` per page to PostHog EU (`eu.i.posthog.com`, added to connect-src in `security-headers.ts`),
  no library. Only with "Accept all" and no Global Privacy Control (`optionalCookiesAllowed`); no
  person profiles; a random id on the device (`uv-aid`); ids and tokens in the address blanked
  (`cleanPath`, tested). **Off until the owner sets `NEXT_PUBLIC_POSTHOG_KEY`** (the project's public
  ingest key) in Cloudflare's build variables. The privacy choices and policies pages say so.
- **6 · the landing's first switch to an app:** once the visitor points at or focuses the app tabs
  (`warm`), the other apps' sections are built ahead, hidden, in React's `<Activity>` (no effects or loops
  while hidden), so the first switch shows them at once; `.app-in` fades the shown app in. Nothing is
  built ahead for a visitor who never reaches for the tabs (phones: the touch itself).
- **Tested:** `pnpm check` (`analytics.test.ts`); on the dev server the tabs build all five apps' sections
  (four hidden), a switch shows exactly one, no page errors.

## M138: Ballast card titles and tables, for every page (the sweep's item 3, the owner, 9 Nov 2026)

The reels' cards have a small semibold title with a grey line under it, and plain tables (grey column
names in sentence case, 13.5 px rows, a soft row hover). Done as shared rules (the M138 block in
`globals.css`), like M135, so every signed-in page gets it without page-by-page edits:
- on computers (1024 px and up), inside `#main`: a `.panel` / `.card` heading (`h2`, `h3`) is 15 px
  semibold, the paragraph right after it 12 px in `--text-muted`; table headers 12 px, weight 500,
  muted, no capitals or letter spacing; cells 13.5 px;
- every table body row: a background hover (`--fill`), hover-capable screens only.
- **Left on purpose:** the reels' "···" menu in each card header (it needs a real menu per card, not
  CSS); phones keep their sizes.
- **Rule:** a card title that must stay big (a hero number, a page heading inside a card) needs a class
  that sets its own size after this block, or an element other than `h2`/`h3`.
- **Tested:** `pnpm check`; axe (serious/critical) clean on /teacher, /student, /student/courses,
  /student/grades, /teacher/attendance, /admin, /hub and /trace in light and dark.

## Next: realistic 3D app backgrounds (the sweep's item 5; plan only, not started)

The owner asked for it twice (9 Nov: "realistic graphics animations", then "please do from 1 to 6").
A plan for the item that builds it (take the next M number):
- **Where:** inside the scene's background thread (`components/backdrop.worker.ts`). three.js (already
  installed, 0.180) draws on the `OffscreenCanvas` it already gets; it's imported only there, so no page
  bundle grows. The 2D scenes of M129 (`lib/backdrop.ts`) stay as the fallback: no WebGL2 in the
  thread, weak phones (`navigator.deviceMemory` ≤ 4 or `hardwareConcurrency` ≤ 4), drawn on the page.
- **Each app, lit with depth:** one hemisphere and one directional light, fog for distance, a camera that
  drifts slowly and leans a little towards the pointer (the page sends the pointer; nothing while
  scrolling). UniVersity: stars and constellation lines in 3D, paper sheets rising and turning in the
  light. Trace: a lit globe of dots, shipments as glowing arcs. Relief: a terrain with contour lines,
  pins pulsing, routes. Green: aurora ribbons (additive), instanced leaves, fireflies. Play: a neon grid
  floor to the horizon, floating game-pad shapes.
- **Rules to keep:** the app's colour (`APPS[].color`, `ALT`, dark and light); the 1 s switch (fade the
  old scene while the camera moves on); rest while hidden or under `data-arena`; Reduce Motion: one held
  frame; decide materials and effects when a scene is made, never while it runs (a shader rebuild is a
  stutter, as in Play's worlds); free every geometry, texture and the context on a switch and on close.
- **Tests:** `scripts/checks/app-backdrop-ui.mjs` (one canvas, the page's frames through each switch, axe)
  plus the fallback forced on; the deploy size alarm (M110).

## M139: the cards' "···" menu (the owner, 9 Nov 2026: "please do this", the part M138 left out)

The Ballast cards end their header with "···". `src/components/ui/CardMenu.tsx`:
- **`CardMenu`** (the button and its menu, the shared `Menu`: a popover on computers, a sheet on
  phones) works on the card it sits in (the nearest `[data-card]`, `.panel`, `.card`, `.ins-board` or
  `section`), read when it's pressed or focused: **Full screen** (where the browser can; Exit full
  screen inside it), **Copy** (the card's text), **Download as CSV** (only when the card has a table:
  its column names and rows as shown, through `downloadCsv`, so cells starting with = + - @ are made
  safe). A card can put its own actions first (`items`).
- **`CardHead`**: the Ballast header in one piece: title (optional grey icon), the grey line, the card's
  own controls (`children`), then "···". Use it for new cards.
- **Where it is now:** the student's home (its panels, Up next, Daily goal, Your day), grades (3 cards),
  attendance; the teacher's home (charts, Recent students, Needs attention, Create); the admin's home
  (3 cards); every chart board (`InstrumentBoard`: console, insights, analytics, Trace, the wallet).
  Other pages get it when they're next touched (swap the heading for `CardHead`).
- **Shared change:** `Menu`'s panel opens inside the full-screen element when there is one (the rest of
  the page is hidden then). The M139 block in `globals.css` styles a card in full screen.
- **Trap:** the menu's items are built from state set on press, never from a ref while drawing (the
  hooks lint).
- **Tested:** `pnpm check`; `scripts/checks/card-menu-ui.mjs` (all three actions, Full screen's menu,
  no CSV without a table, a sheet on phones, axe on five pages at 390 and 1280, light and dark).

## M140: the reels' calendar and date range picker (the owner, 9 Nov 2026: "the timetable or calender changes that video had… the same way in all of the project", "cover everything in that video… ultra smoothly animated")

- **Timeline** (`components/calendar/Timeline.tsx`), the reel's Dock calendar: the days down the side, the
  hours across (24-hour labels, a hairline at each), each class a small two-line card (title with its
  course's dot, then what and where), a "Now 10:42" pill on the hours (the labels beside it hide, as in
  the reel) and a line through every day. Done is the accent (solid today, faint before), on now is ink,
  coming up a white card, a clash or a deadline an amber edge; a key above. Overlaps go in lanes
  (`laneDay`); a deadline gets an hour of room, kept inside the hours shown. Under it, the reel's two
  cards: **Busy this week** (bars per day) and **Coming up** (the next four, with "in 25 min" / "Tue").
- **Where:** the shared calendar (`TimeGrid`) has a **Timeline** view, the first one on computers
  (student and teacher calendars); phones keep 4 Days (no Timeline in their switch). The admin's
  timetable shows the week on it above the class list (`WeekTimeline`), with the real clashes
  (`clash` prop: a teacher or room twice, a room too small); a class jumps to its row in the list.
- **Date range picker** (`components/ui/DateRangePicker.tsx`): quick choices down the side (Today,
  Last 7/30/90 days, Last 12 months, This quarter, Year to date; "Custom" ticked otherwise), two months
  side by side (one on a phone), the first and last day in ink with a band between, the span written out
  ("Oct 31 to Nov 6, 2026 · 7 days"), Cancel / Apply (nothing changes before Apply), Clear for a filter.
  Arrow keys move through the days (one Tab stop). In: the audit log's filter, impact reports' period,
  the analytics export's period, partnership dates (`presets={[]}`). Left as they were: single dates,
  and the report-card round's dates (in a sheet: a popover over a sheet is a trap).
- **Motion** (the M140 block in `globals.css`): the cards settle in one after another on a first look
  (a spring, transform and opacity), lift under the pointer and give on a press; "Now" glides to each
  new minute (one transform); the months slide the way they turn; Reduce Motion: fades only.
- **Shared change:** `Popover` takes `panelClass` (its panel's size).
- **Left out:** the reel's "compare with the previous period" switch (no chart here can draw a second
  period yet).
- **Tested:** `pnpm check`; `scripts/checks/calendar-ballast-ui.mjs` (the three calendars in sample
  mode, a class opens, the admin's clashes in amber, phones without the Timeline; the picker's quick
  choice, Apply, arrow keys, Cancel; axe at 1280 and 390, light and dark).

## M141: the activity log as the reels' "Agent Activity" (the owner, 9 Nov 2026: "please do all this")

`/admin/audit` (Activity Log) now reads like the reel:
- **When things happen** (`components/instruments/DayHourHeat.tsx`): the days down the side, 24 hours
  across, each square shaded in five steps of the accent by how much happened then ("Less … More");
  the squares fill in one by one (scroll-motion's `data-cells`) and grow under the pointer; screen
  readers get the three busiest times in words. Data: `GET /audit/heat` (admins, same scope and
  filters as the log; `tz` minutes east of UTC; the newest 10,000) through `heatOf` in
  `src/lib/activity-heat.ts` (tested), which also counts by area.
- **Totals**: the number of actions, one bar split by area, the top five with their share.
- **Log**: tabs with counts (All and each area, in these dates and this search: the heat route ignores
  the area filter so the counts stay), then a table: Area (a dot), What happened, **Outcome** (a
  `StatusBadge`: green kept or given, red refused or removed, amber waiting, blue a plain change, from
  `outcomeOf` in `src/lib/audit-outcome.ts`, tested), By (initial, name, role), When, and the details.
  On phones the same rows stack (the table's cells go `lg:contents`).
- **Shared:** `components/ui/StatusBadge.tsx` (tones green, amber, red, blue, grey) for any outcome or
  state label.
- **Sample mode:** `/audit`, `/audit/heat` and `/audit/actions` now answer (`src/lib/sample/audit.ts`:
  a made-up fortnight), so the demo isn't empty.
- **Trap:** `.card`'s padding comes from an unlayered rule, so a `p-0` class doesn't remove it: use
  `style={{ padding: 0 }}` (done here and on the admin timetable's timeline).
- **Tested:** `pnpm check` (`activity-heat.test.ts`, `audit-outcome.test.ts`);
  `scripts/checks/activity-log-ui.mjs` (168 squares, the words for screen readers, every row labelled,
  a tab's count matches its rows, details open; axe at 1280 and 390, light and dark).

## M142: "New …" windows with "Start from" cards (the owner, 9 Nov 2026: "please do all this")

After the reels' "New agent" window:
- **`components/ui/TemplateCards.tsx`**: a grid of choices (a radio group): each card has its icon in a
  grey square, a name, two grey lines and a round check that fills when chosen. Arrow keys move and
  choose; Tab enters on the chosen one. The cards settle in one after another as the window opens,
  lift under the pointer, give on a press; the check's dot pops in (the M142 block in `globals.css`).
- **A teacher's New course** (`components/dashboard/NewCourseSheet.tsx`, from the teacher home's "New
  course" and Create card): start from Lecture, Lab, Seminar, Project, Online or scratch (it sets the
  credits and what students will do); Name, Code, Credits in one row; **What students will do**: the
  kind's activities as ticks ("3 of 4 chosen"; grey placeholder rows and "Pick a kind first" before a
  kind is chosen); the description writes itself from the kind and the ticks until the teacher types
  their own. Footer: "You can change all of this later.", Cancel, Create course. It's a `Sheet`
  (a real dialog: focus kept inside, Escape closes) in place of the old hand-made window, whose
  blurred backdrop and missing dialog role it replaces. Same `POST /courses` as before.
- **The calendar's New event** (`EventSheet`): a new event starts from cards (Personal, Study or
  focus, Meeting, Office hours for teachers, Deadline); editing keeps the compact menu.
- **Trap (checks):** in the test browser's phone emulation a tap right after a page arrives can hit an
  older frame's layout (the calendar's toolbar before it wrapped); the page runs at 60 a second, so
  `template-windows-ui.mjs` presses that button directly on phones.
- **Tested:** `pnpm check`; `scripts/checks/template-windows-ui.mjs` (six kinds; Lab course sets 4
  credits, ticks and writes; unticking rewrites and counts; arrow keys; the event's cards; axe with each
  window open at 1280 and 390, light and dark).

## M143: a teacher's courses as the reels' "Agent Center" (the owner, 9 Nov 2026: "see what else is left and work on it")

What was left in the videos after M134–M142 was the Agent Center page. Its match is `/teacher/courses`:
- **Header:** the summary line under the title ("2 courses · 10 students · 77 hand-ins in 14 days"), a
  status pill ("● 2 of 2 active this fortnight") and a black "New course" (the M142 window; the page's
  old create form is gone, the edit form stays).
- **Three summary cards:** Students by course (bars), Hand-ins (the 14 days' total and a column chart),
  Active courses (the `Ring`, which now takes `text` for a count in place of a percentage).
- **A card per course:** its emoji in a tinted square, name and code, an Active / Quiet label
  (`StatusBadge`: a hand-in in 14 days or not), Students / Materials / Hand-ins, a 14-day column chart
  (`components/instruments/MiniColumns.tsx`: older days grey, the last five in the accent, rising in one
  after another), then Edit, Delete and **Open board** (the course's board). Real buttons in place of a
  clickable box. **Removed:** the old details window, which listed made-up students ("ST" three times).
- **Data:** `GET /courses/my/activity` (teachers; their own courses, up to 90; `tz`; the newest 5,000
  hand-ins in 15 days) through `dailyCounts` in `src/lib/daily-counts.ts` (tested); a sample answer in
  `src/lib/sample/router.ts`.
- **Left out on purpose:** the reels' side-menu section headings and count badges (the owner chose the
  simpler menus, M27), and their "autonomy" menu on each card (nothing here works that way).
- **Tested:** `pnpm check` (`daily-counts.test.ts`); `scripts/checks/courses-center-ui.mjs` (summary line,
  pill, the three cards, 14 columns per course, New course opens, Open board goes to the board; axe at
  1280 and 390, light and dark).

## M144: Trace, the footprint story on every passport (the owner, 10 Nov 2026: "can we improve the trace and relief app… more unique features", then "do all of them" for the eight proposed; the owner's exception to the launch focus)

- **What a buyer sees** (`/t/<code>`, after "Its journey"): **Its footprint**: the total kg CO₂e, "about
  the same as driving N km in a car", a bar of making against the trip, the two figures, and how its
  making compares with the middle of other products of its kind on UniVerse that published a figure
  ("32% less than the middle of 5 other food products").
- **Where the numbers come from** (`footprint` in `src/lib/trace.ts`, tested): making = the EU passport's
  `carbonKg` (M108); the trip = `journeyCarbon` over the journey's stops with the product's weight; a
  car's 0.2 kg a km from `src/lib/green.ts`; the comparison only with 3 or more others (their median),
  and only when this product published its own figure. Nothing is invented: no figure, no card.
- **Server** (`scan` in `src/server/trace.ts`, `unitFootprint`): one extra query (others of the same
  category with a passport, up to 200) only when the product has a making figure. The journey's exact
  points stay on the server: the browser still gets places by name only.
- **The sample passport** (`/t/demo`) has one (a 0.6 kg bottle from Jaén to Paris).
- **Tested:** `pnpm check` (`trace.test.ts`: footprint); axe on `/t/demo` at 390 and 1280, dark and light.

## M145: Trace, repair and resale history on the passport (the owner, 10 Nov 2026: the eight features)

- **What people see** (`/t/<code>`, under "Proof of ownership"): **Repairs and owners**: "Second owner,
  resold 1 time · 2 repairs, 1 by <brand>", then each repair (what, the parts, the date, "by <brand>" with
  a check mark or "by its owner"). Shown once there is anything: a repair, a resale, or someone who may
  add one. A second-hand buyer gets the unit's story; the existing transfer (vault) keeps the owner count.
- **Who can add one** (`logRepair` in `src/server/trace-plus.ts`, `POST /trace/scan/:code/repairs`
  { what, parts }, signed in): the brand's team (`trace_brand_members` of the unit's brand: `by`
  BRAND) or its owner at the time (`trace_owners.userId`: OWNER); anyone else 403; never on a likely
  copy (`noCopy`); 5 a day per unit; text through `short` (200 characters).
- **Data:** migration **0195** `trace_repairs` (model `TraceRepair`); the passport reads the last 20 in
  the same round as its other extras (`passportExtras`).
- **Trap (local):** after a schema change the running `pnpm local:dev` keeps the old database client in
  its bundle cache: stop it, `rm -rf .next/dev .next/cache/webpack`, start it again. The Trace unit
  tests' Prisma mock needs every new table the scan reads (`trace.test.ts`).
- **Tested:** `pnpm check`; `scripts/checks/trace-history-api.mjs` (a brand, a batch, a unit owned by
  someone else; the owner's and the brand's repairs, a stranger refused, an empty one refused, the
  passport lists both newest first); axe on the passport with the card at 430 and 1280.

## M146: Trace, take-back and recycling (the owner, 10 Nov 2026: the eight features)

- **The brand offers it per product** (console → a product's settings, `ProductExtras`): "How to hand it
  in" (empty: not offered) and "Points for its owner" (`trace_products.takeBackHow`, `takeBackPoints`,
  through `extrasData`).
- **The owner returns it** (passport card "Return it for recycling", `POST /trace/scan/:code/takeback`):
  only the registered owner (`trace_owners`), never on a likely copy, once per unit (unique `codeId`);
  they get a 6-character drop-off code, shown only to them. Others see "Its owner is returning it".
- **The brand receives it** (console → **Take-backs**, shown once a product offers it; find by drop-off
  code; `GET /trace/takebacks`, `POST /trace/takebacks/:id/receive`, `brandOf`): a guarded update claims
  it once; then the owner gets the points (`award`, kind `TAKEBACK`, on the hash chain; the wallet labels
  it "Returned for recycling"), a **Green** RECYCLE action of the unit's weight, confirmed by whoever
  received it (so it counts for the challenge and leaderboards), and an in-app note (no email). The
  passport then tells everyone it was returned, so a recycled unit resold as new shows.
- **Code:** `src/server/trace-takeback.ts` (`takeBackView` feeds `passportExtras`); migration **0196**
  (`trace_takebacks`, two product columns); sample answers (`sampleTraceTakebacks`, the sample olive
  oil offers it).
- **Trap (local):** `pnpm local:dev`'s parent restarts its server when the one on port 3000 is killed, so
  a schema change can keep being served by an old process: stop the whole tree (every `local/dev.mjs`,
  `next dev` and `next-server` process by number), clear `.next/dev` and `.next/cache/webpack`, start
  one again.
- **Tested:** `pnpm check`; `scripts/checks/trace-takeback-api.mjs` (the offer on the passport; not
  before owning it; asking twice and a stranger refused; the code hidden from others; only the brand
  lists and receives, once; TAKEBACK points and the Green action; the passport after); axe on the
  passport card and the console list (sample mode) at 390 and 1280, light and dark.

## M147: Trace, reports of fake labels (the owner, 10 Nov 2026: the eight features)

- **The buyer** (passport, only when this check says **Be careful**): "Where did you get it?": a shop
  or website (required), town or area, price paid; signed in; one report per person per unit
  (`POST /trace/scan/:code/report`, `reportFake` in `src/server/trace-plus.ts`). Accepted only for a
  unit with a suspect check or a code the brand flagged ("This one checks out as genuine" otherwise).
  The area falls back to the request's city; a position (only if the person allowed it) is kept to 0.1°.
- **The brand** (Radar → **Where copies are sold**): the last 90 days grouped by shop (case and spaces
  ignored), with the area, the lowest price and the number of reports; never who reported (the Radar's
  answer has no user ids or emails). Part of `GET /trace/radar` (`copiesSold`), so no new GET route;
  the sample Radar has two shops.
- **Fixed on the way (the Radar page, axe):** a recall's "high" label (amber 700 → 800 for contrast)
  and the likely-copies list, which scrolls, can now be reached with the keyboard.
- **Data:** migration **0197** `trace_fake_reports` (unique per unit and person).
- **Tested:** `pnpm check`; `scripts/checks/trace-fakes-api.mjs` (a genuine unit refused; a check far
  from the first one is a likely copy and can be reported once, not signed out, not without a shop; the
  Radar lists it without the reporter); axe on the form (a check from far away) and on the Radar
  (sample mode) at 390/430 and 1280.

## M148: Relief, the shelter and supply board (the owner, 10 Nov 2026: the eight features)

- **Everyone in Relief** (under the live map: **Places to go**, `components/relief/PlacesBoard.tsx`): the
  organisations that said how they are this week: open or closed, "12 of 40 beds free" with a bar,
  water / food / charging as green yes, amber running low, red none, a short note, "Updated 2 h ago"
  (older than a day: dashed and grey, "Not updated today"); filters (a bed, water, food, charging);
  "On the map" flies the map there. Order (`rankPlaces` in `src/lib/relief.ts`, tested): open places that
  spoke today first, nearest first when you shared your position, else the newest word; then stale;
  then closed. `GET /relief/places` (signed in; the last 7 days; bases already rounded to about 500 m;
  no join code, number or people).
- **Coordinators** (an organisation's Overview → **Live status**, `PUT /relief/orgs/:id/status`,
  coordinator only through `member(u, id, true)`): open now, beds free and in all (free never above
  all), water / food / charging (YES, LOW, NO; anything else is left empty), a note; saved with the time.
  Volunteers see it read-only. It needs a base (Edit) to show on the board.
- **Data:** migration **0198**: eight columns on `relief_orgs` (`openNow`, `bedsFree`, `bedsTotal`, `water`,
  `food`, `power`, `statusNote`, `statusAt`); the org's own answer includes them. Sample answers:
  `sampleReliefPlaces` (six places).
- **Trap:** `CardHead` sets no id, so a section using it is labelled with `aria-label`, not
  `aria-labelledby`; and no `opacity` on a card with text (it fails contrast): use a dashed border.
- **Tested:** `pnpm check` (`relief.test.ts`); `scripts/checks/relief-places-api.mjs` (a coordinator
  shares, a volunteer can't, beds clamped, bad values emptied, the board leaks nothing, signed out
  refused); axe on the board (sample mode) and on Live status at 390/430 and 1280.

## M149: Relief, skills matching (the owner, 10 Nov 2026: the eight features)

- **Helpers** (Mine → "Tell me about needs near me" → **What I can do**): first aid, doctor or nurse,
  driving, a boat, translating, cooking for many, building and repairs, looking after children,
  listening and comfort, phones and tech (`SKILLS` in `src/lib/relief.ts`), saved with their alert
  (`relief_watches.skills`, only listed skills kept).
- **A need** (the "Ask or offer help" form): "Needs someone who can…" (optional, needs only; offers keep
  none); shown on the request card and in the list ("needs: first aid").
- **Who hears** (`whoToAlert` in `src/lib/relief.ts`, tested; used by `alertWatchers`): helpers within
  their radius with that skill hear **"Your skill is needed: First aid"** even if they asked for urgent
  needs only or chose other kinds; everyone else gets the usual alert under their own filters; never the
  person who asked; 80 at most, the skilled first. The haversine distance moved to `kmBetween` there.
- **Data:** migration **0199** (`relief_watches.skills`, `relief_posts.skill`).
- **Tested:** `pnpm check` (`relief.test.ts`); `scripts/checks/relief-skills-api.mjs` (a first-aider with
  narrow filters hears "Your skill is needed", a helper who wants everything hears the usual alert, the
  asker hears nothing, a made-up skill dropped, an offer keeps no skill); axe on the settings (sample
  mode) at 390 and 1280, light and dark.

## M150: Relief, the "I'm safe" check-in (the owner, 10 Nov 2026: the eight features)

- **Coordinators** (an organisation's Overview → **Emergency check-in**, owners and coordinators only):
  say what is happening, an area name (optional), within 5/20/50/100 km and for 1 day / 3 days / 1 week;
  the area is drawn around the organisation's base (a base is needed). At most 3 going on per
  organisation; **End it** stops it at once. Helpers whose nearby alert falls inside the area are asked
  "Emergency near you: …" in the app and on their phone (no email; 200 at most; never the declarer).
- **Everyone in Relief** (`SafetyCheck` at the top of the Relief page, while one is going on): **I'm safe**
  opens "Tell people you're safe": a list of the people they already have a **direct conversation** with
  (Messages, not groups or communities; 20 at a time); only the ticked ones are told ("Sam is safe", in
  the app and on their phone), and only they see it, under the banner ("Priya, Tom told you they're
  safe"). Telling more later adds them; nobody is told twice. **I need help** opens the request form set
  to Critical.
- **Server:** `src/server/relief-safety.ts` (`contactsOf`, `reliefIncidents`, `declareIncident`,
  `endIncident`, `markSafe`); routes `GET/POST /relief/incidents`, `POST /relief/incidents/:id/end`,
  `POST /relief/incidents/:id/safe`, `GET /relief/contacts`, all signed in. Who is safe is never public:
  the list returns names only to the people told, no ids or emails. Out-of-range numbers fall back to the
  defaults (20 km, 3 days).
- **Data:** migration **0200**: `relief_incidents`, `relief_safe` (one row per person and emergency),
  `relief_safe_told` (who was told). Sample answers: `sampleReliefIncidents`, `sampleReliefContacts`.
- **Also:** the number tiles' small unit text (`FactorCard`, "of 8", "6 shifts") was too faint in light
  mode for axe; now 80% instead of 60%.
- **Rule for code that builds on it:** "tell" lists are always filtered through `contactsOf` on the
  server, so the check-in can't be used to message strangers; keep it that way.
- **Tested:** `pnpm check` (`relief-safety.test.ts`: contacts once each, newest first; only contacts told,
  nobody twice; refused after the end; volunteers can't declare); `scripts/checks/relief-safety-api.mjs`
  (volunteer and outsider refused, defaults, only the contact told and sees it, the notification, ended
  means refused and gone, signed out refused); axe on the banner, the window and the card (sample mode)
  at 390 and 1280, light and dark.

## M151: Relief, traceable aid (the owner, 10 Nov 2026: the eight features)

- **Organisations** (an organisation's page → **Aid boxes**, a new tab): coordinators **pack a box** (what
  is in it, how many boxes, from where (their base's town by default), going to a town or area; 300 a
  day) and get a **label** with a QR code, the code and a link to send donors (Print uses the existing
  `.print-sheet` print rules). Any member logs **On the way** (the town now, a note) as many times as
  needed and **Delivered** (the destination by default); delivered is final, claimed by a guarded update.
- **Donors** (`/aid/<code>`, public, kept out of search; `/aid/demo` is a sample): what is in it, who
  sent it, going where, a three-step bar (packed, on the way, delivered) that fills as the page opens,
  and the trip (towns, notes, times). Signed in, **Follow this box**: told at each step in the app and on
  the phone (no email; 200 at most). Signed out: "Sign in to follow it".
- **Never people:** the public answer has exactly the contents, counts, towns, notes, times, the
  organisation's name, kind and town, and the number following: no ids, no join code, nobody who
  packed, carried or received it. The step window reminds members not to name people. Codes are 10 of
  32 look-alike-free characters (50 bits, `crypto.getRandomValues`), typed with or without dashes.
- **Server:** `src/server/relief-aid.ts`; routes `GET/POST /relief/orgs/:id/aid` (members / coordinators),
  `POST /relief/aid/:id/step` (members), `GET /relief/aid/:code` (**public**, listed in
  `route-gates.test.ts` with its reason), `GET/POST /relief/aid/:code/follow` (signed in). Rules in
  `src/lib/relief.ts`: `AID_STEPS`, `aidMayMove`, `aidCodeOf`, `demoAid` (tested). `/aid` is a Relief
  path in `APPS` (its colour and scene).
- **Data:** migration **0201**: `relief_aid`, `relief_aid_steps`, `relief_aid_follows`. Sample answers:
  `sampleReliefAid`, `sampleAidTrip`.
- **Also:** the Relief API checks (`relief-places-api`, `relief-safety-api`, `relief-aid-api`) reuse
  their test organisation from an earlier run (a person can start 5), so they can be run again and
  again on one computer.
- **Tested:** `pnpm check` (`relief.test.ts`: steps forward only, codes read); `scripts/checks/relief-aid-api.mjs`
  (a volunteer can't pack, an outsider can't see or move, no going back, delivered defaults to the
  destination and is final, the public trip's exact fields, the follower hears both steps, unfollow, a
  wrong code 404, the sample); axe on `/aid/<code>` signed out and in, `/aid/demo`, the Aid boxes tab, the
  label and the step window at 390 and 1280, light and dark.

## M152: emails for the new alerts (the owner, 10 Nov 2026: "please do this" for what M144–M151 left out)

- **Now by email too** (each person's own Settings → Notifications switch still decides, and the site's
  email allowance, `claimEmails`): "Emergency near you" and "<name> is safe" (M150) as **urgent**, so they
  may use the part of the allowance kept for essential emails (`NotifyInput.urgent`); an aid box you
  follow moving or arriving (M151); a brand receiving your take-back (M146).
- **Nearby-need alerts** (M22, M149) can come several times a day, so they email only helpers who tick
  **Also email me** on their alert (Relief → Mine → "Tell me about needs near me"; `relief_watches.email`,
  migration **0202**, off by default). The guide's Relief rule changed from "never email" to that.
- **Rule for code that builds on it:** a new alert that can repeat often stays in-app and on the phone
  unless the person chooses email; rare, personal ones may email by the person's setting.
- **Tested:** `pnpm check` (`relief.test.ts`: only the ticked helper is emailed, the other gets the same
  alert without email); the Relief API checks (skills, safety, aid) still pass; the setting saves; axe
  on Relief → Mine at 390 and 1280, light and dark.

## M153: Relief emergency texts (the owner, 10 Nov 2026: "please do this"; [owner] to turn on)

- **Helpers** (Relief → Mine → "Tell me about needs near me"): **Text me in an emergency** plus their
  number with the country code (checked by `textNumber`; refused otherwise). Kept on their alert
  (`relief_watches.smsTo`, migration **0203**), returned only to them, never shown to anyone. The option
  only shows when texts are on (`GET /relief/sms` → `{ on }`; the sample answer says on, so the demo
  shows it).
- **When an organisation declares an emergency** (M150), the helpers asked "Are you safe?" who gave a
  number also get **one text** (`textEmergency` in `src/server/relief-sms.ts`, run after the answer with
  `later`): plain ASCII under 160 characters so it is one paid message (`emergencyText` in
  `src/lib/relief.ts`, tested): "Relief: emergency near you: <title>. Are you safe? <link> (reply STOP
  to end)". One per person per emergency (`relief_sms_sent`, recorded before sending), at most **100 an
  emergency and 300 a day**; about ten queries whatever the number of people.
- **Off until the owner** turns on **Relief emergency texts** (console → Server → Feature switches, an
  opt-in switch) and sets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (their Twilio
  number, or a Messaging Service SID starting MG). Twilio charges per message.
- **Tested:** `pnpm check` (`relief-sms.test.ts`: nothing while off or without the settings, once per
  person, the daily cap; `relief.test.ts`: the text's length and characters); `relief-safety-api.mjs`
  now also checks a bad number is refused, a good one kept, and texts are off locally; axe on the
  setting (ticked) at 390 and 1280, light and dark.

## M154: aid boxes on a map, helpers' names by choice (the owner, 10 Nov 2026: "please do this")

- **The owner asked for exact locations and for people to be shown.** Done as far as is safe: aid in
  transit and the people with it can be targeted, and Relief's rule rounds every position to about
  500 m, so **positions are rounded to about 500 m** (`snap`) and **only helpers who choose** show their
  **first name**; the people who receive aid are **never** shown.
- **Members** (organisation → Aid boxes → On the way / Delivered): **Add where it is now, for the map**
  (the device's location, rounded when saved; removable before saving) and **Show my first name (Jane)
  to donors** (remembered on that device; also on "Pack a box"). Packing takes the organisation's base
  (already rounded) as its position. `firstName` in `src/lib/relief.ts` skips titles ("Dr. Jane Smith" →
  "Jane"; tested).
- **Donors** (`/aid/<code>`): an **On the map** card (`src/components/relief/AidMap.tsx`, loaded only on
  that page with `next/dynamic`): the places joined by a dashed orange route that flows while the box is
  on its way, the latest place glowing (still with Reduce Motion or once delivered); the map's own city
  names for those places are left out (`skipCities`); the map doesn't take scrolling or dragging. Steps
  say "packed by / carried by / delivered by <first name>" when chosen.
- **Data:** migration **0204**: `relief_aid_steps.lat`, `lng`, `byName`. The public answer's step fields
  are now exactly status, place, note, lat, lng, byName, createdAt (checked).
- **Tested:** `pnpm check` (`relief.test.ts`: `firstName`); `relief-aid-api.mjs` (a position rounded to
  0.005°, packing at the base, no position when none was shared, a first name only when chosen); axe on
  the donor page (with the map), the Aid boxes tab and the step window at 390 and 1280, light and dark.

## M155: upgrades for the eight features (the owner, 10 Nov 2026: "see what else you can add… upgrade all the existing features")

- **Live, not waiting a minute:** `publish(ids, { type: 'refresh', keys })` (`src/server/realtime.ts`) now
  reloads the right screen at once: the emergency banner for the helpers asked "Are you safe?" and for
  the people told "<name> is safe" (`/relief/incidents`); an aid box's page and the organisation's box
  list for its members and followers when it moves (`/relief/orgs/<id>/aid`, `/relief/aid/*`). The donor
  page also refreshes itself every minute while the box is on its way (`useActivePoll`), never after.
- **Coordinators see how many said they're safe** (a number, never who): `safeCount` on
  `GET /relief/incidents`, only for an emergency's own coordinators (null for everyone else; checked);
  shown on the organisation's Emergency check-in card.
- **Share:** "Share" on the donor page and "Share the link" on the box label (`shareLink` in
  `src/lib/share-link.ts`: the phone's share sheet, else copy; cancelling isn't an error).
- **Directions** on every place in "Places to go": opens the phone's maps app searching the place's
  name and town (the saved spot is rounded, so the name finds the real door).
- **Trace: brands hear about fake-label reports at once** (`reportFake`, M147): "A copy of <product>
  was reported" to the brand's team (in the app, by email per their setting), at most 5 an hour, never
  who reported.
- **Checks made rerunnable:** `trace-fakes-api.mjs` uses a new shop name each run.
- **Tested:** `pnpm check`; `relief-safety-api.mjs` (the coordinator's count, null for a volunteer),
  `trace-fakes-api.mjs` (the brand's notice, no reporter), `relief-aid-api.mjs`, `relief-places-api.mjs`;
  axe on the banner, the org card, the donor page, the Aid tab and "Places to go" at 390 and 1280, light
  and dark.

## M156: motion for the eight features (the owner, 10 Nov 2026: "upgrade the animations and make everything ultra smooth")

- **Already free from the motion layer** (`scroll-motion.ts`): cards glide in, numbers count up and roll,
  bars fill (the shelters' beds), new list rows glide in. M156 adds motion for *changes*:
- **Filtering "Places to go"** slides each place to its new spot and new ones grow in from 0.94:
  `morph(list, update)` in `src/lib/view-transition.ts` (FLIP: measure, `flushSync` the change, play the
  difference as one transform per item with the Web Animations API on `SPRING_GLIDE`; items carry
  `data-key`; instant with Reduce Motion). **Trap:** a View Transition was tried first; it snapshots the
  whole page, and beside Relief's live map it made the filter slower (9 slow frames to 2 at 4× CPU).
  With FLIP the slow frames are the page's own (the same without the sliding), in the local dev build.
- **Arrivals on the spring** (`globals.css`, the M156 block): `.drop-in` (the emergency banner drops in a
  few pixels), `.pop-in` (the trip's three steps one after another; an aid box's status badge when it
  changes, keyed by status). The aid progress bar fills on arrival and now **glides on** when a live step
  moves it (`animation-fill-mode: backwards` plus a transform transition).
- **Attention ring** `.pulse-ring`: a soft copy of the element's own fill spreads out behind it (the
  emergency's siren, the box's current step while it moves); transform and opacity only, rests while
  the page scrolls (`html[data-scrolling]`), none with Reduce Motion.
- **The footprint's two-part bar** grows as one piece (`.bar-in`, `data-no-motion`): the motion layer
  would grow each part from its own edge, leaving a gap.
- **Measured** (390 px, CPU slowed 4×): the donor page opening 1 slow frame in 90, its moving map 0 in
  121 (60 a second).
- **Tested:** `pnpm check`; the sliding plays on a filter (`getAnimations`); axe on the banner, org card,
  donor page, Aid tab and windows, "Places to go" and the passport's footprint at 390/430 and 1280.

## M157: a sweep for problems (the owner, 10 Nov 2026: "check if any other bugs or errors are there in system or app")

- **The live error log** (production `error_reports`, read-only): rows with ids `smp…` are the console's
  sample data, not real. Four real ones: the People list's "too many SQL variables" (fixed earlier; the
  owner marks it resolved), two chunk errors from bots (ignored automatically), and one visit on 7 Nov
  that met a deploy halfway ("Blank page: styles came from elsewhere", then a background thread's file
  gone): the recovery script reloaded it by itself. The other two map threads were fixed in M137; the
  **world map's thread** (`engine.ts`, Trace and Relief maps and now the aid map) still let a handled
  failure reach the page as an error: now `e.preventDefault()` like the others (it draws on the page).
- **A crawl of the built site** (`pnpm local:build` passed: 49.4 of 64 MB, 5.6 minutes): every page in
  the menus as a student, a teacher and an admin (199 pages): no crash screens, no blank pages, no server
  errors except `/api/calendar-link` (503 by design until the owner sets `SESSION_SECRET`; the calendar
  card explains it). A rare React hydration mismatch (#418) showed twice in about 400 loads on different
  pages (Meetings, Users, Play) and not in 100 targeted loads; React redraws that part itself and it is
  not in the live error log. Not chased further: if it shows up there, start from what changes the DOM
  before the dashboard frame hydrates.
- **Fixed in the new Relief code:** the emergency banner showed every emergency in the world to everyone
  in Relief; now only to the people it concerns (`reliefIncidents`: the organisation's members, helpers
  whose alert is inside the area, the place the browser already shared, sent as `?lat&lng` and rounded,
  anyone told "<name> is safe", anyone who said they're safe; tested). Saving the alert while texts are
  off no longer wipes the helper's phone number (`smsTo` left as it is when not sent).
- **Fixed elsewhere:** the student home's "Question" label (`DailyBrief`) was 10 px and too faint in light
  mode: 11 px, a darker shade. Two checks (`live-ui`, `world-ui`) read pictures with `getContext`, which
  throws on canvases drawn on a background thread since M85/M136: they now measure a screenshot
  (`litPixels` in `scripts/browser-session.mjs`), and pass.
- **Checks run on the build:** live-ui, world-ui, app-backdrop-ui, home-ui, card-menu-ui,
  calendar-ballast-ui, activity-log-ui, template-windows-ui, courses-center-ui, and the seven Trace and
  Relief API checks: all pass.


## M158: a sweep for problems: security, live errors, motion (the owner, 12 Nov 2026)

The owner: "analysis the project and make new things and enchance the security … make everything eltra
smooth … find any errors or bugs". New things are paused until 5 Dec (said once); the rest was done.

- **Numbers:** written on a branch cut at M128 as M129 and M130; main had gone on to M157 meanwhile (other
  sessions), so they were renumbered M158 and M159 when main was merged in, and the database update 0195
  became 0205.
- **Server Actions are outside the route test (M114).** `src/app/actions/transaction.ts` (the only
  `'use server'` file) let any school's admin list the last 500 payments of every school with names,
  emails and phones, and record a payment against anyone's account. Now `peopleWhere(caller)` on both.
  **Rule:** a new Server Action checks who is asking and their school itself; nothing tests it for you.
- **Two-step sign-in and Server Actions:** an action's request doesn't carry the app's `X-UV-Pass`
  header, so `getUserFromToken` refused every real admin once two-step is on (`SESSION_SECRET` +
  `RESEND_API_KEY`): Finances and Administrative would have gone empty. `getUserFromToken(token, pass,
  write)`: the screens pass `twoStepPass()`; `write` makes the request a POST so the read-only demo admin
  is refused (it could record payments before).
- **`madeInSchool(user, makerId)`** (`school-scope.ts`): for records with no school of their own, the
  maker's school decides (nobody named: the main school). Used for deleting a group's message as a school
  admin, editing or deleting campus info, an event's check-in code, and the creator details in the campus
  list (`keepInSchool`). **Left:** campus info itself is still one list for every school (no
  `organizationId` on `campus_items`): a database change, when a second school really joins.
- **Stray posts to pages** (`pageRequestOk` in `cloudflare/page-match.ts`, used in `worker.ts`): a page
  takes GET, HEAD and a POST with `Next-Action` (a Server Action); anything else gets 405 before Next.js
  starts. The live report of 10 Nov ("No boundary string in Content-Type header", a 500 on `/`) was a
  bot's broken upload form; reproduced on the local Worker, now 405. **Trap:** a form that posts to a
  page (`<form action={serverAction}>` without JavaScript) would be refused: the app has none; keep
  calling actions as functions.
- **The blank-page guard** (`recovery-script.ts`): a stylesheet whose rules can't be read (the page shown
  through a translation or archive site; Firefox while a sheet still loads) counted as "styles came from
  elsewhere" and reloaded the page, ending on the Reload screen (the 7 Nov report). Not proof of anything:
  now the text check decides.
- **Motion:** all 108 `transition-all` are `transition` (colours, shadow, opacity, transform) or the
  property that changes (`transition-[width]` for progress bars, `[top,left,width,height]` for the tour's
  spotlight, `[stroke-width]`, `[gap]`, `[height,background-color]`). `src/lib/motion-rules.test.ts` fails
  a new one. Buttons, sheets and page changes were already within the §8 rules; nothing else changed.
- **Looked at, left alone:** the other live reports are sample data (`smp…` ids) or already fixed
  (M58, M73); the importScripts report of 7 Nov is an old tab after a deploy (the recovery script reloads
  it). Library advisories (6: glob, minimatch, serialize-javascript, deepmerge) are all in build tools,
  none reaches the browser or the Worker; no safe pinned release without a major jump, so not changed.
  Raw SQL: all values bound. Admin modules in `src/server/modules`: scoped (F2).
- **Tested:** `pnpm check`; new unit tests (school-scope, page-routes, motion-rules); the local Worker:
  broken upload POST `/` 405 (was 500), GET 200, a `Next-Action` POST reaches Next.js; `scripts/crawl.mjs`
  on the built site, 208 pages as student, teacher, admin and parent: 201 clean, the rest expected (Trace
  pages asked by an account with no brand: 403; this machine's network).
- **[owner]:** in the console → Errors, mark resolved: the 10 Nov "POST failed … boundary", the two
  "Blank page: styles came from elsewhere", the importScripts one, and the old `/api/core/owner/people`.


## M159: campus info per school; the build libraries' advisories (the owner, 12 Nov 2026)

The owner, after M158's "left out on purpose" list: "please do all these".

- **Campus info per school** (migration `0205_campus_items_school.sql`): `campus_items.organizationId`
  (null: the main school, as on users), filled from each item's maker. `campusOf(user)`
  (`school-scope.ts`) is the filter; put it in `AND: [await campusOf(user)]` (it can be an `OR`, and
  search has its own). Every read and change uses it: the lists (`/api/campus-items`,
  `/api/campus/events`, meals, the campus map, search), sign-up, buying a ticket, check-in, the kitchen's
  orders, an admin's attendee list (it showed every school's people before), door code, edits and the
  map's "place event". A new item takes its maker's school. **Rule:** any new `campusItem` query takes
  `campusOf`. `madeInSchool` (M158) now serves groups only.
- **Not scoped on purpose:** `event-tickets.ts` (a paid order finds its own event by id, from Stripe's
  callback: no person is asking).
- **Libraries** (root `package.json` overrides, each release two weeks old or more): glob 9–14.0.1 →
  14.0.3, minimatch 7–11.0.0 → 11.0.3, serialize-javascript → 7.1.3. All three are build tools (the
  Cloudflare adapter, the offline worker's builder). `pnpm audit --prod`: 6 → 1; the one left, deepmerge
  (low, inside the offline worker's builder), has no fixed release.
- **Tested:** `pnpm local:build` (passed, 4.7 minutes), then on the built Worker with two test events
  (one in another school, removed after): the main school's admin lists only the main school's; another
  school's event answers 404 for the door code, attendees and sign-up; a student of a different school
  sees neither. `pnpm check`.
- **New things (the pause):** the owner chose "something for the first class" over the games; a proposal
  was put to them (a "Since your last visit" card on the student and teacher home). Not started.
- **Next database update: 0206.**

## M160: no breadcrumb row above page titles (the owner, 10 Nov 2026: "remove like top row because it is not useful")

- The top bar's "Academics › Knowledge & library" row (M3's `Breadcrumb` in `Topbar.tsx`, from
  `src/lib/breadcrumbs.ts`) is gone on computers and phones, with its helper and test. The side menu
  already shows where you are (the chosen entry), and the page title says the rest.
- **Kept on purpose:** `DocBreadcrumb` inside Docs, Sheets and Slides: there it links a sub-page back to
  its parent pages (real navigation, not a repeat of the menu).
- (M164, the landing globe, was asked first and is in progress; M161 and M162 are the time boxes and the
  arrow buttons from the same message.)

## M161: fields that line up (the owner, 10 Nov 2026: "09:00 AM" cut off, labels not aligned, "for everywhere")

- **The cause, everywhere:** a field written inside its label with a top margin (`<label>Day starts<input
  className="input mt-1 w-32" /></label>`) meant "under the label", but inputs are inline: with a fixed
  width (`w-32`) it fitted beside the label's text, so rows lost their line, and at 120 px a time field
  with AM/PM and its clock icon (128 px) was cut ("09:00 AI").
- **Two rules in `globals.css` (the M161 block):** `label > .input` with an `mt-*` class is `display:
  block` (under its label, as written); every date, time, date-time, month and week field has `min-width:
  max-content` (never narrower than what it holds, whatever width it was given). A field meant to sit in a
  sentence keeps `inline-block` (a utility wins).
- **Found by measuring** each date/time field's width against the width its content needs, on the pages
  that have them, for three roles at 1280 and 390: the timetable's "Plan a week" (the owner's picture)
  and Student life → Rooms (a date field cut at 178 of 190 px) were the cut ones; now none.
  `scripts/checks/fields-ui.mjs` keeps checking it (plus no sideways scroll).
- **Rule for new screens:** a field under its label: `mt-1` on the field (or a `flex flex-col` label); don't
  give date or time fields a width under what they hold.

## M162: arrow buttons answer a press, everywhere (the owner, 10 Nov 2026: "when i click on any arrow button it should show some animations… fix this for everywhere")

- **Every arrow button at once** (`src/lib/tap-motion.ts`, the app's one click listener): a button or link
  holding a lucide chevron or arrow (`lucide-chevron-*`, `lucide-arrow-*`, `lucide-move-*`) makes its arrow
  dart 5 px the way it points and spring back (`arrowWay` reads the way from the icon's name, tested; an
  arrow turned round for right-to-left counts as the other way), and a plain button sinks to 0.9 and
  settles (`.btn-*` already press on their own spring). Individual `translate` and `scale`, so a chevron's
  own CSS rotation (open/closed) is untouched; on the compositor; nothing with Reduce Motion; disabled
  buttons don't move. The side menu and tab bar keep their bounce.
- **What an arrow changes slides in from that side** (`.swap[data-dir="next"|"back"]` in `globals.css`, the
  M162 block: 22 px and a fade on `--ease-glide`, mirrored right to left, a fade with Reduce Motion; the
  element is keyed by what changed so each change plays once): the tasks board's month calendar and
  timeline, the staff register's day and the cover week (both also keep their arrows while the next one
  loads: `keepPreviousData`), Trace's label print pages, the revision reels' words, the call agenda's
  item. Already sliding before: the calendar's weeks (`TimeGrid`), the date range picker's months, the
  photo viewer; the lesson flashcards flip in.
- **Found by** listing every file with a back or forward arrow (22 with ChevronLeft) and checking which
  change content in place without motion.
- **Tested:** `pnpm check` (`tap-motion.test.ts`: `arrowWay`); `scripts/checks/arrows-ui.mjs` (on the staff
  register: the arrow's `translate`, the button's `scale` and the day's `.swap` run; on the calendar the
  arrow darts).

## M163 (first numbered M158 on this branch): the sign-in page lined up (the owner, 10 Nov 2026: "the animations and text doesn't align properly")

- **The picture** (`.auth-scene`, `AuthShowcase`): on screens under 960 px tall it was shrunk with
  `scale` from the top-left corner: tiny text, pinned to the corner, and a box of its full size left
  behind. Now `zoom` (its layout shrinks with it), in gentler steps (0.86, 0.78, 0.7; hidden under 700 px),
  so it lines up with the headline's left edge and its text stays readable. **Trap:** `scale`/`transform`
  never shrinks the space an element takes; `zoom` does (all current browsers).
- **The activity cards** under the campus picture kept a "depth" narrowing (each older card 2 % narrower)
  that read as misalignment: now one width (opacity still fades the older ones). Also on the landing.
- **Trace's passport card** stood 40 px out of its picture's box, onto the line under it: the box is
  520 px tall now. (Relief's apparent spill is only its spinning sweep's box, clipped inside the disc.)
- **The headline** sits on `.text-pool` (the landing's soft pool), so the scene's lines and paper sheets
  pass under the words.
- **The footer:** "© 2026 … · Made with ♥ by Aditya Bhatt" together on the left (the credit used to float
  mid-page), and the Terms and Privacy links moved from under each form into the right column's foot
  (`AuthFrame`), level with it.
- **Branch note:** after PR #120 was squash-merged the branch restarted from `main`; its old commits are
  recorded with a merge that keeps `main`'s files (`git merge -s ours`), so pushes never need force.
- **Tested:** screenshots at 1280×720, 1440×900, 1600×830, 1920×1080 for the five app tabs; nothing
  spills out of its box (measured); axe on /login, /register and a Lab tab at 390 and 1280, light and dark.

## M164 (first numbered M159 on this branch): the landing's globe, smaller and useful, and smooth (the owner, 10 Nov 2026: "reduce the size of the globe map and make it more functional… make everything ultra smooth specially the globe")

- **Smaller:** the planet's box went from 1152 × 600 (the section 1,196 px tall) to at most 480 × 460 beside a
  list (the section about 1,075 px with the list and notes), 320 px tall on phones. Its stars and glow
  fade out before the canvas's edge (`.world-planet canvas` mask, 88 %), so no square shows round it.
- **More useful** (`WorldSection.tsx`): the five apps as a list that steers the planet: pointing at (or
  focusing) a row turns the planet to that app, choosing it opens the row in place (what it does, three
  things it really does, "Start with …" and "Show me …"), and a pick on the planet opens the same row. Each
  row shows the app's real number from the site's daily totals (`useTotals` in `LiveTotals.tsx`, one
  request shared with the totals strip; Trace products checked, Relief people helped, Green kg of CO₂,
  Play games played; none for UniVersity; under 10 isn't sent). The two notes ("One wallet", "Live
  everywhere") sit under it instead of floating round it; "Start free" closes the section.
- **Smooth:** the pointer light on the landing and sign-in pages (`[data-cursor-light]`) wrote `--mx/--my`
  on the page's outer box every frame, which restyled the whole page and repainted a page-sized
  gradient: dragging the globe with a mouse had 9 slow frames in 40 (CPU slowed 4×). Now one 1040 px
  element (`.cursor-glow`) moved with `transform` (`light-motion.ts`): 0 slow frames in 97. On a phone
  the globe idles and drags at 60 a second. **Rule:** never write a custom property on a big ancestor
  each frame; move one element with `transform`.
- **Tested:** `pnpm check`; `world-ui.mjs` (the planet draws, axe on the landing at 390 and 1280),
  `app-backdrop-ui.mjs`; frame times idle, dragging and opening a row at 390 and 1280; a row opens with its
  "Start with" link; axe on the section with a row open.

## M165: arrange any page with the mouse (12 Nov 2026)

The owner (12 Nov, with a picture of Quick notes): "resize that quick note page and also change its
locations just by dragging things from one place to another… in every page of this project even with
the buttons". Their exception to the launch pause (said once). The first version had a top-bar mode
with dashed outlines and a bar; the owner the same day: "just want to use the mouse over there… no
need to show any lines there or message", so there is **no mode and nothing is drawn**.

- **What it is:** on every page inside the app, press a card, a button, a tab or a pane and move the
  mouse: it follows and takes a new place among its neighbours. A card's right and bottom edges resize
  it (the pointer turns into a resize arrow within 8 px of them). A press that doesn't travel 6 px is
  still a click; the press that ends a move isn't. On a phone (and on words that can be selected, with
  a mouse) hold still 350 ms first, so swipes still scroll and text still selects; headings and labels
  drag at once. Keys: Alt + Shift + arrows move the focused thing, Ctrl + Alt + Shift + arrows resize
  a card, Ctrl/⌘ + Z takes a change back (not while typing in a field).
- **Putting it back:** `ArrangeButton` in the top bar (and the phone's title row) is "Put this page
  back", shown only on a page the person rearranged (`src/store/arrange.ts`, `ArrangeMode.tsx`).
- **How (`src/lib/arrange-dom.ts`, class `Arranger`, made once for `#main` in `DashboardShell`):** nothing
  describes a page, and React owns the tree, so it never moves a node. A group is a container with
  2–24 shown children; reordering sets CSS `order` on them (a block container becomes a wrapping flex
  row, `data-arranged="col"`; `reading-flow` keeps the Tab order with what is seen), sizes are an inline
  width (share of the row), grid span or height. Things are known by what they say (label, heading,
  button text without digits: `cleanKey`, `uniqueKeys`), and a saved group belongs to the container
  holding at least two of its names (`overlap`), so it survives the page changing; a card that is new
  sits next to what it follows (`arranged`). A MutationObserver puts the arrangement back when the page
  re-renders (only on a page that has one).
- **What it never grabs** (`NOGRAB`, `item()`): fields, selects, editable text, canvases, iframes, video,
  sliders, dialogs and menus, `draggable="true"`, tables, `divide-` lists, the side menu, phone tabs;
  anything with `touch-action: none` or framer's `draggable="false"`; and anything whose React props
  have a press handler (`onPointerDown`, `onMouseDown`, `onTouchStart`: read from `__reactProps$…`, a
  marked `shortcut:`), so editors, the calendar grid and swipe rows keep their own dragging. The
  listener runs after the page's own (bubble) and steps aside if the press was prevented or captured.
- **Kept** per person, per path, on this device: localStorage `uv-arrange:<user id>` (`src/lib/arrange.ts`,
  `cleanStore` drops anything odd; 150 pages at most). Not in the account (no database change).
- **Quick notes** (`QuickNotes.tsx`): its three panes are a flex row, with a divider to drag between
  them and one under it for the height (`Splitter` and `usePaneSizes` in `src/components/ui/Splitter.tsx`:
  pointer, arrow keys, Home or a double-click puts it back; kept on the device as
  `uv-quick-notes-panes`). Computers only; phones keep one pane at a time. Its panes also change
  places by dragging an empty part or a heading. Reuse `Splitter` for any other split view.
- **Smooth:** the dragged thing follows the pointer by `transform` once a frame, its neighbours glide to
  their new places (FLIP, measured only when the order changes), a drop settles on the spring; the edge
  lookup on hover runs once a frame and only with no button down.
- **Rules for code that builds on it:** `data-no-arrange` on anything that must not be moved or that
  drags by itself in a way the list above doesn't catch; `data-arrange-key="…"` to give a thing a steady
  name when its text changes; never rely on DOM order for what is seen first inside `#main`.
- **Left out on purpose:** following a person to another device (needs a table; say so if asked); rows
  inside tables and lists with dividers; the side menu; dragging a card from one group into another.
- **Trap for browser checks:** a page arrives slightly scaled for about a second (the page transition):
  wait before measuring sizes. The older drag checks (`cal-ui`, `slides-ui`, `notes-ui`, `guide-ui`) need
  the built Worker (8787) and were not rerun; the drawing tools were not opened by a check either.
- **Tested:** `pnpm check` (`src/lib/arrange.test.ts`); `arrange-ui.mjs` on the dev server (a click still
  presses, sweeping inside a field moves nothing, a toolbar button moved without a click and kept after
  a reload, a card resized, "Put this page back", Ctrl+Z, the dividers, panes changing places with 0
  slow frames in 127, a phone: a held tile carried past its neighbour; axe at 1440 and 390); selecting
  words with the mouse on the student home and timetable still selects and rearranges nothing.

## M166: arranging everywhere, synced across devices when a person chooses (12 Nov 2026)

The owner (12 Nov), on M165's "left out on purpose": "Can you do all these also and for the saved
arrangement in another device give this as a setting option where user can select if they want to sync
that in another device… make sure arrangement feature works properly… ultra smooth and synced properly".

- **Syncing, a person's choice (off by default):** Settings → Appearance → "Use my arrangement on my
  other devices" (`ArrangeRows` in `SettingsApp.tsx`; also found by searching "arrange", "sync"). On: the
  whole arrangement is kept in the account, table `user_arrangements` (migration **0206**, one row a
  person, `data` = the JSON `Doc` of `src/lib/arrange.ts`); no row means off. Routes (`src/server/arrange.ts`,
  in `impact-apps.ts`): `GET /arrange` (`{ sync, doc }`), `PUT /arrange { doc }` (turns it on and joins
  this device's copy into the account's), `DELETE /arrange` (off; the account's copy is removed, each
  device keeps its own). Signed-in only, the person's own row only; the copy is cleaned on the way in and
  out (`cleanDoc`) and refused over 200 KB. Sample mode answers `{ sync: false }`.
- **How two devices agree (`mergeDocs`):** page by page, the later change wins, by the time each page was
  last changed (`Doc.at`); a page put back keeps its time with no groups, so "put back" travels too; the
  same moment on both sides picks the same copy whoever asks. A change is sent 1.2 s after it is made
  (`ArrangeMode.tsx`); the server tells the person's other open devices (`publish` refresh `/arrange`),
  which fetch and join it; a device that comes back joins on its first load (and on focus). A change
  still waiting when the page closes goes then.
- **One store a person (`Vault` in `arrange.ts`):** read once, written on every change, shared by the
  page's arranger and the side menu's, told when another device's copy changes a page that is on screen
  (it is drawn again unless a hand is arranging it). Old M165 copies (pages alone) are read as they are.
- **The side menu:** its entries move like everything else (a second `Arranger` on `#side-nav`, `menu`
  mode: entries move, nothing resizes, no rows open); one arrangement per app's menu and role
  (`data-arrange-scope` on `#side-nav`, kept under the path `/~menu/<app>-<role>`). "Put this page back"
  puts the page back first, the menu when only it was changed. A click on an entry still opens it.
- **Table rows** (`tbody > tr`, up to 60): a table whose rows changed places is drawn as a grid, each row
  a sub-grid of its columns at the widths they had (`--arr-cols` in shares, so nothing shifts), with
  `role` table / rowgroup / row / cell added (and removed when put back) so screen readers still read a
  table. A row is known by everything it says. Only the body's rows move (not the header, not cells).
- **Lists with lines between their rows** (`divide-y`): the lines follow the order shown
  (`data-arr-div="top|bottom"` and `data-arr-edge` in CSS), one line between each, none at the ends.
- **Out of its group and into another:** carry a thing out of its row and the row opens into what holds
  it (`display: contents` on that row and on wrappers that only wrap it, `unwrap`), its things keeping
  the widths they had; it then sits among the page's cards. Carry it over another row and that row opens.
  Kept as `Entry.open` (the opened rows' names; found again by what they hold if their name changed).
  When a row's things end up side by side again it closes (`close` / `shut`), drawing again only the rows
  involved. Only plain wrappers open (no fill, edge, shadow, padding, clipping, role or name: `plain`).
- **Undo a resize:** double-click a card's edge. **Phones:** widths chosen on a wider screen wait (under
  640 px a page is one column); the order and heights are used. Quick notes on a phone: a grab bar
  between the list and the open note; pull it down to keep the list in view (`Splitter` `pill`, `target`).
- **Smooth:** the page is re-read only when things are added or taken away (not when numbers count up or
  text changes); a row is asked once per carry whether it opens; on a drop only the rows involved are
  drawn again (it was the whole page: one 600 ms frame on the student home). Carrying a tile out of its
  row now costs no more than moving the mouse over that page in the test browser.
- **Rules for code that builds on it:** a page's own wrappers stay plain where they can (that is what lets
  cards leave their rows); a new store of a person's layout goes through `Vault`, never straight to
  localStorage; keep `Doc` small (it is one row and one request). `data-no-arrange` still leaves a part
  alone.
- **Left out on purpose:** dragging between the side menu and the page; a thing carried into a box that
  has a look of its own (a card with a fill or padding: it would change how the card looks); table
  columns (only rows move); rows of a table's header or footer.
- **Trap for browser checks:** the bottom 56 px of a window scroll the page while something is carried:
  keep a check's aim above it. The dev server sometimes stalls on its first page: warm the pages first.
- **Tested:** `pnpm check` (`arrange.test.ts`: joining two devices, the old format; `src/server/arrange.test.ts`:
  off by default, only the person's row, odd and oversized copies refused, off removes it);
  `arrange-more-ui.mjs` twice in a row (a grades row moved and kept with columns under their headings,
  axe clean; people rows keep one line between each; the menu moved, kept, put back, still opens; a tile
  out of its row and back, Ctrl+Z, put back with no traces left; a resize undone by a double-click; two
  devices: off shows nothing, on in Settings shows it, put back on one is put back on the other, signed
  out 401, off removes the copy; axe on Settings; a phone: the notes grab bar, a computer's width unused,
  its order used); `arrange-ui.mjs` (M165's check) still passes.

## M167: the side menu and the page, inside cards, and table columns (13 Nov 2026)

The owner (13 Nov), on M166's "left out on purpose" (the menu and the page, a card with its own look,
table columns and header rows): "Please work on this". No database change (shortcuts ride in the same
`user_arrangements` copy, 0206).

- **Side menu ↔ page (`Bridge` in `arrange-dom.ts`, made in `ArrangeMode.tsx`):** a thing carried over
  the other one (the menu beside the page, never on a phone, where the menu is a sheet) leaves a likeness
  under the hand (`likeness`: a fixed copy, `inert`, no ids) while the thing itself waits faded
  (`.arr-lent`) in its place. Dropped there: a menu entry becomes a shortcut on that page (`PageShortcuts`,
  a row of chips above the content, `data-page-pins`); a link from a page (its one link on this site;
  with none, the page itself, named by its title) becomes a menu entry (`MenuPins`, after the menu's own
  entries) at the height it was dropped (`Arranger.placeNext`). The thing stays where it was (a shortcut
  is made of it); a shortcut carried across moves; one carried back to the menu entry it came from just
  goes. Each has a × (`Remove the shortcut …`). Kept in `Doc.pins` under `MENU_PINS` (one list for every
  app's menu) and `pagePins(path)`, joined between devices like pages (`mergeDocs`, by `at`), cleaned by
  `cleanPin` (a path of this site only: never another site, `//`, a script or quotes; 12 a list).
- **Inside a card with a look of its own (`slot`, `seat`, `unslot`, `hosts`, `hostAt`):** carried over a
  card (a fill, an edge or a shadow: `looks`; at least 2.5 times the thing's size) and held still for
  420 ms (`DWELL`), the card makes room at its foot (its padding grows) and the thing turns slightly
  smaller; dropped, it is drawn there. It stays where React put it: `position: absolute`, kept on the
  card by CSS anchor positioning (`anchor-name` on the card, `position-anchor` and `anchor()` on the
  thing; where that can't anchor, placed by hand and placed again on resize, inner scrolling and
  animation ends). Kept as `Entry.inside` (the thing's name → the card's name, unique on the page) on the
  thing's own group; carried out again, it is the group's again. Things inside a card don't resize.
- **Tables (`tablePart`, `mirror`):** a table's header, rows and footer are a group (the table's grid,
  each part named "Header: …", "Rows: …", "Footer: …" by the table's headings); the rows of each; and,
  when the table has one header row, the same number of cells in every row and none spanning two
  (`columnsOk`), its columns, by the header row: carried by a heading, or sideways (more across than
  down) from any cell, a column moves with every cell under it (the whole column follows the hand; the
  others glide; widths go with their columns, `--arr-cols` from `data-arr-w`). The header carried up or
  down moves as a whole (under the rows, say). Rows and the header move only up and down, columns only
  sideways. Column headings drag at once (`th` is a title).
- **Two fixes found on the way:** the parts inside a button or a link (its icon, its words) are never a
  group of their own (pressing a link near its icon's edge resized the icon); a press on a button or
  link always takes it, never the card around it. "Hold a moment first" now applies only when the mouse
  is on words (`onWords`, from the caret under it), not anywhere in a box that has some.
- **Rules for code that builds on it:** a page's shortcut chips and the menu's are drawn by React from
  `useArrange((s) => s.pins)`; don't add shortcut lists outside `Doc.pins`. A card that should never take
  things in: `data-no-arrange` (or no fill, edge or shadow). Anchor names `--arr-h<n>` are the engine's.
- **Left out on purpose:** a thing carried from the page into a box with no look of its own still joins
  that box's row (M166) rather than "inside"; columns of tables with merged cells or several header rows;
  shortcuts dragged on a phone (the menu is a sheet there; × and the Settings reset work everywhere).
- **Tested:** `pnpm check` (`arrange.test.ts`: shortcuts cleaned and joined, "inside" kept);
  `arrange-cross-ui.mjs` (menu → page and page → menu at the drop height, nothing opened, kept after a
  reload, taken back, ×; a button held over the Quick notes card goes inside, the card keeps its look,
  the button still works, kept after a reload, out again with the room closed; Grades: a column by its
  heading (0 slow frames in 115) and sideways from a cell, cells under their headings, the header under
  the rows, kept, put back with no traces; axe on each; a phone with shortcuts); `arrange-ui.mjs` and
  `arrange-more-ui.mjs` still pass.

## M168: smooth resizing, and the arranging upgraded (13 Nov 2026)

The owner (13 Nov, after M160–M167 went live): "the resizing is not smooth and animated properly… see
what else you can improve in the arrangement features and upgrade everything in it", then "make sure
everything is ultra smooth".

- **Why it wasn't smooth:** a pulled edge moved in steps (widths by 5% of the row or whole grid columns,
  heights by 8 px), neighbours jumped, nothing eased on letting go; and while pressed, a card's own press
  effect (it sinks a little) shrank it under the hand.
- **Resizing now (`resize`, `ease` in `arrange-dom.ts`):** the card follows the hand to the pixel (inline
  px width and height; in a grid it takes the columns it is nearer to as it goes, drawn above its
  neighbour meanwhile, `justify-self: start`); a neighbour pushed elsewhere (a row wrapping, a column
  freed) glides there, from where it was drawn (read before each frame's write; layout positions by
  `offsetLeft/Top`, so a running glide isn't mistaken for a move); let go, it eases (`ease`: width and
  height animated, only what changed, `SPRING_GLIDE`, 240 ms) to the size kept: a share of its row in 1%
  steps (was 5%), its columns, its height to the px. The resize cursor stays on everywhere while
  pulling (`html[data-arr-resize]`), the card sits above its neighbours and its press effect is off
  (`.arr-size`). Edges are 18 px wide for a finger (8 px for a mouse).
- **Eased too:** a double-click on an edge (no page re-read now, `flip`), keyboard resizing, "Put this
  page back", undo and the new **redo** (Ctrl/⌘+Shift+Z or Ctrl+Y; `redoStack`, cleared by a new
  change): things glide to their places (`redraw` → `flip`: FLIP of the arranged things on or near the
  screen, 120 at most).
- **Carrying:** a card leans up to 2.5° the way it moves and settles level when the hand stops (frames
  keep coming until it does: `if (tilt) again()`).
- **Quick notes' dividers (`Splitter`):** the pane is sized directly while dragged (once a frame) and the
  size is kept once, on letting go; before, every frame re-drew the whole tool and wrote to the device.
- **Names that hold while a page loads (`steady`):** things are known by their words without numbers,
  percentages and placeholder dashes ("100%", "—"); and while part of what is kept hasn't found its place
  (`unmatched`), words changing also make the engine look again, twice a second at most (a page may draw
  its cards before their numbers arrive; only added or removed elements counted before). Saved names with
  "%", "—", "–", "·" or "…" written before this are not found again (live since this morning only).
- **Every page:** the light under the mouse on cards (`.sheen`) had its position passed down to every
  element inside the card, re-styling all of them on each frame; `@property --mx/--my { inherits: false }`
  keeps it to the card. Moving the mouse over the student home's cards: style work 321 / 208 ms → 76 /
  111 ms, slow frames 34 / 10 → 8 / 2 (two runs each, the test browser).
- **Reduce Motion** (the app's setting or the device's, `calm`): glides and eases are instant, no lean.
- **Trap for checks:** the test browser has no graphics chip; the student home drops frames by itself when
  the mouse just moves over it, so compare against that (resizing a tile there cost the same as moving
  the mouse: 12–23 slow frames in about 44 either way); the Quick notes card resizes with 1 slow frame in
  about 105.
- **Tested:** `pnpm check`; `arrange-resize-ui.mjs` (a tile and a card follow the hand to the pixel
  mid-pull, the neighbour glides, the size eases in, the height to the px, a double-click eases back,
  undo and redo glide, the divider's pane follows); `arrange-ui`, `arrange-more-ui`, `arrange-cross-ui`.

## M169: CPU and requests for 500 people (13 Nov 2026)

The owner (13 Nov, with the Cloudflare usage card: 11.77k requests, 1.4M CPU ms, 28 Oct–13 Nov): "can
you reduce cpu time and request… more than 500 people are going to use this for a month… even 500 people
use it simultaneously".

- **What the numbers say:** about 120 ms of CPU per request (a lean request takes 5–20 ms): the cost is
  starting code on a fresh copy of the Worker (a few visitors land on fresh copies most of the time;
  each merge also makes every page's cached copy new). Most of the big savings were already in: pages
  from Cloudflare's cache (M120), API routes without Next.js (`api-direct.ts`), the busiest calls in
  plain SQL (`fast-api.ts`), usage tracking batched (one request per 5 minutes at most), speed reports
  from 1 load in 10, the 15-minute timer checking cheaply before starting anything (`due-check.ts`).
  The live per-route numbers (`api_timings`) couldn't be read: the Cloudflare tools answered "Service
  Unavailable" all session. Read them first next time (route, requests, average ms over 7 days).
- **Requests a person's browser makes:** recorded over 5 page views and a minute idle (`scripts`-free:
  a Playwright run): one-off requests per page, nothing repeating while the live connection is up (the
  incoming-call check every 15 s seen locally is the fallback for when it is down: the dev server has
  no live connection).
- **Changed:** the screens that still refreshed on a timer whatever the person was doing now pause
  while the tab isn't being used (`useActivePoll`): Relief's map (every 20 s), parents' and teachers'
  meetings and the staff register (every minute), office hours, the admissions status page, the admin
  analytics stream (every 5 s).
- **Already right for 500 at once:** 300 API calls a minute per person, 6,000 a minute per address (a
  school's shared Wi-Fi), live updates per person in their own Durable Object (asleep between events).
- **[owner] The spending guard:** it pauses the whole site at 90% of the included CPU (27M ms). At 500
  people that can come in the first week of a month, while going past costs about $0.02 a million ms
  (likely $1–3 a month). Turning pausing off is the secret `CF_GUARD_OFF` (any value; the 70% and 90%
  emails still come), or a later item can move the pause to a runaway-only ceiling. The owner decides.


## M170: Sample data for all five apps (13 Nov 2026)

The owner (13 Nov): "can you also add a lot of sample data in owner console for all the five apps so that
i can try and test all features and see it". The console's **Fill with sample data** (Overview) now has
22 steps instead of 14 (`src/server/sample-world.ts`), about 26,000 more rows:

- **UniVersity:** Sample Academy (an `organizations` row owned by the first sample admin; every sample
  person joins it), 12 published courses (codes `SA-CS101`…: course codes are unique across the site, so
  the sample's never meet a real school's), two timetable slots each, every sample student in 5 courses,
  5 assignments a course (3 past, 2 coming, a rubric), 3 quizzes with 5 questions each, ~85% of past work
  handed in with scores, feedback and grades (each student keeps a level, so report cards differ), quiz
  answers, two weeks of attendance on each course's days (midnight UTC), course and school-wide news.
- **Relief:** 10 organisations (shelters with beds, water, food, power, food banks, a clinic…), owners,
  coordinators and volunteers, 6 supplies each (some low), 4 shifts each with sign-ups, two emergencies
  going on now with "I'm safe" check-ins, 40 aid boxes with their trip so far, 90 helpers with skills
  and alerts.
- **Trace:** owners with resale counts, 260 repairs (by the brand or the owner), take-back on every
  sample product with 140 requests (most received), 150 fake-label reports.
- **Play:** 3,200 scores across the 13 games (a quarter from rooms).
- **The owner is let in** (`sampleSteps(me)`, the route passes the signed-in owner): a sample brand's
  owner only when they have no brand (one brand per account), coordinator of Riverside Relief Network and
  a volunteer at Harbour Night Shelter, a member of the first Green team with 24 days of actions (a
  streak, badges), 3 scores per game; as a student, enrolled in 5 sample courses; as a teacher, teaching
  the last two. All of it goes with **Remove**: ids `smp…`; courses and announcements are deleted
  before the people who teach and wrote them (those keys refuse otherwise); enrolments, work, grades,
  attendance, quizzes and the owner's memberships go with their course, organisation, brand or team.
- **Tested** against the local database with a throwaway harness (node's built-in SQLite, foreign keys
  on, plain `INSERT` so nothing was skipped silently): every step in under 0.1 s, no duplicates, and after
  Remove no `smp…` row left in any table. Pages checked as the demo student: courses, grades, Relief
  organisations and shifts, Play leaderboards, Green.
- **For code that builds on it:** a new sample table needs its ids starting `smp` and its table in
  `clearSample`'s list (before `users` if it points at a person with RESTRICT); a step stays a few big
  `INSERT`s (one request each, under D1's 50 queries).

## M171: The constellation replaced by rows that show the numbers (13 Nov 2026)

The owner (13 Nov): "remove the constellation animation from where is it not important at all and please
add something else animations which are functional and unique and it shows the details".

- **Tracks** (`src/components/live/Tracks.tsx`, CSS block M171 in `globals.css`) in place of the
  constellation everywhere it was. A first version drew a row of small marks; the owner, seeing it: "i
  dont like th design here make the ui and design smooth". Now each row is its name (a code in a small
  mono chip beside it), its number on the right, an amber note for work due, a **smooth bar** that glides
  out from the start (its parts side by side in soft gradients, a light on the end; rows 60 ms apart)
  and a line of detail. The next thing due is a breathing dot at the end of its bar (rests while the
  page scrolls; Reduce Motion: a fade). A row with a link opens it. `max` says what a full bar means.
  - Student home "Your courses": the bar is the course average (of 100), "1 due", the next piece due
    and when, attendance, recent marks. Teacher home: students per class, handed in and still working.
    Admin "School by department": students and teachers, students a teacher. Green "Your climate
    actions": CO₂ saved per kind, how often, its share. Console "Everyone": accounts by role. Trace
    wallet: points per brand, towards a cash-out and past it, what they're worth.
  - Trap: `TONES` are comma lists ("79,142,247"), so colours are `rgba(var(--c), a)`, never
    `rgb(var(--c) / a)` (invalid: the bars came out invisible).
  - `Constellation.tsx` is deleted; the homes' layout titles changed (the card id `orbit` stays, so
    people's saved layouts keep working).
- **Course cards** (`student/courses`): the grade and attendance bars are soft gradients ending in
  their colour, a little taller.
- **UniVersity's scene behind the page** (`backdrop.ts`, `campus`): the stars joined into constellations
  are gone; thin maths signs (π, ∑, √x, x², dy/dx…) drift up faintly in a serif italic, like chalk half
  wiped away, with the sheets of paper as before. Fewer things drawn than the stars and their lines.

## M174: Studio's focus mode covers the whole window (13 Nov 2026)

The owner (13 Nov, a picture of Quick notes in focus mode on the live site, the menu and the top bar's
bell still showing, the tool narrower than the window): "the focus mode is not working properly…
it should cover the whole window size like a individual app works".

- **Cause:** arranging a page (M165) can leave a `max-width` on a group's parent (`arrange-dom.ts`,
  `entry.maxW`); on Studio that parent is the tool's box, so in focus mode the `fixed inset-0` box kept
  the width and sat centred (`mx-auto`) with the menu beside it. Locally (no arrangement) it looked fine.
- **Fix:** the focus box carries `.studio-focus` (globals.css block M174), which drops any inline size,
  max-width and margin, and arrives with a fade and a slight settle. While focused, `html[data-focus]`
  (set by the Studio page, removed on leaving or unmounting) hides the side menu, the top bar
  (`.app-topbar`) and the assistant (`.ai-fab`), stops the page behind from scrolling, and clears any
  transform, filter or containment on the page's wrappers so nothing can trap the fixed box.
- **Checked** with a made-up arrangement (a 1,100 px max-width on the box): the box is the full
  1,440 × 900 window, menu, top bar and assistant hidden; Esc brings them back.
- **For code that builds on it:** another full-window mode can reuse `html[data-focus]`.

## M175: The side menu floats with rounded corners on every side (13 Nov 2026)

The owner (13 Nov, a picture of the folded menu): "make the side bar like the oval corner from all the
sides like i should able to see the border from the left side".

- On computers the menu sits 10 px from the window's top, bottom and start edges, rounded on every
  corner (a squircle where the browser has `corner-shape`), its hairline on every side and a soft
  shadow, open or folded, light or dark (globals.css block M175, `:root:root .side-shell.glass-sidebar`
  to outrank the older menu rules). The page keeps the same gap: `--side-gap` (10 px on computers, 0 on
  phones) is added wherever `--side-w` offsets something (DashboardShell, AppSkeleton, the folded
  menu's tooltips). Phones keep the slide-in sheet.
- **For code that builds on it:** anything placed beside the menu uses `calc(var(--side-w) +
  var(--side-gap))`.
