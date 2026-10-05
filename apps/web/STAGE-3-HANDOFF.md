# UniVerse: Stage 3 handoff (upgrades 1–10)

This file is for the next developer (or Claude session) building **stage 3**: ten big upgrades the
owner asked for. Stages 1–2 (simpler menus, the Messages upgrade, email schedule and more) are done
and live. Read the whole file before writing code: the "Rules" section is as important as the specs.

---

## 0. Start here

1. Work from `main` (stages 1–2 are merged). Create a branch, e.g. `stage-3-upgrades`.
2. Read: `apps/web/AGENTS.md` (**this Next.js 16 differs from what you know**, read
   `node_modules/next/dist/docs/` before writing Next code), `apps/web/DEPLOY-CLOUDFLARE.md`,
   `apps/web/src/lib/plan-limits.ts`.
3. Build the upgrades in the order in section 3, one commit each. **Do not push** until the owner
   says "push" (see Rules).

---

## 1. Rules (the owner's, non-negotiable)

| Rule | Why / how |
|---|---|
| **Push only when the owner says.** Commit locally; one push per round. | Cloudflare Workers Builds free plan = 3,000 build minutes a month. Every push to a branch builds a preview (~6 min); every merge builds production (~6 min). |
| **No extra emails.** New features notify **in the app and by push only**. | Resend free plan: ~3,000/month, 100/day, already budgeted (`src/server/email-budget.ts`). Don't call `notify()` from `src/server/email.ts` for new features (it can email); write `prisma.notification` rows + `publish(ids, { type: 'notification' })` + optional `pushService.sendToMany`. |
| **Keep it simple for users.** New features go **inside existing menu entries as tabs**; never add top-level menu items. | The owner just merged ~40 menu links into a few. Use `SectionTabs` sets in `src/components/layout/SectionTabs.tsx` and `also: [...]` in `Sidebar.tsx`. |
| **Smooth animation everywhere.** | framer-motion via `m as motion` (LazyMotion). Presets: `src/lib/motion.ts` (`spring.smooth/snappy/gentle`, `fadeUp`, `list`). CSS `.stagger`, `.lift`, `.skeleton`. |
| **No screenshots** when testing UI. | Verify with DOM/text reads (`get_page_text`, `read_page`, JS). Screenshots burn the owner's Claude limits. |
| **Save Claude usage.** | Always: `pnpm typecheck` (runs `tsc` + `tsc -p cloudflare/tsconfig.json`) and eslint on changed files compared with `origin/main` (no new problems). Browser-test only new screens, anything that polls/loops, and calls. **No full local builds** unless you must test Durable Objects; the PR preview build checks the build (`gh pr checks <n>` shows "Workers Builds: universe-web"). |
| **Never prefetch pages.** No `router.prefetch`, no `<Link prefetch>`. | On 4 Oct 2026 looping prefetches sent ~600k requests and took the site down. `src/components/ui/Link.tsx` has prefetch off; a Cloudflare WAF rule now blocks prefetch requests anyway. |
| **No polling where live updates exist.** | Server: `publish(userIds, { type: 'refresh', keys: ['/api/x*'] })` (`src/server/realtime.ts`). Client: `useLiveInterval(normalMs, liveMs)` (`src/lib/realtime-client.ts`); use `0` when live. Fan-out is capped by `planLimits().livePushes` (40 free / 500 paid). |
| **Workers Free limits per request.** | 10 ms CPU, 50 subrequests, 50 D1 queries. Cap loops, batch queries, use `planLimits()`. A tab sending >300 requests/min is paused by `src/lib/request-guard.ts`. |
| **AI is limited.** | Call `spendAi(user)` (`src/server/ai-budget.ts`) before every AI request; check `featureOff('ai')` (`src/server/moderation.ts`). Daily limits (owner console): student 20, staff 50, site 1000. Cache with `cachedAi/saveAi` where answers repeat. |
| **Deploy only by merging.** | The deploy command applies D1 migrations first. Never "Deploy" a version from the dashboard (that skipped migrations once and caused errors). |

---

## 2. How the codebase works (what you'll reuse)

- **Stack:** monorepo, app in `apps/web`. Next.js 16 App Router → OpenNext → Cloudflare Workers.
  D1 (SQLite) via Prisma D1 adapter. Durable Objects in `cloudflare/worker.ts`: `RealtimeHub`
  (live updates), `BoardRoom` (whiteboards), `CodeRoom` (Yjs), `CallRoom` (calls: signalling,
  captions relay, recording flag, Cloudflare SFU proxy). R2 bucket `universe-files`
  (`files.universeimpact.com`). Firebase auth.
- **API routes:** newer features use route files with the `route(req, async (user) => …)` helper
  from `src/server/assignments.ts` (maps `HttpException`s from `src/server/http.ts` to `{ error }`).
  Older features use the module router `src/server/modules/*.ts` under `/api/core/*`, called with
  `api` (`src/lib/api.ts`). Client fetch for route files: `authedJson` (`src/lib/authed-fetch.ts`).
- **Owner console:** `src/app/(dashboard)/console/*`, data from `src/server/modules/owner.ts`
  (`/api/core/owner/...`, fetched with `fetcher` from `console/shared`). Only a verified Google
  sign-in can be owner (demo accounts never are).
- **Sample mode:** every new GET endpoint a page uses needs a stub in `src/lib/sample/router.ts`
  (`[/^\/api\/x$/, () => ok(...)]`), or sample mode breaks.
- **Fast path:** `cloudflare/fast-api.ts` + `cloudflare/fast-chat.ts` answer the hottest GETs
  (chat list, open chat, notifications, incoming calls, `/api/me`, `users/me`, bootstrap) without
  Next.js. If you change one of those responses, change the fast path too (put shared logic in
  import-free files, like `src/lib/view-once.ts`, `src/lib/presence.ts`).
- **AI helpers:** `src/server/gemini.ts`: `geminiJson(system, prompt, schema, maxTokens, lite)`,
  `geminiText(...)`, `geminiAudioText(bytes, mime)`, `geminiFileText(bytes, mime)`.
- **Push:** `pushService.sendToMany(userIds, { title, body, url, tag })`
  (`src/server/services/push.service.ts`), capped by `planLimits().pushes` (15 free / 300 paid).
- **Cron:** `cloudflare/worker.ts` `scheduled()`. `0 8 * * *` → `/api/cron/daily`;
  `30 7 * * *` → `/api/cron/digest`; `*/15 * * * *` → usage guard, then `callsDue()` runs one cheap
  D1 query and only starts the app (`/api/cron/reminders`) when something is due. **Add new timed
  jobs by extending that precheck SQL**, not by starting the app every 15 minutes.
- **Migrations:** hand-written SQLite in `apps/web/prisma/migrations/NNNN_name.sql`; schema in
  `prisma/schema.prisma`. **Next number: 0039.** After a schema change: `npx prisma generate`,
  `node scripts/gen-owner-schema.mjs`, `npx wrangler d1 migrations apply DB --local`. Keep changes
  additive (new tables / nullable columns).
- **Menus:** `src/components/layout/Sidebar.tsx` (`navByRole`, `also` highlights, `searchOnlyPages`
  for ⌘K), phone bottom tabs in `DashboardShell.tsx` (`tabsForRole`, `match`), section tab sets in
  `SectionTabs.tsx` (e.g. `STUDENT_BOARD_TABS`, `STUDENT_TUTOR_MODES`, `PROGRESS_TABS`,
  `STUDENT_COURSE_TABS`, `LIFE_TABS`, `COLLAB_TABS`, `TEACHER_STUDENT_TABS`, `ADMIN_INSIGHT_TABS`,
  `MessagesTabs`).
- **Calls:** `src/server/calls.ts` (ids: chat message id, `g_<group>`, `c_<course>` class room,
  `r_<conversation>` drop-in voice room, `l_<random>` call link). Client `CallView.tsx`, hosted by
  `src/components/call/CallHost.tsx` (root layout, survives navigation; store `src/store/calls.ts`).
  Captions: `src/lib/use-captions.ts` (browser speech recognition; Chrome/Edge/Safari); final
  captions are relayed to everyone through `CallRoom` as `{ type: 'caption', from, text, final }`.
  Recording: `src/lib/call-recorder.ts` + `src/server/call-recordings.ts` (teacher → R2 → course
  `Material` VIDEO). Bigger calls use the SFU (`CALLS_APP_ID/SECRET` are set).
- **Local testing:** `pnpm dev` (port 3000). Demo sign-in in the browser console:
  `localStorage.accessToken = 'mock-token-demo@student.com'` and `universe-auth` =
  `{ state: { user: <GET /api/core/users/me> }, version: 0 }`. Demo accounts: `demo@student.com`,
  `demo@teacher.com`, `demo@admin.com`, `it-support@universe.com`. Durable Objects (calls, live
  updates, boards) need the Worker: `npx opennextjs-cloudflare build` then
  `npx wrangler dev --port 8787 --local --var DEMO_LOGIN_ENABLED:true`. After a build:
  `git checkout -- public/sw.js public/fallback-*.js && rm -f public/worker-*.js`. For calls in a
  test browser, stub `navigator.mediaDevices.getUserMedia` (oscillator stream).

---

## 3. The ten upgrades

Suggested order (dependencies first): **1 → 2 → 3 → 8 → 6 → 4 → 7 → 5 → 10 → 9.**
Each section: goal, where it lives, what already exists, data, server, client, cost, done when.

### Upgrade 1: AI class companion (class calls become study packs)

**Goal.** After a class call, students get a study pack on the course's Blackboard: summary,
notes, key moments with timestamps, flashcards and a 5-question quiz.

**Where.** Teacher turns it on in the class call. The pack shows in **Blackboard → Course board**
as a "Class sessions" card.

**Exists.**
- Class rooms are `c_<courseId>`; the teacher is `host`.
- Captions: each participant's browser makes captions only while someone wants them
  (`wantCaptions = cc || list.some(r => r.cc)` in `CallView.tsx`). Finals reach everyone via
  `CallRoom`.
- AI: `geminiJson`. Flashcards: `StudyCard` (per user). Quizzes: `Quiz`, `QuizQuestion`
  (grading in `src/server/services/quizzes.service.ts`).
- Board data comes from `src/app/api/courses/[id]/board/route.ts`.

**Build.**
- **In the call (`CallView.tsx`):**
  - The host gets a **"Class notes"** toggle. It is announced in `state` (add `notes: true`;
    accept it only from hosts in the `CallRoom` `state` handler, like `recording`). Everyone sees
    a "📝 Notes" badge, like REC.
  - While notes are on, every participant runs speech recognition (extend `wantCaptions`).
  - The host's browser collects all final captions (own + relayed), with seconds since call
    start, in memory.
- **When the host stops notes or leaves:**
  - `POST /api/calls/[id]/companion` with `{ transcript: [{ t, who, text }] }` (cap ~60k chars).
  - Server: check `courseAccess(...).canManage`, `spendAi(host)`, then one `geminiJson` with this
    schema:
    `{ summary, notes: string[], keyMoments: [{ t, text }], flashcards: [{ front, back }], quiz: [{ question, options[4], answer }] }`.
- **New model `ClassSession`:** `id, courseId, createdById, startedAt, durationSec, summary,
  notes Json, keyMoments Json, flashcards Json, quizId?, recordingMaterialId?, transcript (text,
  delete after 90 days in the daily job), createdAt`.
- **Quiz:** create it as a teacher-reviewable **draft** (teacher publishes).
- **Flashcards:** students tap **"Add to my flashcards"**, which creates their `StudyCard` rows.
  Don't create rows for every student up front.
- **Notify:** in-app notification + push to enrolled students: "Study pack ready: CS101".
- **Sample-mode stub** for the board addition.

**Cost.** One AI request per class, text only (no audio), no email.
**Privacy.** Badge + toast when notes start. Mention it in the Privacy Policy (owner re-exports
the PDFs in `public/legal`).
**Done when.** A class call with notes produces a session card, a draft quiz and flashcards
students can add. Without captions (e.g. a Firefox host) it says "No transcript: captions need
Chrome, Edge or Safari".

### Upgrade 2: Proof-of-learning passport (skills backed by evidence)

**Goal.** Quizzes passed, assignments graded, courses completed and verified impact hours become
**skills with evidence**. One public link (and a QR code) shows them to employers; AI writes a
short strengths paragraph.

**Where.** **Impact → Credentials & passport** (`/student/passport`, `CREDENTIAL_TABS`). The public
page is `src/app/passport/[slug]/page.tsx`.

**Exists.**
- `SkillPassport` (slug, isPublic, show flags, views); `src/server/passport.ts` (public page,
  Open Badges 3.0 VC-JWT, Ed25519 `src/server/services/credential-signer.ts`).
- APIs: `/api/passport/jwks`, `/verify`, `/badge/[id]`, `/public/[slug]`.
- Related: `ImpactCertificate`, `ProofOfWork`, `StudentSkill`, `ImpactPoint`.
- QR: `src/components/ui/QrCode.tsx`.

**Build.**
- **New model `SkillEvidence`:** `id, userId, skill (normalised), kind (QUIZ|ASSIGNMENT|COURSE|
  IMPACT|PROJECT), sourceId, title, detail, level, verifiedById, verifiedByName, occurredAt,
  hidden`, unique `(userId, kind, sourceId, skill)`.
- **Course skills:** add `Course.skills Json?`. The teacher picks 3–6 skills per course in
  Blackboard settings, with an optional AI suggestion from the course description (one request,
  teacher confirms).
- **Create evidence automatically:**
  - in `returnGrade()` (`src/server/assignments.ts`) when score ≥ 60% of max;
  - when quizzes are graded (`quizzes.service.ts`);
  - when an impact certificate is issued (`src/server/modules/impact.ts`
    `blockchain-credentials/issue`);
  - when proof of work is verified.
- **Passport page:** "Skills with evidence" section (expand a skill to see its evidence); the
  student can hide items. Add a QR code and a "Verify" button.
- **Strengths paragraph:** one AI request, cached; the student can edit it.
- **Open Badges:** add a skills achievement to the export (reuse the signer).

**Cost.** Writes on grading only; AI once per paragraph.
**Done when.** Grading an assignment adds evidence, the public page shows it, and the exported
badge verifies at `/api/passport/verify`.

### Upgrade 3: Early help with an action plan

**Goal.** Close the loop on struggling students: **notice → act → follow up → measure**.

**Where.** **Students → Early warning** for teachers (`/teacher/early-warning`); admins at
`/admin/early-warning`. Students see their plan in **Study planner**.

**Exists.**
- `StudentRiskFlag` (score, level, reasons, status, note, handledBy*, handledScore).
- `src/server/early-warning.ts` (daily, 4 explainable signals, no AI).
- UI: `src/components/early-warning/EarlyWarningBoard.tsx`.
- Related: `src/server/course-analytics.ts`, `src/server/study-planner.ts` (+ `StudyDay`), streaks.
- Guardians: `src/server/guardians.ts` (**emails**, behind `GUARDIAN_EMAILS=on`; keep it off).

**Build.** On each flag, four actions:
1. **Check in.** Opens or creates the 1:1 chat with a kind, editable message template.
2. **Make a study plan.** One AI request; uses the weak topics: low rubric criteria and quiz
   misses.
   - **New model `SupportPlan`:** `id, flagId?, studentId, courseId, createdById, plan Json,
     message, status, followUpAt, followUpDoneAt, outcome, createdAt`.
   - The student gets an in-app notification and push, and sees the plan in Study planner.
3. **Follow up in 7 days.** `SupportPlan.followUpAt`; extend the cron precheck to notify the
   teacher in the app.
4. **Outcome.** Store the score at follow-up (add `StudentRiskFlag.followUpScore`). Show
   Improved / Same / Worse.

**Tone.** Students never see words like "at risk"; plans read as encouragement.
**Cost.** One AI request per plan; no email.
**Done when.** Flag → plan → the student sees it in the planner → a follow-up reminder arrives →
the outcome is shown.

### Upgrade 4: Offline-first classroom

**Goal.** Take quizzes and write assignments with no connection (sent automatically when back
online); read recent chats offline and queue replies.

**Where.** **Courses → Offline** (`/student/offline`), plus the normal quiz, assignment and chat
screens.

**Exists.**
- `src/lib/offline-packs.ts`: Cache Storage packs (announcements, materials, readings, calendar,
  flashcards).
- Service worker via next-pwa (`next.config.ts`, custom worker `src/worker/index.ts`), plus
  `OfflineBar` and low-data mode.

**Build.**
- **IndexedDB outbox** (`src/lib/outbox.ts`): `{ id, kind, url, body, createdAt, attempts }`.
  Flush from the **page** (it has the sign-in token) on `online`, on app start and after each
  success. Backoff.
- **Idempotency:** send a client `clientId` (uuid) and dedupe on the server: a unique index, e.g.
  `messages(senderId, clientId)`, and unique-per-attempt on submissions.
- **Quizzes:** packs include open quizzes' questions **without answers**; grading stays on the
  server. Record offline start/finish times. Accept late-but-offline submissions with a
  "submitted offline at …" note; the teacher decides.
- **Assignments:** local drafts; queued submit.
- **Chats:** cache the last ~50 messages of recent chats in IndexedDB; show them with an "Offline"
  banner. Queued sends reuse the pending bubbles in `ChatWindow`.

**Cost.** None extra (flushes are the same requests as online).
**Done when.** Simulated offline (stub fetch, dispatch `offline`/`online`) → actions queue →
they flush once each with no duplicates.

### Upgrade 5: Impact marketplace with verified volunteering

**Goal.** NGO projects with **shifts**:
- students check in on site with a rotating **QR code** (or GPS) and hours are verified
  automatically;
- a **live impact map**;
- a **yearly impact report** (PDF via print) for funders.

**Where.** **Global Impact → Opportunities** (`OPPORTUNITY_TABS`) for students; admin
**Global Impact** (partners, impact metrics, impact reports, certifications).

**Exists.**
- Models: `NGO`, `NGOProject` (impactPoints, skillsRequired, sdgNumber, openings),
  `NGOProjectApplication`, `ImpactPoint`, `ImpactCertificate` (signing + anchoring), `ProofOfWork`.
- Code: `src/server/modules/impact.ts`, `src/server/impact-report.ts`, AI match
  (`/student/impact/ai-match`).

**Build.**
- **New models:**
  - `VolunteerShift`: `projectId, title, startAt, endAt, location, lat, lng, radiusM, capacity,
    createdById`.
  - `ShiftCheckin`: `shiftId, studentId, checkInAt, checkOutAt, method (QR|GPS|MANUAL), lat, lng,
    minutes, verified, verifiedById`; unique `(shiftId, studentId)`.
- **Check-in QR:**
  - The supervisor (admin or teacher) shows a code that changes every 30 s: an HMAC of
    `shiftId + time window` with a server secret. No database write per code.
  - Students scan it → `/impact/checkin?t=…` → the server checks the window (+ optional GPS
    distance) → saves the check-in.
- **Hours:** check-out at shift end → `ImpactPoint` + certificate prefill + passport evidence
  (upgrade 2).
- **Map:** built-in SVG dot map (no map tiles: the CSP blocks third-party images, and tiles cost
  requests).
- **Report:** a print-friendly page (`window.print()` → PDF), no server PDF library.

**Done when.** Shift → QR → the student checks in → hours verified → certificate prefilled → the
map and report show it.

### Upgrade 6: Smart timetable and study planner

**Goal.** A weekly plan that fits real free time, weak topics and due dates. It **re-plans
itself** when things change, and syncs to the phone calendar.

**Where.** **Dashboard → Study planner** (`HOME_TABS`, `/student/planner`).

**Exists.**
- `src/server/study-planner.ts` (7-day AI plan, cached per day).
- Data: `TimetableSlot`, `CalendarEvent` (includes scheduled class calls), `StudyCard` due dates,
  assignment and quiz due dates.
- iCal feed: `src/server/ical.ts`. Activity: `StudyDay`.

**Build.**
- **Deterministic scheduler, no AI for placement:**
  - free slots = week minus timetable minus events;
  - tasks = due work (estimated minutes) + flashcards due + weak topics;
  - greedy placement with a daily cap the student sets.
- AI only for optional one-line "why" text.
- **New model `PlanBlock`:** `userId, date, start, end, kind, refId, title, done, movedFrom`.
- **Re-plan lazily when the page opens** if stale: a new assignment or missed blocks.
  Zero background cost. Show "2 sessions moved because …".
- **Calendar:** drag to move (framer-motion), tick to mark done. Add upcoming blocks to the iCal
  feed (opt-in).

**Done when.** Timetable gaps are respected, a new assignment updates the plan on next open, and
the iCal feed contains the blocks.

### Upgrade 7: Campus super-app

**Goal.** One place for campus life:
- live room availability;
- dining menu;
- events with RSVP and QR check-in;
- lost & found;
- clubs with their own space (a Community).

**Where.** **Student Life** (`LIFE_TABS`): add **Events** and **Lost & found** tabs. Admins
moderate in **Campus Monitoring**.

**Exists.**
- `Association(+Membership)`, `Room(+Reservation)`.
- `CampusItem` (SERVICE|LINK|EVENT, startAt; `/api/campus-items`), `MedicalRecord`.
- Pages under `/student/life/*`.
- Communities (stage 2: `src/server/communities.ts`).

**Build.**
- **Events:** `EventRsvp` (`itemId, userId, status, checkedInAt`) + `CampusItem.capacity`.
  Check-in uses the same rotating QR idea as upgrade 5.
- **Lost & found:** `LostFoundItem` (`kind LOST|FOUND, title, description, photoUrl, location,
  reporterId, status`; expires after 30 days). "Message them" opens a chat.
- **Dining:** `CampusItem` kind `MENU` with date + items (admin posts weekly).
- **Rooms:** "Free now / Free at 14:00" badges computed from reservations.
- **Clubs:** `Association.communityId`. "Create club space" makes a Community with the members.

**Done when.** RSVP + check-in work, lost-item chat works, and room badges are correct.

### Upgrade 8: Assignment integrity and feedback studio

**Goal.** Faster, kinder marking with the teacher in control:
- voice/video feedback;
- rubric AI pre-marking for a whole class;
- careful writing-style signals (a hint, never a verdict).

**Where.** Teacher's assignment page (`/teacher/assignments/[id]`); students see the feedback on
`/student/assignments/[id]`.

**Exists.**
- `Assignment` (rubric, maxScore), `AssignmentSubmission` (aiDraft, criteriaScores, feedback,
  signals).
- `src/server/assignments.ts`: `draftWithAi()` (AI pre-marking per rubric criterion),
  `returnGrade()`.
- Similarity: `src/server/similarity.ts` (MinHash, limits in plan-limits).

**Build.**
- **Voice/video feedback:**
  - Recorder like the chat voice note (`Composer.tsx`); upload with `uploadChatFile`.
  - Add to `AssignmentSubmission`: `feedbackMediaUrl, feedbackMediaKind, feedbackTranscript`.
  - Optional transcript via `geminiAudioText`.
- **"Draft all":** the client loops `draftWithAi` a few at a time, respecting AI limits and the
  subrequest cap. Per-criterion accept/edit chips.
- **Style signals (no AI):** sentence length, vocabulary and punctuation profile vs the student's
  **own earlier submissions** (`styleSignals Json`). Wording: "differs from their earlier
  writing; worth a conversation". Any AI-likelihood opinion must say it can be wrong.

**Done when.** The student plays the feedback, draft-all works within limits, and the signals use
careful wording.

### Upgrade 9: Multi-campus network

**Goal.** Universities in the network:
- **joint courses** and shared class calls;
- **exchange-student** profiles;
- **cross-campus communities**;
- a network directory.

**Reality check.** Today everything is one campus in one database (the `Organization` model is
billing only). So campuses become **groups of users** in the same deployment.

**Where.** Admin **Global Impact** (directory, partners); teacher **Global Collaboration**;
communities in **Messages → Communities**.

**Exists.**
- `Partner`, `Partnership`, `TeacherCollaboration`, `CollaborationProject(+Member, Milestone)`.
- Communities (invite links, channels, voice rooms); bigger calls via the SFU; LTI models.

**Build.**
- **New model `Campus`:** `name, country, city, logoUrl, emailDomains Json, lat, lng`.
- **`User.campusId`:** auto-set from the email domain at first sign-in; admins can edit.
- **Joint courses:** `CourseCampus` (`courseId, campusId`) lets partner students enrol.
  Class calls already follow enrolment.
- **Exchange profiles:** `StudentProfile.exchangeCampusId` + dates.
- **Cross-campus communities:** `Community.discoverable`, listed under "Communities in the
  network" with a Join button.
- **Directory:** campuses with counts. No personal details across campuses unless opted in.

**Done when.** Two campuses by email domain → cross-campus enrolment → a discoverable community
join works.

### Upgrade 10: School analytics for decision-makers

**Goal.** A live dashboard (attendance trends, at-risk by department, engagement, teacher
workload, impact hours) and **questions in plain words** ("which courses have the lowest
attendance this month?").

**Where.** Admin **Insights** (`ADMIN_INSIGHT_TABS`: School insights | Analytics | Reports |
Impact).

**Exists.**
- `/admin/insights` (SQL-counted school insights).
- `src/app/api/premium/analytics/route.ts`, `src/server/export.ts`, `src/app/api/admin/impact`.
- Owner insights; `UiEvent` page views.
- Charts use **recharts**.

**Build.**
- **No AI-written SQL** (security, and D1 limits). Make a catalogue of **safe metric functions**
  with fixed SQL and parameters, ≤ 50 rows each: `attendanceByCourse(range)`,
  `gradesByDepartment(range)`, `atRiskByDepartment()`, `engagement(range)`,
  `teacherWorkload()`, `impactHours(range)`.
- **AI step 1:** `geminiJson` maps the question → `{ metric (enum), params, chart }`.
- **Server:** runs the metric (≤ 6 queries).
- **AI step 2 (optional):** one or two sentences from the numbers.
- **Cache** per normalised question per day (`sameQuestion` in ai-budget).
- **Out-of-scope questions** list what can be asked.
- **Charts:** one axis per chart, legend for 2+ series, a table view.

**Done when.** Ten sample questions map correctly, unknown questions get the help list, and no
request goes over the query cap.

---

## 4. State at handoff (5 Oct 2026)

**Live after the stage 1–2 merge:**
- **Menus:** simpler menus in all portals.
- **Messages:**
  - Chats | Calls (+ Announcements for admins) tabs;
  - WhatsApp-style: status, view once, link previews, transcripts, search, broadcasts;
  - Discord-style: communities, channels, threads, voice rooms, presence, slash commands,
    AI catch-up, suggested replies, `/ask`;
  - iPhone-style: floating call bar, hold, call waiting, voicemail, Focus, favourites, call links.
- **Voice tutor:** inside AI tutor (Type | Talk); sessions saved and shown in the owner console.
- **Owner emails:** schedule (daily/weekly/monthly) on the owner console's Server tab.
- **Fixes:** sample-mode reload fix; push sign-up fix; request brake.
- **Migrations up to 0038.**

**Owner to-dos:**
- The Privacy Policy needs updating for:
  - voice tutor transcripts (text, 90 days);
  - status updates (24 h);
  - link previews (fetched by the server);
  - class notes (upgrade 1).

  The PDFs in `public/legal` are re-exported by the owner.
- Push notifications need users to tap **Allow**. Check `push_subscriptions` count > 0.
- Wrangler is logged in on the owner's Mac. `npx wrangler logout` when no longer needed.

**Protections in place:**
- WAF rate limit: 150 requests / 10 s per IP.
- WAF rule blocking page prefetch requests.
- Bot Fight Mode on.
- Request brake (`src/lib/request-guard.ts`).
- No prefetching anywhere.
