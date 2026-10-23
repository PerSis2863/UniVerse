# Stage 5 handoff (for the next agent)

Read this first, then `STAGE-5-PLAN.md`: the plan has every item, and its **Progress** table says what's
done, where the code is and what's left for each item. Keep that table up to date as you go.

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

