# UniVerse: the guide for every AI agent

**Read this whole file before you work.** It is the only file you must read: who the owner is, what
the project is, the rules, how to work and test, where things stand, and the tools. Claude Code,
Cursor, Codex and other agents all start here (`CLAUDE.md` and `.cursor/rules/universe.mdc` only
point to it). Two more files hold the history; open them only when a task needs them, and read only
the part you need:

- `apps/web/STAGE-5-HANDOFF.md`: a note per finished piece of work (traps, rules for code that
  builds on it). The newest notes are at the end (M329 is the latest).
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
  or phone numbers (`src/lib/route-gates.test.ts` fails a new route that neither signs people in nor is
  listed as open with its reason, M114).
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
  public brand pages `/b/<slug>`, cold chain with real sensors, EU Digital Product Passports (GS1 links,
  suppliers fill in their materials).
- **Relief** (`/relief`): needs and offers of help on a live map, with notifications and nearby
  alerts for helpers, and organisations (`/relief/orgs`: NGOs with members, supplies and volunteer shifts).
- **Green** (`/green`): climate actions with the CO₂ they save, streaks, badges, a weekly challenge,
  teams and a map; **Business** (`/green?view=business`, M269–M275): a company's carbon footprint by the GHG
  Protocol's scopes 1–3 (a ledger with sourced factors, spreadsheet import, bills read by AI), suppliers and staff
  answering by link, Trace passports' carbon per unit, a reduction planner, a BRSR / CSRD-style draft report, a
  hash-chained log with an auditor's link (`/carbon/[code]`), and consultancies managing client companies.
- **Travel** (`/travel`, M183): find any place; its guide (what to see, do, eat, drink, where to sleep,
  getting around, staying safe and polite) from Wikivoyage, the country's facts and emergency numbers, the
  week's weather; saved places; stays, flights, tours and trains booked with partners; **Find where to go**
  (days, budget, month, interests and passport rank 145 places, M205); **trips** planned alone or with
  friends (cities, days, drag and drop, the whole budget, getting between and there, stays, M206–M207); an
  opt-in **travellers board** for adults in the same city on the same dates (M207); a **map** (OpenFreeMap in
  3D, real places from OpenStreetMap, open or closed in their own time, sunlight by the hour, photos and
  stories nearby, Walk from here) with UniVerse's own reviews, locals apart from visitors (M209).
- **Games** (`/play`, UniVersity's Games section since M224; it was the Play app): thirteen games (quick: Quiz Clash, Spot the Fake, Supply Run, Recycle Rush; big:
  Type Race, World Pin, Flood Rescue, Ocean Cleanup, Fire Line) and four 3D worlds (three.js: Skyline
  Obby, Night Shift 18+, Solar Voyager, Reef Rescue), all drawn realistically since M102–M105 (every
  game but Quiz Clash's questions and Spot the Fake's cards is a 3D scene), plus **STORMFALL** 16+ on computers (a Unity battle royale: source `games/stormfall/`, page `/play/stormfall`, its web build fetched at build time by `scripts/fetch-stormfall.mjs`); rated games check
  the birth date or ask), solo or up to 8 friends in a room with a code (the `GameRoom` Durable
  Object), leaderboards.

Shared by all apps: the hub `/hub`, Messages, Collaborate (the owner likes it: keep it), Settings,
and the owner console `/console`. Each app has its own menu (`Sidebar.tsx` `navFor`, the app
switcher under the brand; on a computer's browser it's the bar across the top, `TopNav.tsx`, M219), phone tabs (`app-tabs.ts`), landing tab and sign-in / sign-up tab
(`?app=`, remembered in sessionStorage `uv-app`, `useChosenApp`). `homeFor(user, app)` sends a
person to their chosen app, otherwise to `/hub` (the owner: `/console`).

**A new app needs:** an `APPS` entry, its nav and tabs, a landing tab section, a card on `/hub`
(`GET /hub`, `src/server/hub.ts`), sample answers (`src/lib/sample/impact.ts`) and its scene behind
the page (`src/lib/backdrop.ts`).

## 4. Where things stand (5 November 2026)

This is only the map: each item has a note in `apps/web/STAGE-5-HANDOFF.md` (traps, rules for code
that builds on it) and a Progress row in `apps/web/STAGE-5-PLAN.md`.

- **Launch focus until 5 December 2026** (the council, 5 Nov; the owner: "do whatever the council
  said"). The live site had 8 real accounts, 2 using it in a week and no new sign-up in 30 days, while
  about 80 items had shipped since the goal below was set (26 Oct). So until then: **no new apps,
  games, looks or graphics.** Work on fixes for what real people hit (the live `error_reports`, the
  owner's messages), safety and library updates, and what the first real class needs. The goal:
  **10 real people who come back on another day** (Console → Overview → Real people). If the owner
  asks for something new, say once that it's paused and why, then do what they decide. On 5 December,
  go through each app's numbers with the owner: keep it, mark it Lab, or remove it.
- **The owner's list of 15 Nov** ("do all of them except 5th one"; then 16 Nov: "do all this and merge
  it"): done: M196 (a teacher's first class), M197 (come-back reminders, 0216), M198 (the new-student
  walk-through), M199 (Admin → Safety → Who can see what, and the leak check `school-leaks.mjs` with five
  leaks fixed), M181 (arranging keeps things in their group, every edge resizes, Tidy), M182 (Messages
  connections: Gmail, Outlook, Slack, 0217), M200 (Google Classroom import, Google / Outlook calendars in
  the calendar), M201 (Trace payments, 0218). Connections and payments are **off until the owner sets
  them up** (see [owner] below). Left from the list: store apps (9) and the 3D backgrounds and new games
  (11); 5 (cheap phones) was left out by the owner.
- **On `main`** (live): everything through **M289**, plus **M337–M345** (merged 19 Nov, PR #141: policies and security, Messages and Meet & call upgrades), **M346** (merged 20 Nov, PR #142: dark maps, a smoother landing), **M347–M349** (merged 20 Nov, PR #143: places open on our own map, hotel search, Travel's map in Apple Maps' layout), **M350–M355** (merged 20 Nov, PR #144: every map in Apple's look, smooth openings everywhere, rounder corners, a faster map, the phone's map first), **M356–M361** (merged 20 Nov, PR #145 and #146: ways to get there, Green's home), **M362–M373** (merged 21 Nov, PR #147: ways to get there in Relief and Green, prices and discounts, Spotlight search and menus, sections in the top bar, a plainer Relief) (M286–M289 merged 18 Nov, PR #138; M269–M285, PR #137; M268 merged 18 Nov, PR #136; M267, PR #135; M234–M266 merged 17 Nov, PR #134; M222–M233 below; M214–M221 merged 16 Nov, PR #129; M205–M213 merged 16 Nov, PR #128; M202–M204, PR #126; M179–M180 and M183–M195 merged 15 Nov, PR #125; M173 and M177–M178, PR #124; M168–M176 merged 13 Nov, PR #123; M160–M167 merged 13 Nov, PR #122: page fixes, the landing globe, arranging any page; M129–M130 merged 9 Nov, PR #117; M131–M133, PR #118;
  M134–M143, PR #119; M144–M157 merged 10 Nov, PR #120; M158–M159 merged 12 Nov:
  admin actions and campus info kept to the admin's own school, stray posts to pages refused, every
  transition named, the build libraries' advisories 6 → 1).
  - **Look and motion:** the Ballast look in light mode and the Relay look in dark mode, the river
    remade (M124, §8; the owner's exception to the pause, 8 Nov), then redrawn on the graphics chip to
    match the recording (M125, PR #114; M125b–d, PR #115, merged 8 Nov), then its detail, shape and
    sharpness fitted pixel by pixel to the recording and the template's own preview (M126–M128); before it
    the CreditKarma look (M91–M94); smooth scrolling, maps and loading
    (M86, M89, M96–M98); the pink river and the planet drawn on a background thread (M84, M85); glides,
    sheets and motion that answers the pointer (M29, M41, M45, M63).
  - **The app scenes and the motion pass (9 Nov, the owner's exception to the pause):** each app's own
    scene behind the page in place of the river (M129, §8); the landing's app switch without a long
    frame, loaded content and new list rows gliding in (M130).
  - **Also 9 Nov (PR #118):** the landing's globe you can use (M131: drag, zoom, click an app for its
    card); each app its own colour everywhere (M132, §8); realistic movement (M133: springs, depth on
    page changes, the globe's momentum) and the landing's scroll effects tied to the scroll.
  - **The Ballast reels inside the app (9 Nov, PR #119):** M134, the first pass of the
    Ballast reels' shapes inside the app (compact side menu, top bar, plain number tiles, 12 px cards);
    M135, every app page in that style through shared rules (compact sizes on computers, flat icon
    squares and one-colour progress bars, the reels' button and badge sizes); M136, phones at full frame
    rate and sharpness (the live pictures, the planet and the app scenes); M137, a sweep: page counts in
    PostHog after "Accept all" (off until the owner sets the key), the landing's other apps built ahead
    once the tabs are approached, failed background threads handled quietly; M138, card titles and
    tables in the reels' style on every page (shared rules); M139, the cards' "···" menu (full screen,
    copy, CSV) on the main pages and every chart board (`CardHead` / `CardMenu`); M140, the reels'
    calendar: a Timeline view (days down, hours across, a Now line) and a date range picker; M141, the
    activity log as the reels' Agent Activity (heatmap, totals, tabs with counts, outcome labels); M142,
    "New …" windows with "Start from" cards (New course, New event; `TemplateCards`); M143, a teacher's
    courses as the reels' Agent Center (summary cards, a card per course with a 14-day chart).
  - **Eight new Trace and Relief features (10 Nov, the owner's exception to the pause, M144–M151; PR #120):** M144, Trace's footprint story on every
    passport (making plus trip, a car-distance equivalent, against others of its kind); M145, repair and
    resale history on the passport (the brand's and the owner's repairs, the number of owners); M146,
    take-back for recycling (drop-off code, the brand receives it: points plus a Green action); M147,
    reports of fake labels (where copies are sold, on the brand's Radar); M148, Relief's shelter and
    supply board ("Places to go": live beds, water, food, charging from organisations); M149, skills
    matching (helpers' skills with their alerts; a need asking for one alerts them first); M150, the
    "I'm safe" check-in (coordinators declare an emergency; people tell only those they talk with);
    M151, traceable aid (a code and QR label per aid box; donors follow its trip on `/aid/<code>`).
  - **Their upgrades and a sweep (10 Nov, the owner: "please do this… upgrade all the existing features…"; PR #120):**
    M152, emails for the new alerts (emergencies may use the essential allowance; nearby needs only for
    helpers who tick "Also email me"); M153, emergency texts (SMS) to helpers who add their number,
    behind the owner's "Relief emergency texts" switch (off; Twilio); M154, aid boxes on a map (rounded to
    about 500 m) and helpers' first names by their choice (receivers never shown); M155, live updates
    (the safety banner, aid pages and lists), coordinators' safe count, share and directions, brands told
    of fake-label reports; M156, their motion (FLIP for filters, arrivals on the spring, an attention
    ring that rests while scrolling); M157, a sweep for problems (the live error log, a 199-page crawl of the
    built site for three roles, 15 checks): emergencies shown only to the people they concern, a phone
    number no longer wiped, the map thread's handled failure no longer reported, a faint label fixed.
  - **Merged 13 Nov (PR #122; the owner's fixes of 10–13 Nov, numbered
    after PR #121's M158–M159):** M163, the
    sign-in page lined up (the picture shrinks with `zoom`, not pinned to a corner; cards one width; the
    footer's notes level on both sides); M160, no "where am I" row above page titles (the owner: not useful);
    M161, fields that line up (a field written under its label sits under it; date and time fields never
    narrower than "09:00 AM"); M162, arrow buttons answer a press everywhere (the arrow darts its way, the
    button sinks) and what they change slides in (`.swap` with `data-dir`); M164, the landing's globe smaller,
    beside the five apps as a list that steers it (real daily totals, a way in), and the pointer light
    moved by `transform` (dragging the globe went from 9 slow frames in 40 to none). M165 (12 Nov, the owner's exception to the pause),
    arrange any page with the mouse alone (no mode, nothing drawn): drag a card, button or pane to another
    place, pull a card's edge to resize it; kept per person per page on the device, "Put this page back" in
    the top bar; dividers to drag between Quick notes' panes. M166 (12 Nov): the side menu, table rows and
    lined lists move too, a card can leave its row for another group, and Settings → Appearance → "Use my
    arrangement on my other devices" (off by default) keeps it in the account (`user_arrangements`, 0206).
    M167 (13 Nov): a menu entry dragged onto a page becomes a shortcut there and a link dragged onto the
    menu an entry; a thing held over a card goes inside it; table columns and the header row move.
  - **Merged 13 Nov (PR #123):** M168 (13 Nov), smooth resizing (to
    the pixel, neighbours glide, sizes ease in), put back / undo / redo gliding, carried cards lean, the
    card light under the mouse restyling one card instead of everything in it. M169: timed refreshes pause
    while a tab is idle (Relief map, meetings, staff register, office hours, admissions, analytics). M170: the console's
    sample data covers all five apps (a school, Relief organisations, Trace's repairs and reports, Play
    scores) and lets the owner in to try them. M171: the constellation replaced by smooth bars that show the
    real numbers (homes, Green, console, Trace wallet); UniVersity's background drifts study signs. M174: Studio's focus mode is the whole window (an arranged
    page no longer narrows it). M175: the side menu floats, rounded on every side (`--side-gap`). M176: focus mode
    grows out of the tool's box and shrinks back into it. M172: every map names ~24,000 more places as you zoom
    (GeoNames, credited) with 1:10m coastlines close in; Relief's map groups piled-up requests, cards, shelters.
  - **Landing:** the "Here to…" first-visit row (M81), try-it demos (M43), live totals (M44), link
    previews (M42).
  - **UniVersity:** the Stage 5 queue (Q1–Q23 in the plan: courses, grading, quizzes, attendance,
    calendar, tutor, search…), simpler menus (M27), offline (M46), Create work on a course (M80), Quick
    notes (M90).
  - **Trace:** signed codes and passports, maps and the Live globe (M50, M51, M59, M65–M67), live air
    traffic (M69, off until the owner turns it on), the EU Digital Product Passport (M108).
  - **Relief:** the live help map and alerts (M22), organisations (M106), text requests (M107, off until
    the owner's switch). **Green:** proof for actions (M25), the Green Pass (M60).
  - **Play:** 13 games and 4 3D worlds with rooms, chat and voice (M31–M39, M99–M105), STORMFALL (M82,
    M101).
  - **Shared:** the hub and the Impact Wallet (M24), Collaborate (M68, M71–M76), the owner console (M64,
    M79, M92).
  - **Platform:** the security review and its fixes (M62, M78, M87), Next.js 16.4.5 with the Cloudflare
    adapter 1.20.16, always moved together (M77; M261 on the branch), Prisma's query compiler shared (M88), "too many SQL
    variables" fixed for every list (M73), 500 people a month on the $5 plan (M28), checks on every push
    (M87).
  - **The launch focus (M110–M116):** a size alarm before every deploy and Relief's emergency line (M110),
    this guide's focus rule (M111), UniVersity first with the other apps marked Lab (M112; the tags were removed in M210), a course's
    "Invite students" link (M113), a test that every API route checks who is asking (M114), body-parser
    2.4.0 (M115), the first impression: the student home pictured under the landing's headline, a bigger
    hero, sign-in fixed on phones, no glass (M116, the owner's one exception to the pause).
  - **After the launch work (M117–M123, 6 Nov):** a smoother first visit (M117); the games without lag
    (M118: a Graphics choice in each 3D game's bar, 60-a-second pacing, memory given back); Play's page
    without the constellation and the player card (M119); CPU: in-app page changes answered from
    Cloudflare's cache (M120); Messages, professional (M121); every game almost full screen (M122,
    `--play-h`); Solar Voyager in place of Orbit Breach (M123).
- **Merged 17–18 Nov (PR #134; M267, PR #135; from `claude/travel-ten-features`, made from `claude/great-hamilton-8g8xdm`):** the
  owner's Travel features of 17 Nov, as parts of a trip's page: M239 (Today: the next place, when to leave, the walk there), M240 (Ready → Save for offline: plan, guides, map tiles), M241 (Phrases: 19 languages, read aloud), M242 (Journal: notes and photos per day, the story with the route; 0228), M243 (Votes: group polls, live; 0229), M244 (Ready → jet lag and the group's clocks; 0230), M245 (Ready → documents, only their owner's, with reminders; 0231), M246 (Ready → holidays and festivals on your dates), M247 (Ready → footprint; the train logs a Green action; 0232), M248 (Share: the family link `/journey/<code>` and "I'm safe"; 0233); then the owner's ten more: M249 (Today → rain plan), M250 (Today → sunrise, sunset, golden hours), M251 (Today → opening-hours check), M252 (Today → arrival guide), M253 (Ready → safety card), M254 (Checklist → before-you-go to-dos; 0234), M255 (the morning briefing, daily job `travel-briefing`), M256 (Copy trip), M257 (Trips → your travel in numbers), M258 (Trip chat in Messages; 0235); then M259 (the map: every town of 15,000+ people and 375 hand-picked places with photo pins, a trip drawn by day, saved hearts, Search this area, smoother; `map-world.ts`, `public/geo/destinations.json`); then M260 (live turn-by-turn navigation: Directions → Start, the camera following you smoothly, spoken turns, a new route when you leave it, arrival; stops, leave at / arrive by, avoid, +N min bubbles, Home / Work / recent; `Navigate.tsx`, `src/lib/navigation.ts`); then M261 (security updates: Next.js 16.4.5 with the adapter 1.20.16, Vitest 4.1.12, Zod and Tinypool pinned: no known advisories); then M262 (the owner's map recording, part 1: the shared kit `src/components/map-ui/` and Relief's live map in that look: Needs you queue, chips, pinned card, number cards, I can help as a plan with Undo); M263, Trace's tracking map in that look; M264, Travel's trip on the map in that look; M265, a trip's ways along the real roads and a day's walk along the streets; M266, the look on Travel's other map views, a phone sweep of every page with `crawl.mjs --layout` and its fixes, smoother map markers). The 160 new places' photos and weather still wait for a machine that reaches Wikimedia.
- **Merged 17 Nov (PR #134, from `claude/great-hamilton-8g8xdm`):** M238 (17 Nov), every trip has a picture (`tripCover`). M237 (17 Nov), Google Maps' tools on Travel's map
  (directions by walking, cycling or driving; what's here with share; measure; `MapTools.tsx`, `src/lib/map-tools.ts`) and
  the maps' labels in Inter (`scripts/map-glyphs.py`, `public/fonts/map`, `mapRequest`). M236 (17 Nov), the maps in Apple Maps' look (its colours, every place a
  coloured icon), an Apple-style panel (a bottom sheet on phones), Travel's map edge to edge with full screen, small credits,
  Green's and Relief's maps taller with floating lists, the place list filled on first load. M235 (17 Nov), a browser in full screen keeps the top
  bar, Settings → Appearance → "Menu on a computer" (Automatic, Across the top, Down the side; `uv-menu`, `html[data-menu]`),
  the console and 17 dashboard and list pages fill a wide screen (`max-w-[2000px]`). M234 (17 Nov), calls: a phone's tall
  picture shown whole (`videoFit`), two people on a phone FaceTime-style, Standard sound by default, the screen kept awake
  (`useWakeLock`).
- **Merged 16–17 Nov (PR #130 M222–M227, PR #131 M228–M231, PR #132 M232–M233):** M233 (16 Nov), Travel's map in Apple Maps' look (its own map design,
  light and dark, also on Green's and Relief's street maps; the world maps in the same colours; flat by default)
  and walks along real streets (FOSSGIS walking router, one blue line, a time bubble, Share, Directions in
  Google Maps). M232 (16 Nov), Travel's pictures sharp: a real photo per place (Wikidata's main image, checked by eye; `photo` in `travel-ideas.ts` rows overrides) in place of the 7:1 banners, in Wikimedia's widths (`Cover`, `commonsSrcSet`), the map card's pictures too; 70 more places (215), each with its weather. M231 (16 Nov), a sweep for errors and smoothness (progress bars `<Fill>`, loops in CSS, one press per button, the motion layer's forced layouts gone, no glass behind sheets; the rules in §8 and `motion-rules.test.ts`; Next 16.4.5 from 30 Nov). M230 (16 Nov), projects in Tasks: the Timeline a Gantt chart (start days, milestones, lines to waiting cards, drag to move) and time logged on cards (`TimeLog`, 0227). M229 (16 Nov), voice typing (`DictateButton`, `src/lib/dictation.ts`) in chats, documents and Quick notes. M228 (16 Nov), a Grim Prompter threat model (report given to the owner privately, not committed; the PDF layout frame sandboxed). M227 (16 Nov), Calls is **Meet & call** (`MeetHome`: New meeting, Join, Schedule, voice rooms, happening now; in a call Zoom's keys and push to talk, `src/lib/meet.ts`). M226 (16 Nov), no dot plot above a Travel guide's places. M225 (16 Nov), the lag measured and cut in the browser (the scene 30 a second at 1.5x, resting after 30 s untouched with the landing's demos, `useIdle`; no `html:has`; Green's map still). M224 (16 Nov), Play folded into UniVersity as its **Games** section (no Play app any more; `/play` is UniVersity's, `knownApp` for old rows). M223 (16 Nov), no picture of the student home on the landing (`ProductWindow` removed). M222 (16 Nov), the notifications panel in Apple's style (`NotificationsPanel.tsx`: app-like
  icons, grouped by day, stacks, iOS's segmented control, swipe to read, smooth spring motion).
- **Merged 18 Nov (PR #136):** M268 (17 Nov; built as M232 on `claude/youthful-fermi-sbdtcp`), Travel's map: kinds glide in over a city, the guide's highlights and areas (`Highlights.tsx`, Regionlist districts), "Where are you staying?" with what's around it (`src/lib/travel-stay.ts`: a big city's district picks; the stays saved on trips, `GET /travel/trips/stays`).
- **Merged 18 Nov (the owner: "merge everything"):** M269–M281, **Green → Business**, a carbon-footprint platform for
  companies and consultancies (the Business tab in Green; `src/lib/carbon-ledger.ts`, `src/server/green-business*.ts`,
  `components/green/business/`, the public `/carbon/[code]`; database updates 0236–0237; plans behind the owner's "Green
  Business plans" switch, off); M282, every home's greeting row (`DashHead`) and one figure card (`KpiCard`); and from
  `claude/youthful-fermi-sbdtcp` (built as M270–M272, renumbered): M285, the map's requests snapped to a grid (`nearKey`,
  `boxKey`); M284, on a phone a map page has no top bar (`useBareChrome`, `--bare-gain`; Travel's Map, Relief's Alerts,
  Green's Places); M283, a place's facts on Travel's map and directions you can find.
- **The owner's 32 features (18 Nov: "please add all the 32 features you told me earlier"; then "if any features are
  partially build then upgrade those and also make more new features"):** the list in M290's reply, built in batches on
  `claude/youthful-fermi-sbdtcp` (not merged yet). **Batch 1, UniVersity (M291–M300):** M291 paper exams (versions A–D,
  keys, rubric marking, to the gradebook; 0238), M292 early warnings' "what usually helps" and trend (0239), M293 the term
  lesson planner (a course's Lesson plan tab, into the calendar; 0240), M294 revision packs (a course's Revision tab;
  0241), M295 bookable office hours with a waiting list (Calls; 0242), M296 portfolio work and private share links
  (0243), M297 attendance trends and parents' absence alerts (0244), M298 clash warnings, Find a free room, room bookings
  refusing overlaps, M299 announcement readers, reminders and confirmations (0245), M300 a parent's week (the parent
  app). Next: Platform (6), Trace (5), Relief (5), Green (4), Travel (2), then more of the owner's "new features".
  UniVersity's new routes live in `src/server/modules/school-plus.ts`; sample answers in `src/lib/sample/new-features.ts`.
- **The owner's tripist.app asks (18 Nov), on `claude/youthful-fermi-sbdtcp`, not merged yet:** M326 scrolling glides
  like tripist's (a wheel or trackpad eases to a stop over ~2 s, `src/lib/smooth-scroll.ts`; Settings → Appearance →
  Smooth scrolling; native on touch, lists, maps, dialogs); M327 a trip's days as tripist's itinerary (day circles, a
  timeline with photos, walks and Directions, floating ✨ / options / + buttons; `trip-days.tsx`; 0255); M329 the
  automatic itinerary (`src/lib/travel-itinerary.ts`: around the stay, one part of town a day, lunch, coffee, dinner; ✨
  on a trip, Trips → "Booked a hotel? Get your days planned", a pasted booking read by AI; `POST /travel/trips/:id/plan`,
  `POST /travel/booking/read`; 0256); M328 the landing's Earth rising out of clouds (`EarthGlobe.tsx`, three.js on a
  background thread, Natural Earth's maps via `scripts/assets/earth-pictures.py`). **Next (asked, not started):** the
  owner's dashboard picture for the pages with maps (map top right with search and sort over it, cards down the side, a
  table under it, no empty space): Trace's tracking map, Relief's live map, Green's places, Travel's map.
- **On the branch `claude/youthful-fermi-sbdtcp`, not merged yet:** M290 (18 Nov), a deep check: spreadsheet styles only real colours (`colour`, `sheet/render.ts`), canvas maps rest after 30 s untouched (`WorldCanvas`, `map-rest-ui.mjs`), Studio's badge and Trace Insights' table accessible.
- **Merged 18 Nov (PR #138, the owner: "do a lot more like this and then merge it"):** M289 (18 Nov), nothing cut off on a phone (422 grids got `grid-cols-1`, `layout-rules.test.ts`; `crawl.mjs --layout` reports cut-off text; UniVersity's course buttons, transcript, setup card). M288 (18 Nov), a trip's page and Find where to go tidier on a phone (the trip's settings only on Plan and Money or until it has a date; a stop's dates on one line; Money's prices table fitting a phone). M287 (18 Nov), Travel more professional and smoother (a guide's opening in three lines with its actions on the picture, booking in one row, sticky tabs, `Prose` with Read more, `.swap` parts; photos to the cards' edges; Travel's pages `overflow-x-clip` so `sticky` works). M286 (18 Nov; built as M269), a picture for every Travel destination (436 photos, 12 banners) and 74 more places (448).
- **Merged 16 Nov (PR #129):** M221 (16 Nov), the landing's `_retryCache` crash fixed (a Suspense boundary inside each
  hidden `Activity`), the top bar's entries dragged into order (kept with the side menu's), no name both in the bar and in
  an app's own row of tabs. M220 (16 Nov), light mode is the default (dark for those who chose it). M219 (16 Nov), on a computer in a browser the menu is a bar across the top
  (`TopNav`: groups open as lists, More for what doesn't fit; the installed app and phones keep the side menu), and M218
  (the apps' sections moved into the side menu) undone: the rows of tabs are back. M217 (16 Nov), Relief's ten new features (Most urgent, Matches, live disaster
  Alerts, Be ready: plan, go-bag, emergency numbers, weather risks, a phone card; First aid; My hours with a certificate;
  walking times to places; database update 0226). M216 (16 Nov), Green's ten new features (Footprint, Journeys, Goals and pledges,
  Tips, Events, Green places, the year heatmap, what it means, a year picture, the weekly team league; database update
  0225). M215 (16 Nov), a trip's **Money** (shared costs, settle up, spent against the
  budget, a converter, what things cost) and **Packing** (a shared list with suggestions from the trip; database update
  0224). M214 (16 Nov), Travel's map: sharp pins that never overlap, tapping one glides
  in, a Layers panel (satellite, 3D hills, transport, street photos, walking rings…), the globe, my position, a filter
  (all from free sources straight to browsers, no Worker CPU). The console's Travel reports tried in a browser.
- **Merged 16 Nov (PR #128; M173 and M177–M178 earlier, PR #124):** M213 (16 Nov), Travel's left-outs (Google Maps' exact route, a block closes the
  board's chat, Travel reports in the console's Moderation, live updates measured) and Travel's look (its own sky
  colour, a tab row like Trace's, Explore's first card). M212 (16 Nov), dark mode's accent the website's blue in place of the neon lime,
  calmer greens. M211 (16 Nov), the main pages' lag fixed (the motion layer's watcher, the
  landing's prebuilding and scroll code; `main-pages-smooth.mjs`). M210 (16 Nov), no page titles (only for screen readers) and no "Lab" tags,
  anywhere (the owner). M209 (16 Nov), Travel's **map** with real places and UniVerse's own reviews
  (database update 0223; MapLibre added, OpenFreeMap's tiles go straight to browsers, no Worker CPU). M205–M207 (16 Nov), the rest of the owner's Airbnb list for Travel: **Find where
  to go** in Explore (days, budget, month, interests and passport rank 145 places with the reasons; visas
  for your passport on the guide's Know tab), the **trip planner** (Trips and saved → Trips: cities, days,
  drag and drop, Plan my days, the whole budget, how to get between, friends with an invite link, a
  calendar file; database update 0221) and **getting there, stays and the travellers board** (database update
  0222). M178 (13 Nov), Attendance scrolls without stalls (plain cards no
  longer fade their shadow), the Planner's week keeps its height while loading, a security review (no
  critical findings; a shopper's check reads at most 200 stops). M177 (13 Nov), a deep check and smoother pages: cards no longer
  blur the moving scene behind them (homes 35 → 60 frames a second), public pages don't download
  Firebase for visitors who aren't signed in, Green's page doesn't jump. M173 (13 Nov), Trace across the supply chain: brand, warehouse,
  driver, shop and buyer each see their own view of a scanned unit (no price for drivers and
  warehouses) and record their stops with place and time; invite links for the team (migration 0207).
- **Merged 16 Nov (PR #126, from `claude/youthful-fermi-sbdtcp`; its commits say M183, M186 and M187, numbers
  other sessions had already used):** M202, **UniVerse Travel**, the sixth app (Explore, guides to
  anywhere from Wikivoyage with facts, weather and places, saved places, partner booking; database update 0219);
  M203, **Apps on the website** (owner console → Server: show any set of the six apps or only one; the Worker
  writes the list into every page's head, `src/lib/shown-apps.ts`; anything that lists apps uses `useShownApps()`;
  0220); M204, Travel's **Know before you go** and **Eat** upgrades (plugs and voltage, when to go, tipping, water,
  scams, manners, dress, visas, neighbourhoods; what to try, price and diet chips, Book a table; `src/lib/travel-tips.ts`).
- **The owner's ask of 18 Nov, first** ("upgrade everything in app and website and also add new features and upgrade the
  existing features in the system"; asked which areas and kinds: "All of them" for both; told once that the pause
  stands until 5 Dec, the owner chose to go on). Work it in rounds, one app a round, each round its own items, checked
  in a browser at 390 and 1280, light and dark, and merged only when the owner says "merge":
  1. **Live errors:** done 18 Nov: nothing open is real (24 reports are the console's sample records `smpe…`; the rest
     were fixed in M221, M231 and the Travel image fix, or are bots on old chunks). Tell the owner to mark them resolved.
  2. **Speed:** the student home on a phone (worst load task ~0.8 s at 4× CPU against ~0.5 s for the teacher's;
     `scripts/checks/main-pages-smooth.mjs --only /student --phone-only`; profile with source maps before changing).
  3. **Each app, upgrades and new features** (ask the owner for their wishes per app first, in one question with
     options): UniVersity (the first real class: courses, grading, messages), the website and sign-up (the 10
     returning people), Trace, Relief, Green (and Green → Business), Travel, Games.
- **Next up** (asked by the owner, not started; details at the end of `apps/web/STAGE-5-HANDOFF.md`): the owner's Airbnb list for Travel is done (M204–M207, 16 Nov; M181 and M182 were done the same day);
  then the owner's 9 Nov ask "make the design and ui of these video exactly the same" (the Ballast reels,
  inside the app; dark was the default then, light since M220; the scenes stay): M134–M135 and M138 done (shared rules reach every
  page, card titles and tables included); the "···" menu on the main pages (M139; other pages swap their headings for `CardHead` when touched), the calendar's Timeline and the date range picker (M140); the activity log's heatmap, tabs and outcome labels (M141); the "New …" windows with "Start from" cards (M142), a teacher's courses as the Agent Center (M143): everything in the videos is in, except the side menu's section headings (the owner chose simpler menus, M27); **realistic 3D app backgrounds** (lit 3D scenes with depth, off the
  main thread, a lighter version on weak phones; realistic movement was M133); a modern ocean game in place of Reef Rescue; Skyline Obby's surroundings after the owner's two pictures
  (floating jungle rock towers, waterfalls into mist, arches, a lagoon); an original zombie-survival shooter in the
  style of the link the owner sent (not a copy of it; brief in the handoff's M123 hand-over, item 4). (The sweep of the site for problems was M157.)
- **Work numbers:** the next item is **M391** (M390: Lab variable viewer, 22 Nov; M389: Lab code editor, 22 Nov; M388: Lab MATLAB 7.3 .mat files, 22 Nov; M387: Lab JPEG and BMP saving, old Excel files, 22 Nov; M386: Lab number types and any number of dimensions, 22 Nov; M385: Lab table rows and columns, 22 Nov; M384: Lab live controls and a smoother window, 22 Nov; M383: Lab files and tables, 22 Nov; M382: Lab 3D arrays and full-colour pictures, 22 Nov; M381: Lab more plot kinds, 22 Nov; M380: Lab lights, smooth shading, arrows, contour labels, 21 Nov; M379: Lab 3D plots and images, 21 Nov; M378: Lab signals and statistics, 21 Nov; M377: Lab complex numbers, 21 Nov; M376: UniVerse Lab part 3, the Lab app and its window, 21 Nov; M375: UniVerse Lab part 2, figures and LaTeX export, 21 Nov; M374: UniVerse Lab part 1, our own MATLAB / Octave engine, 21 Nov; M373: Relief's live map plainer, 20 Nov; M372: Spotlight's opening for every menu, 20 Nov; M371: Relief's What's needed most, 20 Nov; M370: each app's sections in the top bar, 20 Nov; M369: no summary line under the homes' greeting, 20 Nov; M368: the search window like Spotlight, 20 Nov; M367: prices in detail and ways to pay less, 20 Nov; M366: Relief's black box removed, tall cards shown sooner, 20 Nov; M365: a trip's ways priced too, 20 Nov; M364: Relief's places to go and most urgent, by every way, 20 Nov; M363: Green's places, every way there, 20 Nov; M362: Relief, the quickest way to reach a need, 20 Nov; M361: a place card's times by every way, 20 Nov; M360: Green's home as a dashboard, committed as M359, 20 Nov; M359: Trace's ways to ship, 20 Nov; M358: Green's Journeys by time too, 20 Nov; M357: every way between a trip's cities, 20 Nov; M356: public transport in Directions, 20 Nov; M355: slow openings ease in, every opener checked, 20 Nov; M354: on a phone the map comes first, 20 Nov; M353: Travel's map faster and smoother, Recents, 3D, follow me, 20 Nov; M352: rounder, iOS-smooth corners everywhere, 20 Nov; M351: whatever a press opens eases in, everywhere, 20 Nov; M350: every map in Apple's look and smooth openings, 20 Nov; M349: Travel's map in Apple Maps' layout and colours, 20 Nov; M348: hotels and addresses in the map's search, 20 Nov; M347: a place's Map button opens our own map, 20 Nov; M346: dark maps and a smoother landing, 19 Nov; M345: recurring meetings, Join muted, Chat off, 19 Nov; M344: live location, spoilers, events, QR invites, read receipts, 19 Nov; M343: Messages and Meet & call polished on phones, 19 Nov; M342: Meet & call: who joined, My room, reactions, the security code, 19 Nov; M341: encrypted photos, files and voice notes in private chats, 19 Nov; M340: Messages' quick replies, Notes to self, checklists, quiet-hours sending, quick tools, 19 Nov; M339: no assistant button over the page on phones, 19 Nov; M338: errors and bugs checked, two crawls, the parent's week fixed, 19 Nov; M337: smoothness measured on page changes, the policies brought up to every app, account erasure reaching the newer apps, a security pass, 19 Nov; M336: the map like Google and Apple Maps, 19 Nov; M335: smoother scrolling and maps, 19 Nov; M334: sign-in and sign-up in light mode, 19 Nov; M333: tripist's click burst, 19 Nov; M332: the wheel's glide on Lenis's clock, 19 Nov; M330–M331: map pages, reverted (replaced by M346/M350/M354); M326–M329: tripist's smooth scroll, a trip's itinerary look, the automatic itinerary, the landing's Earth; M301–M325: the rest of the owner's 32 features and more; M291–M300: batch 1 of the owner's 32 features; M286: Travel's pictures, built as M269 on `claude/youthful-fermi-sbdtcp`; M283–M285: Travel's map items built as M270–M272 on another branch; M282: every home's greeting row and one figure card, 18 Nov; M269–M281: Green → Business; another session's merge of 17 Nov, PR #133, also used M232–M236 for its section-tabs and deep-check items: those notes sit in the handoff beside this branch's; M208 stays kept for Travel's "extras", which nothing asked for yet: ask the owner first). Never reuse a number: take the next one after the
  newest note in the handoff file (another session may have used one on its branch; look there too).
- **[owner] (16 Nov):** connections (M182, M200): register an app with Google (Google Cloud), Microsoft
  (Azure) and Slack, set `GOOGLE_CLIENT_ID`/`_SECRET`, `MICROSOFT_CLIENT_ID`/`_SECRET`, `SLACK_CLIENT_ID`/`_SECRET`
  in Cloudflare, each with the return address `https://<the site>/api/connections/callback` (Gmail's read
  access needs Google's paid review beyond 100 test users); Trace payments (M201): set `TRACE_PRO_PRICE_CENTS`,
  send `customer.subscription.*` and `checkout.session.completed` to the Stripe webhook, turn on "Trace payments".
- **[owner]:** decide the spending guard's pause before 500 people arrive (M169: it pauses the whole site at 27M CPU ms,
  which 500 people may reach in the first week; past it costs ~$0.02 a million ms; `CF_GUARD_OFF` turns pausing off);
  to count which pages people use, set `NEXT_PUBLIC_POSTHOG_KEY` (PostHog → Project settings
  → Project API key) in Cloudflare (universe-web → Settings → build variables) and redeploy (M137); decide whether the spending guard should still pause the whole site at 90% of the
  included CPU (27 M ms; past 30 M it costs $0.02 per extra million ms, M120); to take Relief text requests, open a Twilio account (paid per message), set
  `TWILIO_AUTH_TOKEN` in Cloudflare and turn on "Relief text requests" (console → Server); for emergency
  texts to helpers (M153), also set `TWILIO_ACCOUNT_SID` and `TWILIO_FROM` (the Twilio number) and turn on
  "Relief emergency texts" (at most 100 an emergency, 300 a day); for STORMFALL's in-game graphics, rebuild it in Unity (M101 note); turn on Bot Fight Mode (Cloudflare → Security → Bots); check `STRIPE_WEBHOOK_SECRET`
  is set; keep the branch `claude/stormfall-unity` (it holds STORMFALL's files); to show live planes,
  ask the OpenSky Network first, then switch "Live air traffic" on (console → Server).
- **Next database update number: `0258`** (0209 was never used) (files in `apps/web/prisma/migrations/`).
- **The owner's seven ideas** (25 Oct: "work on all 7 of them"). Done: one Impact Wallet across all
  apps (M24), proof for Green actions (M25), organisation accounts for Relief (M106) with SMS/WhatsApp
  requests behind a switch (M107), a small "Ask UniVerse" assistant (M30), the EU Digital Product
  Passport (M108). Left, waiting on the owner: self-serve payments for Trace PRO, campaigns and schools
  (Stripe keys); store apps for Android and iPhone (store accounts).
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
`cloudflare/next-public.gen.ts` (`git checkout -- apps/web/public/sw.js` after a build). GitHub runs
the same `pnpm check` on every push (`.github/workflows/check.yml`, M87): don't merge a branch whose
"Checks" run is red. Library updates: pin overrides to releases at least two weeks old.

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
  than 30 days on the map; nearby alerts (`relief_watches`) email only helpers who ticked "Also email
  me" (M152) and never show where a watcher is.
- **Green** (`src/server/green.ts`): positions rounded to 0.1°; CO₂ factors only from `src/lib/green.ts`.
- **Play's 3D worlds** (`src/components/play/world/core.ts`): the graphics choice and frame pacing are in
  `world/gfx.ts` (M118); never change shadows or the effects chain while a world runs (every shader is
  rebuilt: a stutter), decide them when it's made; `World.dispose` frees every texture and shadow map
  and gives the WebGL context back.
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
- A grid with columns from a breakpoint up (`grid sm:grid-cols-2`) also needs `grid-cols-1`, or on a phone its one
  column grows to the longest unbroken line and cuts the card's text off (M289, `src/lib/layout-rules.test.ts`).
- React hooks lint: no reading refs while rendering, no `setState` directly in an effect body (in a
  callback or promise is fine), no `Date.now()` while rendering (`src/lib/use-now.ts`).
- axe "label-content-name-mismatch": a button's `aria-label` must match its visible text; add
  `sr-only` text instead.
- Browser tests: mark the welcome tour seen first (`localStorage` `universe-tour-done:<user id>`);
  pause ~150 ms after typing before a ProseMirror toolbar action; wait for the calendar's slide-in.
- Firebase pop-up sign-in only through `popupSignIn` (`src/lib/firebase.ts`); the phone sign-in's
  reCAPTCHA box stays outside the steps (`PhoneAuthFlow.tsx`).
- The offline service worker is registered by `UpdateNotifier` (the PWA plugin's `register` is off).
- Prisma is patched (`patches/@prisma__client@6.19.3.patch`, M88: one query compiler per Worker copy);
  keep one client per request, and carry the patch over when upgrading Prisma.
- KaTeX: import `katex/dist/katex.mjs`. Attendance rows are stored at midnight UTC of the class day.
- `pkill -f <pattern>` can match its own shell: kill by port (`lsof -ti tcp:3000`) instead.
- A build run by an agent can stop with `SecurityFatalError` ("Your version of Next.js is affected…"): it's Next's
  upgrade notice for agents (`next/dist/lib/upgrade/nudge.js`), not a build error, and Cloudflare's builds never get it.
  Run the same build again at once (it lets one retry through within 5 minutes); don't run its `next upgrade --agent`
  command (upgrades follow the two-week rule, Next and the adapter together; 16.4.5 is due from 30 Nov, M231).

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

**The look (M124, the owner, 8 Nov 2026: the "Ballast" reels for light mode, the "Relay" recording for
dark mode).** Light mode is the default since M220 (the owner, 16 Nov: "make the light colour as default"; dark
until then, and kept for anyone who chose it); the website's top bar has a dark/light switch (`ThemeSwitch`).
**Light (Ballast):** a cool light-grey page (#f1f2f4), white cards with a hairline and a soft shadow, ink
text, black main buttons, one blue (#2563eb) for charts, icons, links, focus and what's chosen; a white
side menu whose chosen entry is a raised white card. **Dark (Relay):** near-black (#070808), the
website's blue as the accent since M212 (the owner disliked the neon lime, 16 Nov): main buttons #2563eb with
white text, chosen things, chart marks (`--ins-hot` #6ea2f8), focus; white headings; no `lime-*` classes. Green, amber and red only for states. The tokens and the Tailwind re-pointing
(indigo / violet / purple / pink / fuchsia / aqua = the accent; zinc = neutral greys) are the **M124
block** in `globals.css`; white text on a solid accent fill stays white (it turns ink only in Trace, Relief and Play). Type:
**Inter** (`/fonts/inter`), the headline's key word (`<Accent>`) in **Instrument Serif italic**. The
website and other parts drawn for a dark page carry `.flip-light` (light mode swaps their white and
black and reverses their greys); opt out with `.flip-keep`, `.dark`, `.on-dark`. **Each app's scene**
(M129, the owner, 9 Nov 2026; it replaced the river of M9–M128): `src/lib/backdrop.ts` draws one slow
scene per app in its colour (`APPS[].color`, plus `ALT`): UniVersity stars joined into constellations
and sheets of paper rising; Trace a dotted globe turning, shipments arcing between places; Relief a
contour map, requests pulsing, dashed routes of help; Green an aurora, leaves and fireflies; Play a neon
floor to the horizon, game-pad symbols. `AppBackdrop` shows it behind every page: the website and
sign-in follow their app tabs, the app follows `appFor(path)` (shared pages: the chosen app). Switching
is a 1 s transition (the old scene fades as it drifts towards you, the new one settles in; only the fade
with Reduce Motion). Drawn on a background thread (`backdrop.worker.ts`), 30 frames a second at up to 1.5x, resting after 30 s
untouched (M225), its motion easing in; a new app needs its scene there
(TypeScript asks). **Each app its own colour** (M132): `html[data-app]` (set by `AppBackdrop`) re-points
the accent to the app's (Trace pink, Relief orange, Green emerald, Play fuchsia, Travel sky since M213; UniVersity keeps the
blue; a person's own accent wins); the M132 block at the end of `globals.css`. No glass on cards, bars, the side menu or toasts. Since M94 no component keeps the old
navy or aqua, except documents printed on white (`src/server/`, certificates, CVs, report cards) and
colours people choose (slide themes, course colours, accents).

**Rules that carry over from the earlier looks:** `.panel`, `.card`, `.btn-primary` and
`.ios-segmented` carry the look, so new screens get it by using them (`.btn-primary` takes a person's own
accent when they chose one: `:root[data-accent]`). Fonts are served from `/fonts` (no outside service);
cards round with `--radius-card` (`corner-shape: squircle` where the browser has it). A heading's key
word: `<Accent>` (light mode: grey heading, ink word; dark: white, the word in the serif italic); no
eyebrow labels above headings; mono only for numbers and data. Older notes (M34, M52–M57, M91–M94) describe looks this one replaced:
ignore their colours; the river's notes (M9–M128) describe what M129 removed.

**No double animations, nothing that moves the layout (M231, the owner, 16 Nov: "ultra smooth like Apple";
`src/lib/motion-rules.test.ts` fails a break):** the motion layer below already animates titles, figures, bars,
charts and arriving content, so never add your own animation to those too (a framer-motion `initial`/`animate` on a
bar or a count-up on a figure plays twice). A progress bar is `<Fill value={0..1} />` (`src/components/ui/Fill.tsx`:
it slides, the graphics chip runs it; `quick` for uploads, timers, loading; the track needs `overflow-hidden`), never
a growing `width` (CSS `transition-[width]` or framer `animate={{ width }}`); a needle or marker slides with
`transform`, never `left` / `top`. A loop that runs forever is a CSS `@keyframes` on `transform` / `opacity`, never
framer-motion's `repeat: Infinity` (it runs on the page's thread every frame), added to the `html[data-scrolling]`
pause list and the Reduce Motion list. Press feedback is global (buttons sink to 0.97 in 70 ms and spring back,
`globals.css` "Motion system"): don't add per-button `whileTap` or `active:scale` on top. Height animation is only for
opening and closing a section. All of this runs in the browser: it costs Cloudflare nothing.

**The motion layer works on every page by itself**: pages assemble out of a blur
(`src/lib/page-transition.ts`), titles sweep in, figures count up, bars fill, charts draw, content that
replaces a loading placeholder and a row added to a list glide in (`src/lib/scroll-motion.ts`, M130),
cards glow under the mouse
(`.sheen`); opt a part out with `data-no-motion`. Decorative loops pause while the page scrolls
(`html[data-scrolling]`, M97): add new ones to that list, never ending the selector in `*` or `> *` (that
restyles the whole page, M98); never animate a custom property, `filter` or `background` (they repaint
every frame); a custom property written often is registered with `inherits: false` (`@property`, M168). Rules: motion has a job (arriving, changing,
answering a tap) and never makes anyone wait; nothing animated on things used many times a day;
ease-out for arrivals with the project's curves (`--ease-glide`, `--ease-ios`, `--ease-out-soft`,
`spring`); UI motion under 300 ms, exits faster than entrances; nothing grows from scale 0 (start
at 0.85–0.95); menus grow from where they were opened; name the properties (`transition-[transform,opacity]`,
not `transition-all`); animate transform and opacity only; stagger lists 30–80 ms; things settle on a spring (M133: `--spring-press` for presses,
`--spring-glide` / `springGlide()` for arrivals, CSS `linear()` curves the compositor runs); motion tied
to the scroll uses CSS scroll timelines (`animation-timeline`), never a scroll listener; a list that
changes in place (a filter) slides its items with `morph()` (`src/lib/view-transition.ts`, FLIP: only the
items move; a View Transition snapshots the whole page, too heavy beside a live map, M156); content an arrow
changes (a month, a day, a page) slides in from that side: a keyed `.swap` with `data-dir` next/back (M162); a person may rearrange any page by dragging, with no mode and nothing drawn (M165, `src/lib/arrange-dom.ts`: CSS `order` and sizes, never moved nodes; it leaves alone fields, canvases and anything with its own press handler): mark what must stay put `data-no-arrange`, give a steady name with `data-arrange-key`, keep a page's own wrappers plain so cards can leave their rows (M166), keep shortcuts in `Doc.pins` (M167), keep a person's layout only through `Vault` (`src/lib/arrange.ts`; synced by their choice), and use `Splitter` (`components/ui`) for panes to drag apart; Reduce Motion
leaves only fades; never animate what sits under full-screen frosted glass; hover-only extras show
without hover on touch screens. framer-motion's `x` / `y` / `scale` run on the page's thread (they
stutter while a page loads): for an entrance that must stay smooth, animate one `transform` string
(the compositor runs it), but never on an element with `layout` (M130).

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
  Kowalski's `emil-design-eng`, `review-animations`, `animation-performance`, `mobile-native`. Added
  8 Nov 2026 at the owner's request: `design-review` (a ranked critique of a page, screenshot or
  component), `web-design-guidelines` (Vercel's interface rules, kept in the skill, not fetched),
  `frontend-design` (Anthropic), `ui-ux-pro-max` (searchable styles, palettes, type pairings, UX
  rules; its search scripts work on local files) and `design-taste-frontend` (taste-skill's written
  guidance only). The Apple design skill (Apple's Human Interface Guidelines) stays off the repo
  (no licence; the guideline text is Apple's): `sh tools/setup-apple-design.sh` installs it on the
  machine. Motion (motiondivision/motion) is the animation library the app already uses, as
  `framer-motion` (14.x).
- **Hooks:** `protect-secrets.mjs` (blocks the secret files) and `suggest-compact.mjs` (after 60 tool
  calls, suggest a fresh conversation at the next finished item). Changing `.claude/settings.json`
  needs the owner's approval.
- **REA** (reverse engineering, Ghidra engine), set up on the machine, not in the repo: in a new
  cloud session run `sh tools/setup-rea.sh` (about 10 minutes), then restart Claude Code. Lawful use
  only: software the owner owns or may examine.
- **Where they came from:** Impeccable (github.com/pbakaus/impeccable, Apache-2.0) and Ponytail
  (github.com/DietrichGebert/ponytail, MIT), both without their hooks (see each skill's
  `SOURCE.md`); design-review (MIT) without its usage ping and paid upload mode, web-design-guidelines
  (MIT), frontend-design (Apache-2.0), ui-ux-pro-max (MIT) and taste-skill (MIT) without its hook,
  scripts and 38 MB of pictures (each skill's `SOURCE.md`); Emil Kowalski's skills (MIT); from Everything Claude Code only the commands,
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
