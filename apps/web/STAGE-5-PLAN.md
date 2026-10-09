# UniVerse: Stage 5 plan, "World class"

Stages 1–4 are built and live (Stage 4 merged in PR #42 and #43, October 2026). UniVerse already
has more than most school platforms: classes, calls with captions/translation/breakouts/webinars,
WhatsApp-class messaging, docs/boards/tasks/code together, an AI tutor, a skills passport, impact
projects, a campus super-app and admin analytics. Stage 5 is about three things:

1. **Quality**: make every screen feel as polished, fast and reliable as Apple, Google or Notion
   (Phase A). The owner's words: *smooth animations, transitions, loading and glide transitions,
   like everything else.*
2. **Depth**: upgrade every existing feature, down to its buttons, until each one can stand next
   to the best single-purpose product in its category (Phase B).
3. **Reach and difference**: the platform pieces big companies have (native apps, multi-school
   SaaS, integrations, compliance) (Phase C), and features nobody else has (Phase D), plus a long
   list of small improvements (Phase E).

Read **all** of section 0 before writing code. Sections A–E are the work, in IDs (A1, B3.2, …) so
progress can be tracked in the Progress section at the end.

---

## 0. Start here

### 0.1 Read first
- `apps/web/AGENTS.md`: **this Next.js 16 differs from what you know.** Read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next code.
- `apps/web/STAGE-3-HANDOFF.md` sections 1–2 (rules, how the codebase works) and
  `apps/web/STAGE-4-PLAN.md` (what exists, "Notes for whoever continues").
- `apps/web/DEPLOY-CLOUDFLARE.md`, `apps/web/src/lib/plan-limits.ts`.

### 0.2 Rules (the owner's; non-negotiable)
| Rule | How |
|---|---|
| **One commit per feature.** Push at checkpoints; **merge only when the owner says "merge".** | Work on a branch from `main`. Fetch before starting each item: another agent may work on the same branch. |
| **Typecheck + eslint on changed files, always.** | `pnpm typecheck` (both tsconfigs) and `npx eslint <changed files>`. No new lint errors in files you touch. No full local builds unless needed (Cloudflare builds the PR). |
| **Build memory.** | Cloudflare gives Node ~2 GB for the build. **Never import big generated JSON as a module** (see `src/server/db-schema.ts`). After big additions run `npx tsc --noEmit --extendedDiagnostics` and keep "Memory used" under ~1.8 GB. The build script sets a 4 GB heap as headroom. Cloudflare builds with **Node 22**: don't use Node 24+ APIs. |
| **No extra emails.** | New features notify **in-app + push only** (`notifyMany(…, { email: false })`, `pushService`). Resend free plan is budgeted (`src/server/email-budget.ts`). |
| **New features go inside existing menus as tabs.** | Never add top-level menu items. `SectionTabs` sets in `src/components/layout/SectionTabs.tsx`; `also: [...]` in `Sidebar.tsx`. |
| **iOS look and smooth motion everywhere.** | `m as motion` + presets in `src/lib/motion.ts` (`spring.smooth/snappy/gentle/bouncy`, `fadeUp`, `list`); `Segmented`, `Switch`, `ios-*` classes; two-tone indigo/fuchsia; skeletons while loading; page transitions (`src/lib/page-transition.ts`). |
| **No screenshots when testing.** | Verify with DOM/text reads (`read_page`, `get_page_text`, JS). |
| **Never prefetch pages.** | No `router.prefetch`, no `<Link prefetch>` (site went down once). |
| **No polling where live updates exist.** | `publish(ids, { type: 'refresh', keys })` + `useLiveInterval(normal, 0)`. |
| **Workers Free limits per request.** | 10 ms CPU, 50 subrequests, 50 D1 queries, **100 bound parameters per D1 query** (chunk IN lists by 90). Batch queries. |
| **AI is limited.** | `spendAi(user)` before every AI request, `featureOff('ai')`, cache with `cachedAi/saveAi`. Prefer the lite model for simple jobs. Images: `geminiJsonImage`. |
| **Sample stubs.** | Every new GET a page uses needs a stub in `src/lib/sample/router.ts`. |
| **Fast path.** | If you change a response served by `cloudflare/fast-api.ts` / `fast-chat.ts`, change it there too. |
| **Migrations.** | Hand-written SQL `prisma/migrations/NNNN_name.sql`, **next number 0075**. Additive only. Then `npx prisma generate`, `node scripts/gen-owner-schema.mjs`, `npx wrangler d1 migrations apply DB --local`. The deploy applies them to production. |
| **Call room changes.** | Run `node scripts/test-call-room.mjs` (127 checks) after changing `CallRoom`; add checks for new behaviour. |
| **Costs need the owner's yes.** | Anything that needs a paid service or an account (Apple/Google developer, Razorpay, SMS, Cloudflare Stream, Workers Paid) is marked **[owner]**: build it behind a switch, off until the owner sets it up. |

### 0.3 How to test (local)
- `pnpm dev` (port 3000) through the in-app browser. Demo sign-in: `localStorage.accessToken =
  'mock-token-demo@student.com'` (or teacher/admin) and `universe-auth` from `/api/core/auth/me`.
- Durable Objects (calls, docs, boards, live updates) don't run in `next dev`: test them with the
  call-room harness, or fake the WebSocket in the page (see STAGE-4-PLAN notes).
- **Page crawl:** visit every page per role and record error overlays, error screens, failed
  requests (method in memory/STAGE-4 notes; 142 pages were clean on 7 Oct 2026). Item A6 turns this
  into a script.

---

## 1. Where UniVerse stands against the big companies

| Area | Best in class | UniVerse today | Gap to close |
|---|---|---|---|
| Learning management | Canvas, Google Classroom, Moodle, Blackboard | Courses, board, assignments with AI-drafted grading, quizzes, attendance, LTI 1.3 | Modules/units, gradebook categories, question banks, SpeedGrader-style grading, content standards (SCORM/xAPI/Common Cartridge), roster sync |
| Messaging | WhatsApp, Slack, Discord, Teams | Rich text, threads, reactions, polls, voice notes, albums, folders, scheduled send, chat lock, communities, moderation, FTS search | Bots/apps, end-to-end encryption, stickers/GIFs, message reminders, workflow automations |
| Calls | Zoom, Meet, Teams | SFU, captions + translation, breakouts, polls, webinar, recording, notes, PiP, watch together, whiteboard in call | Live streaming, call quality dashboard, phone dial-in (paid), larger webinars, noise-free virtual backgrounds on low-end phones |
| Docs/boards/tasks | Notion, Google Docs, Miro, Asana | Live docs (Yjs) with comments/versions/mentions, boards with AI, tasks kanban, code rooms | Templates gallery, wiki/page tree, suggestions mode, Gantt/timeline, automations, exports |
| AI tutor | Khanmigo, Duolingo Max, ChatGPT Edu | Course tutor with citations, voice tutor, semester memory, study packs | Photo-of-a-problem help, step-by-step math with LaTeX, adaptive practice, mastery tracking |
| Careers/credentials | LinkedIn, Handshake, Credly | Skills passport with evidence, Open Badges, internships, AI match | Verifiable Credentials (W3C), employer portal, CV builder, mock interviews |
| School admin (SIS) | PowerSchool, Fedena, Classe365 | Users, approvals, timetable, finances, insights, multi-campus, safety | Admissions pipeline, fees/invoices with local payments, exams & report cards, library, transport, hostel, custom roles |
| Platform | All of the above | PWA, Workers, D1 | **Native store apps, multi-school SaaS with branding, public API, SSO (SAML), compliance (FERPA/COPPA/GDPR/DPDP), accessibility certification** |

The **difference** UniVerse can own: learning + social impact + career in one place, AI that sees
the *whole* semester (calls, chats, work) with privacy, and working well in low-bandwidth,
multilingual classrooms. Phase D builds on exactly that.

---

## Phase A: Quality foundation (do first; everything else builds on it)

### A1. Lint and type debt to zero
- **What:** the full lint finds **371 errors in 113 files** (298 `no-explicit-any`, 30
  `set-state-in-effect`, 16 unescaped entities, 14 `immutability`, 10 `purity`). Mostly older
  screens. Fix them properly (real types, effects that don't set state synchronously, no
  `Date.now()` in render), not with disable comments.
- **Worst files first:** `components/chat/ChatWindow.tsx` (20), `student/attendance` (11),
  `student/quizzes` (10), `student/skills` (10), `services/collaborations.service.ts` (9),
  `teacher/attendance` (8), `teacher/courses` (8), `services/mentorship.service.ts` (8),
  `student/administrative/accounting` (7), `student/impact/startups` (7),
  `components/dashboard/CourseBoard.tsx` (7), `components/ui/CommandPalette.tsx` (7),
  `services/internships.service.ts` (7), then the rest.
- **How:** one commit per area (chat, attendance, quizzes, …). Run `npx eslint src cloudflare
  scripts -f json` to track the count. Then make `pnpm lint` part of the checks in AGENTS.md.
- **Done when:** `npx eslint src cloudflare scripts` reports 0 errors; warnings below 50.

### A2. One design system, used everywhere
- **What:** many older pages (administrative, impact, life, career, teacher attendance/grades)
  still use their own buttons, cards and spacing. Bring every screen onto the iOS design system.
- **How:** build/complete these in `src/components/ui/` and replace ad-hoc markup:
  `Button` (primary/secondary/plain/destructive, sizes, loading state with spinner, haptic),
  `Card`/`ListSection`/`Cell` (iOS grouped lists), `Sheet` (bottom sheet on phones, centred dialog
  on desktop, drag to close: reuse `SheetGestures`), `EmptyState` (icon, title, one-line hint,
  primary action), `Skeleton` presets (list, card, table, chart), `Toast` conventions (sonner, undo
  action), `Avatar`/`AvatarStack`, `Badge`, `Tabs` (=`Segmented`/`SectionTabs`), `Field` (label,
  hint, error, counter), `SearchField`, `DatePicker`/`TimePicker` (native inputs styled),
  `Menu`/`ContextMenu` (long-press on phones), `Tooltip`, `ProgressRing`, `Stat`.
- Document each in `src/components/ui/README.md` with when to use it.
- **Done when:** no page uses raw `<button className="bg-…">` for primary actions; a grep for
  `rounded-xl bg-indigo-600` style one-offs is near zero.

### A3. Motion and loading pass (the owner's priority)
- **What:** every screen should glide: content fades/rises in (`fadeUp`, `list` stagger), lists
  animate inserts/removals (`AnimatePresence` + `layout`), tab switches slide (`TabPill`,
  `TabPanel` from `components/ui/Glide.tsx`), sheets spring, buttons press (`whileTap={{ scale:
  0.96 }}`), numbers count up, skeletons match the final layout (no jumps), images fade in.
- **How:**
  - Audit page by page (list all 142 pages in a checklist in the Progress section). For each:
    skeleton while loading, empty state, error state with Retry, entrance animation, no layout
    shift when data arrives (reserve height).
  - **Optimistic UI** for every quick action (like, star, mark done, follow, RSVP, react): update
    SWR cache immediately, roll back with a toast on failure.
  - **Shared element transitions:** list item → detail (course card → course board, chat row → chat,
    task card → task sheet) with `layoutId` or the View Transitions API
    (`src/lib/view-transition.ts`).
  - **Pull to refresh** on phones for lists (inbox, notifications, feed, assignments).
  - **Reduce Motion** respected everywhere (already in `motion.ts`; check custom CSS animations
    too).
- **Done when:** the checklist is complete; a crawl shows no page without a skeleton or empty
  state; CLS (layout shift) < 0.05 on the top 20 pages.

### A4. Performance budget
- **What:** fast on a ₹8,000 Android phone on 3G.
- **How:**
  - Measure: `next build --webpack` with bundle analysis (`@next/bundle-analyzer` dev dependency),
    list the 20 heaviest client chunks. Targets: first load JS < 200 KB on dashboards, < 120 KB on
    public pages.
  - Lazy-load heavy things that aren't (charts, Excalidraw, Tiptap, pdf.js, Pyodide, MediaPipe,
    emoji data) with `dynamic(() => import(...), { ssr: false, loading: Skeleton })`.
  - Images: responsive `srcset` from R2 via a resize-on-upload step (make 3 sizes in the browser
    before upload with `createImageBitmap` + canvas; store `-sm/-md/-lg`), `loading="lazy"`,
    `decoding="async"`, blurred placeholder (tiny base64).
  - Fonts: subset, `font-display: swap`; preload only the one used above the fold.
  - API: add `Cache-Control` / edge caching where answers are public; keep the fast path for hot
    GETs; look for N+1 queries in `src/server/services/*` (old services do loops of queries).
  - Web Vitals reporting to the owner console (`/api/ui-events` style, sampled 10%).
- **Done when:** owner console shows LCP p75 < 2.5 s and INP p75 < 200 ms for the top pages.

### A5. Accessibility (WCAG 2.2 AA)
- Keyboard: every action reachable, visible focus rings (`focus-visible:ring-2`), focus trapped in
  sheets/dialogs and returned on close, Escape closes.
- Screen readers: labels on icon buttons, `aria-live` for toasts/new messages, landmarks, headings
  order, `role="dialog"` with names.
- Contrast: check both themes (dark mode zinc-500 text often fails on dark cards).
- Settings → Accessibility: text size (4 steps), bold text, reduce motion, high contrast,
  dyslexia-friendly font (OpenDyslexic, self-hosted), underline links, captions on by default.
- Publish `/accessibility` with a real conformance statement after the audit.
- **Done when:** axe-core run (dev only, `@axe-core/react` or a crawl script) shows 0 serious
  issues on the top 40 pages.

### A6. Automated checks (light, free)
- `scripts/crawl.mjs`: starts nothing itself; given a running dev server, signs in as each demo
  role through Playwright **only if installed** (optional dev dependency) or via the in-app browser
  method, visits every route from the build's route list, and writes a report (error overlays,
  error screens, failed requests, missing skeleton).
- `vitest` for pure logic (dev dependency): `src/lib/chat-search.ts`, `src/lib/local-time.ts`,
  `src/lib/hall-map.ts`, `src/server/mentions.ts` `mentioned`, `src/server/safety.ts`
  `quickCheck`, `tidyDiagram`, `nextMorning`, grading maths, plan limits. Target 150 tests.
- Keep `scripts/test-call-room.mjs` growing.

### A7. Languages and right-to-left
- UI languages today: English, French, Spanish, Hindi (`src/lib/i18n.ts`). Many newer screens are
  English-only strings.
- **How:** move all user-facing strings in new code to `t()` keys; add **Arabic and Urdu (RTL)**,
  **Bengali, Tamil, Telugu, Marathi, Portuguese, Indonesian, Swahili**. Use the AI translator once
  per string set (cached) to draft, then mark "machine-translated" in the owner console for review.
- RTL: `dir="rtl"` on `<html>`, logical CSS (`ms-`/`me-`, `ps-`/`pe-` instead of `ml`/`mr`),
  mirrored icons for arrows.
- Dates, numbers and currency through `Intl` everywhere (₹ grouping 1,00,000 for `hi`/`en-IN`).

### A8. Security hardening
- **Passkeys** for sign-in (WebAuthn; chat lock already uses it) as a second factor and as
  passwordless sign-in; required for admins (replaces the emailed two-step code, which costs emails).
- Session list with "sign out other devices" (Settings → Privacy & security).
- Rate limits per route family (the Worker has a costly-route limiter; extend to auth, uploads,
  AI).
- CSP report-only endpoint to catch violations; review `security-headers.ts` after each feature.
- Dependency audit in CI (`pnpm audit --prod`), Renovate-style monthly update round.
- Signed URLs for private files (R2 presigned GET, 10 min) instead of public links where privacy
  matters (grades, documents, recordings).

### A9. Reliability and observability
- Owner console → Health: error rate per route, slowest routes, D1 query counts per request, AI
  spend per feature, push success rate, call quality (from `CallStat`), build size trend.
- Error boundaries on every top-level section with a friendly "Try again" (some exist).
- Feature flags per organization (extend `server_control.switches`) so a broken feature can be
  turned off for one school.

---

## Phase B: Upgrade every existing feature (button by button)

Each item: **What** (user-facing), **How** (where), **Done when**.

### B1. Home / dashboards (student, teacher, admin)
1. **Customisable widgets:** "Edit home" mode (iOS wiggle): reorder, hide, add widgets (Your day
   brief, Up next, Grades trend, Streak, Study planner, Impact hours, Unread chats, Pinned course,
   Weather + campus status). Saved per user (`users.homeLayout` JSON).
2. **Up next card:** the single most important thing now (class in 10 min → Join; quiz due in
   2 h → Start; teacher: 12 submissions → Grade), animated swap as time passes.
3. **Streaks and goals:** daily study goal (minutes), weekly goal ring (Apple Fitness style),
   celebratory confetti (respect reduce motion).
4. **Teacher home:** "Today's classes" with one-tap Start class (call + attendance + notes),
   "Needs attention" (late work, flagged students from early warning, unanswered questions),
   quick-create (assignment, quiz, announcement) floating button.
5. **Admin home:** live KPIs (attendance today, fee collection, open safety flags, active users),
   alerts strip, quick links to approvals.
6. **Global "+" button** (phones: tab bar center): new message, new task, new doc, new event,
   ask AI, scan QR.

### B2. Courses and the course board
1. **Modules / units:** courses get ordered modules with items (page, file, video, link, quiz,
   assignment, discussion, live class). Progress per student (✓ per item), "Next item" button,
   prerequisites ("unlock after Quiz 1 ≥ 60%"), release dates.
   - Model: `CourseModule`, `ModuleItem` (kind + ref id), `ItemProgress`.
2. **Rich lesson pages:** Tiptap page editor (reuse docs editor without Yjs, or with it for
   co-teaching) with embeds: video with chapters, code runner, quiz block, flashcards block,
   callouts, math (KaTeX), diagrams.
3. **Course templates and copy:** copy a course to a new term (structure, materials, quizzes,
   rubrics; not submissions); template gallery per subject.
4. **Import:** IMS Common Cartridge (.imscc zip) and Google Classroom export → modules and
   materials. Export as Common Cartridge too.
5. **Syllabus builder** with AI: from title + level + weeks → a draft module plan the teacher
   edits; outcomes mapped to skills (existing `Course.skills`).
6. **Course calendar** (all due dates, classes, events) with ICS (exists for timetable; extend).
7. **Course analytics for teachers:** item completion funnel, time on video, drop-off points,
   quiz item analysis, pulse timeline per class (exists), at-risk list (early warning).
8. **Course discussion board** (forum) with threads, upvotes, "answered" marks, teacher-endorsed
   answers, AI suggested answer from materials (draft for the teacher).
9. **Announcements:** schedule, pin, read receipts ("seen by 28/32"), translate on read.
10. **Enrollment:** join codes and QR (exists for some), waitlists, section groups, co-teachers
    and TAs with permissions.

### B3. Assignments and grading
1. **SpeedGrader-style grading view:** student list on the left, submission (text/PDF/image/code)
   in the middle with inline annotation (pdf.js + highlights + comments), rubric on the right,
   keyboard shortcuts (J/K next/prev, 1–5 rubric levels), "Use AI draft" (exists), audio/video
   feedback (exists in feedback studio).
2. **Assignment types:** file upload, text, link, code (runs tests: reuse 3.6 code tests), group
   assignment (one submission per group, marks shared or individual), peer review (anonymous,
   rubric-based, calibration), discussion post, presentation (recorded video).
3. **Policies:** late penalties (% per day, grace), resubmissions (max N), extensions per student,
   accommodations (extra time) set once per student and applied everywhere.
4. **Gradebook:** categories with weights (homework 20%, exams 50%…), drop lowest, letter/GPA
   scales per school, standards-based (mastery levels per outcome), mute/post grades, export CSV
   and to LMS via LTI AGS, grade history audit.
5. **Integrity:** similarity (exists) + **AI-use declaration** per submission (see D18), writing
   process replay for typed answers (keystroke timing summary, not keylogging: chunks of text over
   time) to show genuine work.
6. **Student side:** clear status chips (Not started / Draft saved / Submitted / Late / Graded),
   autosave drafts, submission receipt (signed), "What does this rubric mean?" AI explainer,
   grade appeal/regrade request flow.

### B4. Quizzes and exams
1. **Question bank** per course with tags, difficulty, outcomes; import from CSV/QTI/GIFT.
2. **Question types:** multiple choice (single/multi), true/false, short answer (AI-assisted
   marking with teacher review), fill in the blanks, matching, ordering, numeric with tolerance,
   math (LaTeX input with a visual keyboard), code (tests), hotspot on image, audio answer.
3. **Randomisation:** pools, shuffled questions/options, per-student variants (numbers vary).
4. **Exam mode:** timed with server-side end, one question at a time, no back navigation option,
   honest-integrity log (tab switches, paste events, full-screen exits shown to the teacher; no
   webcam spying), offline-tolerant (answers queued; offline quizzes exist).
5. **Adaptive practice mode:** next question chosen by mastery (see D1), unlimited attempts,
   hints, explanations.
6. **Item analysis:** difficulty, discrimination, distractor analysis, "questions to fix".
7. **Live quiz game** (Kahoot-style) in class: join with code/QR on phones, leaderboard,
   streaks, music (optional), results into gradebook as practice.

### B5. Attendance
1. Rotating QR (exists) + **geofence check** (optional, admin policy) + **auto attendance from
   class calls** (present if in the call ≥ X% of the time; uses `CallStat`).
2. Excuse requests with document upload → teacher/admin approve.
3. Attendance analytics: per student trends, chronic absence alerts (early warning), guardian
   alerts in-app (not email).
4. Bulk mark, keyboard marking, seating chart view (tap a seat).

### B6. Timetable, calendar and study planner
1. Drag-and-drop calendar (day/week/month/agenda), colour by course, show office hours, events,
   deadlines, personal blocks.
2. Two-way sync with Google/Outlook calendars (OAuth **[owner]** for Google Cloud project; ICS
   subscribe works today).
3. **Timetable generator** for admins: constraints (teachers, rooms, hours per subject) → a
   proposed timetable (greedy/backtracking in the browser; no server CPU), conflicts highlighted.
4. **Exam timetable** generator (no student with two exams at once, room capacity).
5. Smart study planner (exists): drag sessions, "I'm behind" rescheduling, focus timer that logs
   minutes (Study Hall timer exists), weekly review.

### B7. Messaging (already strong: polish and power features)
1. **Message reminders** ("remind me about this in 1 h / tomorrow") and **Later** list.
2. **Stickers and GIFs:** sticker packs stored in R2 (school-made packs; admins upload), GIF search
   via Tenor/Giphy **[owner key]**, behind a switch.
3. **Bots and slash commands framework:** `/poll`, `/remind`, `/ask-ai` exist; formalise as
   "apps" with manifests (name, commands, permissions), so schools can add bots (attendance bot,
   homework bot) through webhooks (see C4).
4. **Channel categories and permissions** in communities (read-only roles, slow mode exists,
   private channels, member roles with colours).
5. **Message translation** everywhere (exists for chats): add per-message "Translate" in
   comments, forums, announcements.
6. **End-to-end encrypted DMs (opt-in "Private chat")**: Signal-protocol-lite with WebCrypto
   (X25519 + AES-GCM, keys per device, server stores ciphertext only). No search/AI/moderation in
   those chats (say so clearly). Hard: do after A-phase.
7. **Voice messages:** speed 1.5×/2×, waveform scrub (transcripts exist and are searchable).
8. **Chat export** (PDF/HTML/JSON of one chat) and **chat backup** to the user's device.
9. **Status/stories** (exists as chatStatus): reactions, viewers list, privacy (close friends).
10. **Link previews** for YouTube/Docs/Boards/Tasks render rich cards (live task status, doc
    title + first lines).

### B8. Calls (Zoom-class → better than Zoom for classes)
1. **Call quality panel:** live bitrate/packet loss per person, "Your network is weak" with
   one-tap audio-only; post-call quality rating feeding `CallStat`.
2. **Meeting templates:** class, office hours (exists), parent meeting, interview, defence/viva
   (timer per speaker, panel), with default settings.
3. **Agenda and timer:** agenda items with times on screen; host advances; overrun warning.
4. **Hand gestures and reactions** detection (MediaPipe exists for backgrounds): raise hand by
   raising your hand on camera (opt-in).
5. **Live streaming** to YouTube/RTMP **[owner: Cloudflare Stream Live is paid]**; until then,
   webinar mode covers large audiences.
6. **Spatial audio** in big calls (Study Hall already pans by position).
7. **Interpreter channel:** a sign-language or spoken interpreter gets a pinned tile / separate
   audio track that listeners can choose.
8. **Smart framing / auto-zoom** on the speaker's face (MediaPipe face detection, crop on client).
9. **Recording upgrades:** chapters from notes, transcript with search, trim before saving,
   privacy blur for students who asked not to appear.

### B9. Docs, tasks, boards, code, files
**Docs**
1. Template gallery (lab report, essay, meeting notes, project brief, CV), "New from template".
2. **Page tree / wiki** per space (nested pages, breadcrumbs, backlinks).
3. **Suggestions mode** (track changes) with accept/reject per suggestion.
4. **AI writing assistant inline:** select text → Improve, Shorten, Explain, Translate, Fix
   grammar, Continue writing; one `spendAi` per action; shows a diff to accept.
5. Embeds: board, task list (live), code snippet that runs, video, PDF viewer, math (KaTeX).
6. Export PDF/DOCX/Markdown; import DOCX/Markdown.
7. Offline editing (Yjs + IndexedDB persistence), syncing when back online.
**Tasks**
8. Views: Kanban (exists), **List, Calendar, Timeline (Gantt)**, "My tasks across boards".
9. Subtasks, dependencies, recurring tasks, custom fields (priority, estimate, label), WIP limits.
10. **Automations:** "when moved to Done → notify X", "when due tomorrow → remind assignee",
    "when created in Bugs → assign to Y" (rules run in the request that triggers them; no cron
    unless time-based, then via the 15-minute precheck).
**Boards**
11. Template gallery (retrospective, mind map, SWOT, timeline, lesson plan), laser pointer,
    stamps, shape libraries (science, maths, geography), embed images from the files hub.
**Code**
12. More languages in the browser (JavaScript and Python run today, `src/lib/code-runner.ts`): **TypeScript (transpile in the worker)**, **SQL
    (sql.js)**, **C/C++ via Wasm (clang in wasm is heavy: lazy, optional)**; autograder for
    assignments (exists in code tests), GitHub import/export **[owner app]**.
**Files hub**
13. Folders, drag-drop upload with progress, previews (exists for PDF/images), versions, share
    links with expiry, storage quota per user/school, "recent", "starred", search by content
    (FTS over extracted text).

### B10. AI tutor and study tools
1. **Photo of a problem:** snap homework → step-by-step help (Socratic: hints first, answer on
   request), uses `geminiJsonImage`; maths rendered with KaTeX.
2. **Math and science rendering** everywhere AI answers (KaTeX for LaTeX, chemistry `\ce{}` via
   mhchem, code highlighting).
3. **Modes:** Explain like I'm 12 / exam mode (no answers, only hints) / teacher-set mode per
   course ("don't solve homework, only guide").
4. **Flashcards with FSRS** spaced repetition (replace simple scheduling), daily review
   reminders (push), cards from any selection (doc, transcript, chat).
5. **Practice tests** generated from "Ask your semester" memory with answer explanations linked to
   the class moment (smart replay timestamps).
6. **Voice tutor:** pronunciation practice for languages, viva practice (see D13).
7. **Teacher controls:** see anonymised common questions students asked the tutor per course
   (helps teaching), turn the tutor off before exams.

### B11. Skills passport and credentials
1. **W3C Verifiable Credentials** (VC 2.0, signed JSON-LD/JWT) alongside Open Badges 3.0;
   wallet export; QR verification page (exists for certificates: extend).
2. **"Add to LinkedIn"** buttons (certification URL scheme, no API needed).
3. **Public portfolio page** (opt-in): projects, skills with evidence, impact hours, badges,
   custom URL `/p/<handle>`, theme picker.
4. **CV builder** from the passport (templates, AI summary, PDF export), ATS-friendly.
5. **Employer verification portal:** employers verify a credential by code without an account.

### B12. Global impact
1. **SDG tagging and impact map:** projects on a world map (Leaflet + OpenStreetMap tiles are
   allowed in CSP; check), filter by SDG.
2. **Impact hours** verified (exists) → auto certificates at milestones (10/50/100 h).
3. **Donations of money** to NGO projects via Stripe Checkout (exists for billing) and **UPI via
   Razorpay [owner]**; receipts; 80G tax receipts for Indian NGOs (field on project).
4. **Impact challenges** (see D16), sponsor dashboards with live outcomes.
5. Carbon footprint tracker for campus clubs (simple activity log → kg CO₂e with standard
   factors).

### B13. Careers
1. **AI mock interview** (voice tutor tech): role-specific questions, feedback on answers,
   STAR structure, filler words.
2. Internship pipeline view (applied → interview → offer), reminders, documents.
3. **Alumni network** and mentorship booking (office-hours-style queue + calendar slots).
4. Company pages, job alerts (in-app/push), salary insights (crowd-sourced, anonymous, moderated).

### B14. Student life (campus super-app)
1. **Events with tickets:** RSVP, capacity, QR tickets (signed), check-in scanner for organisers,
   paid tickets via Stripe/Razorpay **[owner for Razorpay]**.
2. **Clubs:** pages, membership, elections (anonymous voting with verifiable tally), budgets.
3. **Marketplace:** buy/sell/swap books and items within the campus (verified students only),
   chat with seller, report.
4. **Campus map** with buildings/rooms (exists for rooms), live room occupancy from bookings,
   indoor directions (pre-drawn routes).
5. **Cafeteria menus** and pre-orders (admin posts menu; orders as a list; payments optional).
6. **Wellbeing:** mood check-in (private), resources, book a counsellor (office hours queue),
   anonymous "I need help" to BeeSafe (exists).
7. **Ride share / carpool** between students (verified), **housing board** (hostel/PG listings).
8. Transport: bus routes and live bus position **[owner: needs GPS device or driver phone app]**.

### B15. School administration (SIS)
1. **Admissions:** online application forms (form builder), document upload, review pipeline
   (stages, reviewers, scores), offer letters (PDF), enrolment → creates the student account.
2. **Fees:** fee structures per class, invoices, instalments, discounts/scholarships (exists
   partly), online payment (Stripe; **UPI/Razorpay [owner]**), receipts, defaulters list with
   gentle in-app reminders, accountant reports.
3. **Exams and report cards:** exam schedule (B6.4), marks entry grid, grading schemes (CBSE/
   ICSE/IB/GPA presets), report card templates (PDF, school branding), publish to students and
   guardians.
4. **Library:** catalogue (ISBN lookup via Open Library, free), issue/return with barcode/QR
   scanning (camera), fines, reservations.
5. **Hostel, transport, inventory/assets** (simple registers with QR tags).
6. **Custom roles and permissions:** admins create roles (e.g. Accountant, Librarian, Counsellor,
   Department head) with permission sets; replaces hard-coded ADMIN checks gradually
   (`can(user, 'fees.write')`).
7. **Bulk import/export:** CSV with preview, validation and undo (students, teachers, courses,
   enrolments, timetable).
8. **Staff:** leave requests, substitution planner (who covers an absent teacher), staff
   attendance.

### B16. Parents and guardians
1. **Guardian accounts** (today: links and emails): a guardian signs in (phone OTP or Google),
   links to children by code, sees a parent app: attendance, grades, deadlines, fees, events,
   weekly activity (exists), report cards.
2. **Parent–teacher messaging** with school rules (office hours, quiet hours, translation both
   ways, moderation).
3. **Parent–teacher meetings:** slot booking (office hours queue tech), video call, notes.
4. **Consent forms** with e-signature (trip permission, photo consent), tracked per child.
5. Fee payment for guardians (B15.2).

### B17. Notifications
1. Notification center: grouped by source, swipe to mark read/snooze, "Mark all read",
   filters (Mentions, Grades, Calls, Tasks), infinite list with skeletons.
2. Per-type settings matrix (in-app / push) and per-course mute.
3. Daily digest instead of many pushes (option), quiet hours (exists).
4. Rich push: images, actions (Reply in chat, Mark done, Join call).

### B18. Search everywhere (⌘K)
1. **Universal index:** extend the FTS approach (message search 0074, semester memory 0063) to
   docs, tasks, boards text, courses, materials, people, events, help articles: one
   `search_fts` with `kind`, `ref`, `scope` columns and triggers/indexers; access filtered by scope
   like semester search.
2. Command palette: actions ("New assignment", "Start call with…"), recent items, keyboard-first,
   fuzzy match, results grouped with icons; on phones a search tab.

### B19. Onboarding, profile and settings
1. Role-based onboarding checklist (exists as AccountSetupCard): interactive tours that point at
   real UI (coach marks), progress, skip.
2. Profile: cover photo, pronouns (optional), bio, links, skills, availability; avatar cropper.
3. Data: download my data (exists), delete account (exists), linked accounts, sessions.
4. Settings search, deep links to each setting.

### B20. Owner console
1. Organisation (school) list with plan, seats, usage, health; impersonate-as-view (read-only,
   logged).
2. Revenue (Stripe), churn, cohort retention charts.
3. Feature flags per org, gradual rollout percentage.
4. Content moderation queue across schools (safety flags from 4.10 roll up).

---

## Phase C: Platform capabilities the big companies have

### C1. Native apps on the App Store and Play Store [owner: Apple and Google developer accounts]
- Capacitor shell around the PWA (plan deferred on 6 Oct 2026, see memory "native-app-later").
- Native push (APNs/FCM) replacing web push on phones, biometric unlock (chat lock), share sheet
  into UniVerse ("Share to chat/assignment"), camera/document scanner for submissions, home-screen
  widgets (Up next, Streak) later, deep links (`universeimpact.com/...` opens the app).
- Offline: cache app shell + recent data (exists in PWA).

### C2. Multi-school SaaS
- **Organisation = school** with its own subdomain (`<school>.universeimpact.com`) or custom domain
  (Cloudflare for SaaS **[owner]**), branding (logo, colours, app name in the PWA manifest per
  host), self-serve signup with a trial, seat-based billing (Stripe exists), data isolation by
  `organizationId` on every query (add where missing; a lint rule or helper `scoped(user)`).
- School admin vs platform owner separation (owner console stays global).

### C3. Integrations
- **SSO:** Google Workspace (exists via Google sign-in), **Microsoft Entra ID (OIDC)**, **SAML
  2.0** for universities (via Firebase/Identity Platform **[owner: may need paid tier]** or a
  small SAML SP implementation).
- **LTI 1.3 Advantage** (exists basic): Deep Linking, Assignment & Grade Services, Names & Roles.
- **OneRoster 1.2** CSV/REST import (rosters from SIS), **Clever/ClassLink** for US K-12
  **[owner]**.
- **Google Classroom / Microsoft Teams import** (course + roster) via their APIs **[owner app
  registration]**.
- **SCORM 1.2/2004 and xAPI (cmi5)** content player: upload a SCORM zip, play in a sandboxed
  iframe on the files domain, track completion/score into module progress; an internal xAPI LRS
  table for statements.
- Calendar two-way sync (B6.2), cloud drives (Google Drive/OneDrive pickers) **[owner keys]**.

### C4. Public API, webhooks and apps
- Versioned REST API (`/api/v1/...`) with API keys per organisation (scoped, revocable), rate
  limited; OpenAPI spec generated from route definitions; developer docs page.
- Webhooks: `assignment.submitted`, `grade.posted`, `attendance.marked`, `message.created` (opt-in,
  per channel), signed with HMAC, retries with backoff (queue in D1 + 15-minute precheck).
- "Apps" registry (chat bots, LTI tools, webhooks) per school with install/uninstall.

### C5. Compliance and trust
- **India DPDP Act 2023** (consent manager, purpose limitation, data principal rights, breach
  notice), **GDPR** (exists partly: consents, export, delete), **FERPA** (education records
  access logs, directory information opt-out), **COPPA** (verifiable parental consent for
  under-13s; ties into 4.10 minors).
- Data retention settings per school (extend the daily retention job).
- Audit everything sensitive (grades changed, records viewed by admins).
- Trust center page: security practices, subprocessors, uptime.

### C6. Payments
- Stripe (exists). **Razorpay with UPI** for India **[owner account]** behind a provider
  interface (`src/server/payments/` with `stripe.ts`, `razorpay.ts`): fees, events, donations,
  marketplace. Refunds, receipts (PDF), reconciliation report.

### C7. Content marketplace
- Teachers publish courses/lesson packs (free or paid), ratings, revenue share **[owner terms]**;
  schools import packs into their courses (B2.3 copy logic).

### C8. Learning analytics warehouse
- Nightly export (owner/admin) of anonymised learning events to CSV/Parquet in R2; xAPI
  statements table; dashboards for schools comparing terms; research data requests with consent.

---

## Phase D: Features nobody else has (UniVerse's edge)

Each builds on something UniVerse already has. Privacy and consent first: students see and
control what is used.

### D1. Learning DNA: a live mastery map per student
- **What:** every concept in a course gets a mastery level per student, updated from quizzes,
  assignments (rubric criteria → outcomes), tutor questions ("asked about recursion 4×"), class
  pulse ("lost" during recursion), flashcard reviews. Students see a beautiful concept map (nodes
  glow as they're mastered) and "Next best thing to study"; teachers see a class heatmap (concept
  × student) and "re-teach these 3 concepts".
- **How:** `Concept` (course, name, parent), `MasteryEvent` (student, concept, signal, weight,
  at), `Mastery` (student, concept, level 0–1, confidence) recomputed incrementally (Elo/BKT-lite,
  pure function in `src/lib/mastery.ts`, unit-tested). Concepts proposed by AI from the syllabus
  once (teacher edits). Questions/rubric criteria tagged with concepts (AI suggests tags).
- **Unique because:** combines live-class signals + chat/tutor + assessments into one model.

### D2. Whisper TA: a private AI teaching assistant in every class call
- **What:** during a class, students can quietly ask "what does she mean by…?"; the TA answers
  privately from the course materials and the live transcript (last 10 minutes), and the teacher
  sees an anonymous live cluster of questions ("6 students asked about base cases") with a
  "Re-explain" nudge. Builds on captions (4.1), pulse (4.4), course tutor citations.
- **How:** a panel in `CallView` for students (class calls only); requests batched; teacher view
  aggregates by embedding similarity (simple keyword clustering first). Strict budget per class.

### D3. Lecture to everything (micro-lessons)
- **What:** each recorded class (study pack exists) also produces: a 5-minute **audio recap**
  (Gemini TTS **within AI budget**), **3–6 vertical "revision reels"** (clips cut at chapter
  boundaries from the recording, with burned-in captions generated in the browser via
  canvas/MediaRecorder on the teacher's device), a **mind map** (board AI exists), and a practice
  quiz (exists). Students swipe through reels like stories before exams.
- **Unique because:** auto-made short-form revision content from your own class.

### D4. Impact-to-Scholarship exchange
- **What:** verified volunteering hours and impact credentials (exist) become **Impact Credits**
  in a signed ledger. Sponsors (companies, NGOs, alumni) fund scholarship pools that students
  unlock with credits + academic standing; the school approves. Every credit is auditable (QR).
- **How:** `ImpactCredit` ledger (append-only, hash-chained rows), sponsor pools, claim workflow,
  admin approval, public verification page. Money stays outside (school pays scholarships); the
  platform tracks eligibility.

### D5. Peer tutoring time-bank
- **What:** students offer help in subjects they've mastered (D1 shows who's strong); learners
  book 20-minute sessions (office hours tech); tutors earn **time credits** they spend on getting
  help; sessions verified by call logs and ratings; strong tutors get a passport skill
  ("Peer teaching") with evidence.

### D6. Group project autopilot
- **What:** for a group assignment, an AI project manager: splits the brief into tasks (Tasks
  board), suggests owners by skills, finds a meeting time from everyone's timetable (planner
  data), schedules the call, nudges late tasks, and gives the teacher a weekly progress report
  with fair-contribution data (4.3).
- **How:** one AI request to plan, then deterministic scheduling; reuse tasks, scheduled calls,
  contributions.

### D7. Phone clicker for in-person classes
- **What:** in a physical classroom the teacher projects a code; students join on their phones:
  attendance (rotating QR exists), live polls/quizzes, "I'm lost" pulse, questions to Whisper TA,
  and the session becomes a study pack (teacher's laptop mic → transcript). Hybrid: remote
  students in the call see the same polls.
- **Unique because:** one session object ties in-room phones, the call, attendance and notes.

### D8. Language-free classroom
- **What:** everything readable in your language: materials (PDF → translated reader view),
  assignments (student answers in Hindi, the teacher reads English with the original one tap
  away), feedback (teacher writes English, the student reads Hindi), forums, announcements,
  captions (exists), chat (exists). Grading happens on the original; translation is marked.
- **How:** a shared `translations` cache keyed by content hash + language; translate on read with
  `spendAi(null)` site budget and caching; browser Translator API first (exists for captions).

### D9. Reading-level adapter
- **What:** any material or page can be rewritten at a chosen reading level (Grade 5 / Grade 8 /
  Original) and read aloud (TTS), with key terms glossed. For dyslexic, younger and
  second-language students. Teachers can pre-generate levels for a material.
- **How:** AI rewrite cached per material + level; accessibility settings (A5) default level.

### D10. Second-chance learning loop
- **What:** when a student fails a quiz question or rubric criterion, UniVerse builds a
  **remediation mini-course**: the exact class moments where it was explained (smart replay
  timestamps), 3 practice questions, one flashcard set, then a retake slot (if the teacher allows
  retakes). Completion feeds D1 mastery.

### D11. AI viva and oral-exam coach
- **What:** voice practice for vivas, debates, language orals and interviews with a rubric:
  the AI examiner asks follow-ups, scores clarity, depth, evidence; teachers can run a real
  low-stakes oral check (recorded, rubric-scored draft for the teacher to confirm).
- **How:** voice tutor (Gemini Live) exists; add rubric scoring and transcripts.

### D12. Honest AI receipts
- **What:** students attach an **AI usage receipt** to a submission: which AI help they used in
  UniVerse (tutor sessions, writing assistant actions) with timestamps, created automatically with
  their consent. Teachers set per assignment: "AI not allowed / allowed with receipt / free".
  Builds trust instead of AI-detector guessing.
- **Unique because:** integrity by transparency, not surveillance.

### D13. Wellbeing radar (opt-in, privacy-first)
- **What:** students may opt in to gentle check-ins; patterns (late-night study streaks, many
  "lost" pulses, missed deadlines, mood check-ins) produce private nudges ("You've had a heavy
  week, want to plan tomorrow lighter?") and, only with explicit consent, a counsellor alert.
- **How:** rules engine first (no AI on personal data by default), clear explanation screen,
  data never shared with teachers except consented counsellor alerts.

### D14. Impact League: inter-university SDG challenges
- **What:** seasonal challenges (e.g. "Clean water ideas"): team formation across universities
  (multi-campus network exists), mentors, milestones as tasks, demo day in webinar mode, judging
  with rubrics, sponsor prizes, credentials for all finishers, public showcase pages.

### D15. Classroom twin (live campus map)
- **What:** Study Hall (2D campus, 4.2) extended to real buildings: live occupancy of rooms from
  bookings and class calls, where your next class is, which study rooms are free, events
  happening now. Admins see campus usage heatmaps.

### D16. Parent co-pilot in their language
- **What:** each guardian gets a weekly 1-minute summary in their language (text + optional
  audio), can ask "How is Riya doing in maths?" and get an answer from records (never messages),
  and receives teacher voice notes auto-translated. Uses daily-brief and guardian tech.

### D17. Offline classroom relay (experimental)
- **What:** for low-connectivity schools: the teacher's laptop downloads the week's materials
  once; students' phones on the classroom hotspot fetch them from the teacher's device
  (WebRTC data channels after one online handshake, or a QR "pack" for small items).
- **How:** research spike first (2 days); ship only if reliable. Data-light mode (4.11) and offline
  packs exist as the base.

### D18. Skills-to-jobs bridge
- **What:** the passport's verified skills match live internships/jobs and NGO projects with an
  explanation ("You match 4 of 5 skills; finish 'SQL basics' module to match all"), linking the gap
  straight to a course module (B2) or peer tutor (D5).

---

## Phase E: Small features and polish (do alongside, in batches of ~10)

**Everywhere**
- Undo toasts for deletes/archives (5 s) instead of confirm dialogs where safe.
- Drag-and-drop file upload on every file field, paste images from clipboard.
- "Copy link" on every item (course, assignment, doc, task, event), with toast.
- Relative times with full date on hover/long-press; auto-refreshing ("2 min ago").
- Keyboard shortcuts sheet (`?`), consistent shortcuts (`N` new, `/` search, `E` edit).
- Bulk select and bulk actions in every list (archive, mark read, move, export).
- CSV export on every admin/teacher table; print-friendly views (report cards, attendance).
- Empty states with an action and a short illustration (SVG, themed).
- Error states with Retry and a "Report this" button (sends to error log).
- Sticky table headers, column sorting, saved filters, density toggle (comfortable/compact).
- Haptics on phones for key actions (exists: `haptic()`; use consistently).
- Long-press context menus on phones mirroring right-click on desktop.
- Image viewer with pinch-zoom, swipe between images (photo zoom exists: unify).
- Avatars with initials colours consistent per person; online dots everywhere (presence exists).
- Smooth scroll-to-new-content and "New items ↑" pill on live lists.

**Messaging**
- Pin chats limit 5 → 10; mute presets (8 h, 1 week, always); "Mark as unread" (exists);
  forward with comment; select multiple messages; jump to first unread; mention list view;
  draft indicator in the chat list (check: drafts sync since 1.4); typing indicator names in groups.

**Calls**
- "Leave call?" with "End for everyone" for hosts; device switch mid-call without rejoin; mirror
  toggle; noise level meter; "You're muted" hint when talking while muted (not built yet); call
  ringtone choice; join with camera off by default setting.

**Courses/assignments**
- Due-date countdown chips; "Mark as done" for non-graded items; submission drafts autosave
  indicator; rubric preview before submitting; teacher "duplicate assignment"; "Notify late
  students" one-tap.

**Calendar/planner**
- Week starts Monday/Sunday setting; time zone shown for online classes; add to Google Calendar
  button per event; colour picker per course.

**Profile/settings**
- Theme: auto/light/dark + accent colour choices (keep two-tone default); app icon choice (PWA
  manifest variants); language quick switch in the top bar.

**Admin**
- User impersonate (view-only) for support with audit; "Resend invite"; bulk role change;
  saved reports; scheduled report exports (in-app download, no email).

**Public site**
- Pricing page with INR/USD toggle, FAQ, testimonials, demo booking (office hours), status page
  link, blog/changelog (MDX), SEO (OpenGraph images per page; `opengraph-image` routes).

---

## 2. Order and size (suggested)

| Order | Block | Size | Why |
|---|---|---|---|
| 1 | A1 lint debt, A2 design system, A3 motion/loading pass | 3–4 rounds | The owner's top priority; makes every later feature consistent |
| 2 | A4 performance, A5 accessibility, A6 automated checks | 2 rounds | Speed and trust; checks protect later work |
| 3 | B2 modules, B3 grading view + gradebook, B4 question bank + exam mode | 3 rounds | Core LMS depth schools compare first |
| 4 | B16 guardian accounts, B15 fees/exams/report cards/admissions | 3 rounds | What schools pay for (SIS) |
| 5 | D1 Learning DNA, D10 second chance, D2 Whisper TA | 2–3 rounds | Signature differentiators, build on Stage 3–4 |
| 6 | B7–B9 messaging/calls/docs/tasks power features | 2–3 rounds | Parity with Slack/Zoom/Notion |
| 7 | C2 multi-school SaaS, C3 SSO/LTI Advantage/OneRoster, C5 compliance | 3 rounds | Sell to many schools |
| 8 | C1 native apps [owner accounts] | 1–2 rounds | Store presence |
| 9 | D3–D9, D11–D18 | 4+ rounds | The rest of the edge |
| 10 | B10–B14, B17–B20, C4, C6–C8 | ongoing | Depth everywhere |
| — | Phase E small items | in every round | ~10 per round |

A "round" ≈ one long agent session. Mark each item in Progress as it lands.

---

## 3. Definition of done (every item)

1. Works for each role it touches; sample mode stub added.
2. Skeleton, empty, error states; entrance animation; optimistic where it's a quick action.
3. Phone layout checked at 375 px (no horizontal scroll, 44 px touch targets).
4. Keyboard and screen-reader basics (labels, focus).
5. `pnpm typecheck`, eslint on changed files (0 new errors), call-room tests if `CallRoom`
   changed, unit tests for new pure logic.
6. Free-plan limits respected (queries, subrequests, AI budget, no email).
7. Progress row added below with what was checked and what needs a real device/key.

---

## Progress (keep this up to date, so either agent can take over)

> **Taking over?** Read `STAGE-5-HANDOFF.md` first: where things stand, what's next, the owner's rules and how to test.

**Branch:** `claude/great-hamilton-8g8xdm` (from `main`). One commit per item; push at
checkpoints; merge only when the owner says "merge". **Next migration: `0084`.**

| ID | Item | State | Where / notes |
|---|---|---|---|
| — | Stage 4 complete | **Done** | See STAGE-4-PLAN.md |
| — | Hotfix: requests hanging on a fresh Worker | **Done, merged (PR #44)** | `src/lib/db.ts`: Prisma's ClientEngine shares its connect promise; on Workers the waiting requests were cancelled as hung (HTTP 500 after ~33 ms, in bursts on dashboard load). Each request uses its own client until one has connected. Check production logs: "code had hung" should be gone. |
| A1 | Lint and type debt to zero | **Done** | `npx eslint src cloudflare scripts`: 371 errors → **0**, 162 warnings → 42. `pnpm lint` now lints those folders; rules in AGENTS.md. New helpers: `src/lib/use-now.ts` (`useNow` 30 s shared clock, `useTick`), `src/server/body.ts` (`Body`/`Query`, `oneOf`, `str`, `text`, `strings`, `first`), typed `pick<Prisma.XInput>()`, `errorMessage()` in `lib/api.ts`. ~25 old pages moved to SWR. **Bugs found and fixed:** anyone could attach calendar events to any course; scholarships/partners passed whole request bodies to the DB; admin announcements never reached the server (local only); scholarship statements, medical allergies/conditions/medications, consents (`isGranted` vs `granted`), major-change requests (`newMajor` vs `requestedProgram`, APPROVED vs ACCEPTED) never saved or showed; NGO SDG numbers, group avatars, late attendance labels wrong. **Needs a real check:** admin announcements create/edit/delete, consents toggles, medical lists, scholarship apply, major-change request. |
| A2 | One design system | **Done** | `.panel` (frosted card) in globals.css replaced 33 copies; 63 per-file card/field strings now `.panel`/`.input`. Kit: `Sheet` (moved from chat; real dialog: role, labelled, Escape, focus trap/return), `Avatar`/`AvatarStack` (moved from MessageBubble), new `EmptyState`, `ListSection`/`Cell`, `Field`/`SearchField`, `Badge`, `ProgressRing`, `LoadError`. Hand-rolled primary buttons → `btn-primary`/`btn-danger`. **`src/components/ui/README.md`** lists every class/component and when to use it. Not done: `Menu`/`ContextMenu`, `Tooltip` (none needed yet; build when a feature needs them). |
| A3 | Motion and loading pass | **Done, merged (PR #45)** | Static audit (scratch script; re-run idea for A6): of 134 pages that load data, 122 have skeletons, 123 empty states, 132 error states. Remaining without are forms/live screens (sign-in, join, verify, voice tutor, live class, hall, BeeSafe, billing) where those states don't apply. ~20 pages got skeletons, 10 got `LoadError` with Retry, admin home a skeleton. Page entrances are global (`PendingPage`), pull-to-refresh is global (`PullToRefresh`). Reduce Motion: CSS loops stop and CSS slides become fades (calm, not frozen, like `motion.ts`). Optimistic: most quick actions already were; knowledge-hub visibility now too. **List → detail:** `src/lib/shared-element.ts` (FLIP with the Web Animations API; the card title glides into the detail page's title; mark both with `data-shared` / `Topbar sharedId`): impact rooms, task boards, code rooms, assignments, docs. **CLS:** `node scripts/cls.mjs` (Playwright, demo login, phone + desktop): 48/48 pages under 0.05 after moving the calendar's FeatureGuide below the grid. |
| A5 | Accessibility (WCAG 2.2 AA) | **Done, merged (PR #46)** | **Settings → Appearance:** text size (4 steps), bold text, more contrast, OpenDyslexic (self-hosted, `public/fonts/opendyslexic`, OFL), underline links, captions on by default in calls; all applied before first paint (`DISPLAY_PREFS_SCRIPT`). **Audit:** `node scripts/a11y.mjs [url] [--theme dark] [--all] [--quick] [--only /a,/b]` (axe-core dev dependency, Playwright, demo login; 40 pages in `ALL_PAGES` of `scripts/browser-session.mjs`, `--quick` = the 25 in `PAGES`; waits for entrance animations). Light: 222 contrast + 23 other serious issues → **0**; dark → **0**. **How:** light-mode greys darkened (`@theme` zinc-400/500/600; dark keeps its own); coloured text uses deeper tints in light mode (unlayered rules in globals.css, not inside `.dark` wrappers or the call room `.on-dark`); dark-only class strings got light colours (tinted pills, links, zinc-300); legacy dark-only pages (credentials, support, collaborations, directory) made theme-aware with `dark` on their always-dark dialogs/buttons; ~55 icon buttons, ~50 selects and ~20 inputs labelled; avatar initials are decoration (CSS `attr()`); badge counts aria-hidden at 4.5:1. **Keyboard:** unlayered `:focus-visible` ring (utilities' `outline-none` can't hide it), "Skip to content" link to `main#main`; sheets already trap/return focus and close on Escape. **Screen readers:** chat messages are a `role=log` (announced); sonner toasts are a live region. **`/accessibility`:** conformance statement (partially conformant, how we test, settings, known limitations). **Not done:** a full heading-order/landmark review of all 142 pages (axe found none on the 40). |
| A6 | Automated checks | **Done, merged (PR #46)** | **Unit tests:** `pnpm test` (vitest dev dependency; `*.test.ts` next to the code; server modules run with the database and services mocked in `src/server/test-setup.ts`). **151 tests**: chat search, local time/quiet hours, Study Hall hearing, @mentions, safety quick check + isMinor, nextMorning (time zones, DST), body helpers + pick, school analytics, safeHref, search words, month buckets, course colours, campus items, plan limits. Not covered yet: `tidyDiagram` (not exported), grading maths (no shared module; grades are computed in services). **Crawl:** `node scripts/crawl.mjs [url] [--only student\|teacher\|admin] [--paths /a,/b] [--json out]` visits every static page (from the app folder) as its demo role and reports error screens/overlays, uncaught and console errors, failed or 5xx requests, pages stuck on a skeleton. Under `next dev` it ignores the realtime ticket 503 (no Durable Objects there) and counts Next's dev badge only when it turns red. **Result (8 Oct):** 136/136 pages clean (13 needed a second run after the dev server restarted). |
| — | Hotfix: Google/Apple sign-in blocked as a pop-up | **Done, merged (PR #46)** | Firebase loaded Google's sign-in helper after the tap on desktop Chrome/Edge/Firefox and only then opened the window, too late for the browser's pop-up allowance on slow connections. `warmUpPopupSignIn()` (`src/lib/firebase.ts`) loads it when /login and /register open. Couldn't test the full Google flow here (the sandbox can't reach Google): check it live. |
| A4 | Performance budget | **In progress** | **Web Vitals (done):** 10% of page loads send LCP/INP/CLS/FCP/TTFB once, on page hide (`src/lib/web-vitals.ts`, via Next's `useReportWebVitals` in `ErrorMonitorBootstrap`), anonymous, skipped in low-data mode/Save-Data → `POST /api/vitals` (same-site only, validated) → `web_vitals` table (**migration 0075**, kept 30 days by the daily job) → owner console **Analytics → Speed for real people**: p75 by device and for the 15 most-measured pages, 7 or 30 days, green/amber/red by Google's thresholds (one window-function query each). **Bundles (8 Oct, `pnpm build && node scripts/bundle-report.mjs`):** React + Next alone are **134 KB** gzipped on every page, so the plan's < 120 KB for public pages can't be met with Next's App Router; the root layout (motion, toasts, call host, nav) brings public pages to ~200 KB and the dashboard frame adds ~46 KB (median dashboard page **263 KB**). Done: `/login` 306 → 254 KB and `/register` 312 → 260 KB (phone sign-in + its phone-number library load on demand), settings 337 → 271 KB (sections load when opened), admin analytics charts load on their own, Web Vitals code only on sampled loads, `/teacher/calendar` 308 → 270 KB and `/student/quizzes` 302 → 267 KB (they imported one helper each from CourseBoard and got the whole board; now `src/lib/ics.ts`, `components/quizzes/QuizReview.tsx`). Fonts: system fonts, nothing to download (OpenDyslexic only when turned on). Images: photos over 600 KB are shrunk in the browser before upload (≤ 2048 px WebP, `src/lib/shrink-image.ts`, via `uploadChatFile`). **Suggested targets instead:** public < 210 KB, dashboards < 270 KB now, then lower. `/application` 324 → 280 KB (Firebase loads only to sign out), blackboard 296 → 286 KB (class sessions tab and quiz manager load when opened). **Now:** every dashboard page ≤ 286 KB (median 263 KB); heaviest: /console 339 (owner only), blackboard 286, /application 280, /calls 276 KB. **Not done:** 3-size responsive images (needs storing -sm/-md/-lg and changing every image tag), API caching / N+1 review. |
| B2.1 | Course modules | **Done** | **Migration 0076** (`course_modules`, `module_items`, `item_progress`). Course board → **Modules** tab (`components/dashboard/CourseModules.tsx`, loaded when opened). Teachers: modules with title/summary, show to students or not, open date, unlock after a quiz at N%; items = page (text), file (from Materials), link, video, quiz, assignment, live class (calendar event); reorder modules and items; each item shows how many students finished it. Students: **Next up**, a ✓ per item (opening a page/file/link/video/class ticks it; quizzes and assignments tick when handed in), progress ring per module, locked modules show why ("Opens Thu 15 Oct", "Unlocks after Quiz 1 (60% or more)") and hide their content. Rules in `src/lib/course-modules.ts` (13 tests); server `src/server/course-modules.ts`, `GET/POST /api/courses/[id]/modules` (refs checked to belong to the course, links http(s) only, students can only tick); live refresh to the class (capped by `livePushes`); sample-mode stub. Checked: API end to end as teacher and student, the tab at 390 px in light and dark, axe clean (also fixed white-on-course-colour chips with `courseShade`). **Not yet:** drag-and-drop ordering, prerequisites other than a quiz score. |
| B3.1 | Grading view: speed | **Partly done** | `/teacher/assignments/[id]`: **J / K** move between students (ignored while typing or in a dialog), returning a grade jumps to the next answer still to grade, and a "N of M returned" bar. Checked in a browser with three answers. Already there: student list, rubric with per-criterion AI suggestions, feedback studio, similarity and style signals. **Not yet:** rubric level keys (1–5), inline annotation of PDFs/images (submissions are text today). |
| B3.4 | Gradebook: categories and final grades | **Done (first part)** | **Migration 0077** (`grade_categories`, `grade_assessments`). Teacher Grade Book → **Categories**: categories with a weight (% of the final) and "drop lowest N"; each assessment (by name) goes in a category, so later grades for it count there too. The table shows the **final** (weighted) % and a letter (A ≥ 90 … F, GPA 4–0); the student drawer shows each category's average and drops. **Final grades** CSV (one row per student: category averages, final, letter) next to the all-grades CSV. Maths in `src/lib/gradebook.ts` (15 tests): empty categories don't pull the final down; grades in no category share what's left of 100% (none left: they don't count, the drawer shows them as Other). API `GET/POST /api/courses/[id]/grade-categories` (teacher changes, students read; live refresh); sample stubs. Checked: API as teacher/student, page at 390 px, axe clean (also made the table scrollable by keyboard). Students' Grades page uses each course's weighted final too (`/grades/student` now returns the categories). **Not yet:** per-school letter scales, mute/post grades, LTI AGS export, grade history audit. |
| B4.6 | Quiz item analysis | **Done** | Quiz manager (Manage on a quiz) → **How the questions worked**, from 2 students up: % right per question, whether it separates strong from weak students (top vs bottom 27%), answer counts per option, blanks, and plain-word flags (most got it wrong, reversed: better students got it wrong, a wrong option more popular than the right one, options nobody chose, everyone right); questions to check listed first; quiz consistency (KR-20) from 5 students and 3 questions. Computed on the server from the answers (`src/lib/item-analysis.ts`, 6 tests); answers aren't sent to the browser. Checked in a browser at 390 px, axe clean. |
| B4.3–4.4 | Shuffle and exam mode | **Done (first part)** | **Migration 0078** (`quizzes.shuffle`, `quizzes.examMode`, `quiz_submissions.integrity`, `quiz_attempts`). Quiz manager: **Shuffle questions and answers** (each student their own order, the same on reload; seeded, `src/lib/seeded-shuffle.ts`, 5 tests; grading compares answer text so it's unaffected) and **Exam mode**: `POST /quizzes/:id/start` starts the clock once on the server (reloading doesn't reset it), the page asks for full screen and counts leaving the page, pasting and leaving full screen; the submission stores those counts plus minutes past the time limit (2 min grace) and "no start" for offline attempts; teachers see them under Results as signals, not verdicts. Students see a plain notice of what's noted. No webcam or recording. Checked: API end to end (order stable per student, key hidden, start kept, score right, integrity stored, start refused after submitting) and the student flow in a browser. **Not yet:** one-question-without-going-back option, question pools/variants, a hard stop that refuses answers after time. |
| B4.1 | Question bank | **Done (first part)** | **Migration 0079** (`question_bank`). Teacher Quizzes → **Quizzes / Question bank** switch: per course, reusable multiple-choice questions with tags and difficulty; search and filter; **New question**; **Import CSV** (question, options A–F, right answer as a letter or text, points, tags, difficulty; header row optional; comma or semicolon; preview with skipped lines and why); select questions and **Add to quiz**; quiz manager → **Save to the question bank** per question (duplicates refused). Rules and CSV parsing in `src/lib/question-bank.ts` (11 tests); `GET/POST /api/courses/[id]/question-bank` (teacher only; inserts in groups of 8 for D1's 100-value limit; up to 2,000 questions per course, 200 per import request). Checked: API (student 403, bad rows skipped, foreign quiz refused) and the page at 390 px with a CSV import, axe clean. **Not yet:** QTI/GIFT import, question types beyond multiple choice, random pools per quiz. |
| B15.3 | Report cards | **Done (first part)** | **Migration 0080** (`report_card_runs`, `report_cards`). Admin → Insights → **Report cards** (`/admin/reports/report-cards`): start a round for a term (name, first and last day); cards are made **25 students per request** with a progress bar (the browser asks for the next batch, so nothing runs long on Workers; "Update cards" re-reads grades and attendance and keeps comments). Each card: every course's weighted final from the gradebook categories (B3.4) for grades given in the term, letter grade, attendance (present + late out of classes held; excused don't count), overall average, GPA (4.0) and attendance (`src/lib/report-card.ts`, 6 tests). Round view: totals (average, below 60%, comments written), search, sort lowest first, a comment per card (saved on leaving the box), **print one card or all** (self-printing page, one sheet per student, "Save as PDF"), **Publish** (confirm; in-app notification to each student, no email) / **Take back** / Delete; audit-logged. Student **Grades → Report cards** (only when one is published): average, GPA, attendance, each course, the comment, Print. Demo admin can't write (read-only, as for every admin write). `requireAdmin`'s 403 now says "Only organization admins can do this." (it said "…manage billing" on every admin route). **Guardians:** the guardian link page (`/guardian/<token>`) shows the published cards too, with Print, without the student's email. **Not done:** grading scheme presets (CBSE/ICSE/IB), school logo on the card, marks-entry grid. |
| B16.1 | Guardian accounts | **Done (first part)** | **Migration 0081** (`guardian_links`, `guardian_invites`); role `GUARDIAN` (users.role is TEXT, no change). **Done:** sign-up option "Parent or guardian" (role at once, no approval); `homeFor()` (`src/lib/role-home.ts`) for login/register/app redirects (mentors now go to /student, not /admin); **allowlist** in `src/server/auth.ts` (`guardianBlocked`, used by `getSessionUser` and the core router): parent accounts reach only `/api/parent/*`, their own account, notifications, realtime, bootstrap; guardians left out of chat people search; `src/server/guardian-accounts.ts` (8-char codes, single use, 7 days, max 10 children / 6 parents, in-app notices both ways, no email) + `/api/parent/children` (GET, POST link, DELETE unlink) + `/api/student/guardian-accounts` (GET, POST code / cancel-code / remove); child view shared with the guardian link page (`src/server/guardian-view.ts`, `components/guardian/ChildView.tsx`); dashboard layout gives guardians a minimal frame and keeps them on **/parent** (child switcher, link form, updates, account: sign out / delete); admin/owner role labels and filters; 6 tests. Student **Settings → Parent or guardian → Link a parent’s account**: make a code (shown as ABCD-2345, copy, cancel), see linked parents, remove one. Sample stubs. **Tested** (local, test parent via `DEMO_ACCOUNT_EMAILS`): blocked APIs (401/403), code once only, wrong code message, link, student notified, unlink; parent redirected from /student to /parent; axe clean on both pages at 390 px. The test found that login's `/auth/me` was refused for parents (now allowed). Also fixed: `errorMessage()` ignored `authedJson` errors, so many toasts showed the generic text instead of the server's message; Settings' hidden list pane is now `inert` (axe). **Not done:** B16.2–16.5 (messaging, meetings, consent forms, fees). |
| B16.2 | Parent–teacher messages | **Done** | **Migration 0082** (`conversations.aboutStudentId`, `school_policy.parentMessaging` default on, `parent_contact_hours`). A parent–teacher chat is an ordinary 1:1 chat marked with the child, so the **teacher answers from their normal inbox** (translation, read receipts, the chat safety check now also covers chats with a GUARDIAN); **parents never touch the chat API**: `src/server/parent-messages.ts` + `/api/parent/chats` (GET ?studentId: the child's teachers with our chat, unread, last message, the teacher's hours; POST start) and `/api/parent/chats/:id` (GET messages, marks read, `seenAt`; POST `{ body }` text only, 30 a parent per hour; POST `{ lang }` reading language, recent teacher messages translated once with the site's AI allowance). Rules: a parent writes only to teachers of a linked child, a teacher only to parents of students in their classes (`/api/teacher/parents` GET/POST); **hours for parents** (`src/server/parent-hours.ts`, Settings → Notifications for teachers: days, from/to, on/off): outside them a parent's message arrives without a push to the teacher (`chat-notify.ts`), and the parent sees when to expect a reply; quiet hours, moderation and pause-sender apply as in any chat; Admin → Safety → Policy switch "Parent–teacher messages". Notification links for parents go to `/parent?chat=<id>` (opens the right child and chat). UI: parent app **Schoolwork / Messages** switch (`components/guardian/ParentMessages.tsx`: teachers list, chat sheet with optimistic send, Show original / Translate, Seen, hours note); teacher Students page **Message a parent** (`components/guardian/MessageParent.tsx`) and **Message student** now opens a real chat (it was a fake toast). Also fixed: the inbox didn't open `?c=<id>` when reached by an in-app move (Calls links had the same bug); the generic "start a chat" route no longer reuses a parent chat. 7 unit tests (`parent-hours.test.ts`), allowlist tests extended (parents can't reach `/api/chat/*` or teacher routes). **Tested locally** (test parent via `DEMO_ACCOUNT_EMAILS`): parent writes → teacher inbox shows it with a notification → teacher replies → parent reads, notification link opens the chat, language saved, Seen; blocks (parent on chat API 401, wrong teacher 404, student 403, unlinked child 404); hours save/refuse empty days; Students page flows; axe clean at 390 px. Pushes need VAPID keys (not checked). **Not done:** a "Parent" badge in the teacher's chat list (the chat's first line says who and which child), photos/files from parents. |
| B16.4 | Consent forms with e-signature | **Done** | **Migration 0083** (`consent_forms`: title, body, optional attachment, class or whole school, answer-by date, "can say no", closed/reminded; `consent_responses`: one per form and child, YES/NO, note, typed name, optional drawn signature as SVG path data, who signed and when). `src/server/consent-forms.ts`: **senders** `/api/consent-forms` (GET my forms, admins all, with answered counts; POST send: teachers to one of their classes, admins to any class or every student; attachment must be an uploaded file) and `/api/consent-forms/:id` (GET every student: agreed / declined / waiting / no parent account, with who signed, typed name, time, note; POST `remind` (parents still to answer, at most once in 12 h), `close`, `reopen`); **parents** `/api/parent/forms` (forms for their children, open or closed in the last 30 days, each child's answer, waiting count) and `/api/parent/forms/:id` (POST per child: answer, note, typed full name, "I sign electronically" box required, optional drawn signature; changeable until closed; only linked children in the form's class; "agree only" forms refuse NO). Parents are told in the app + push (never email; 900 in-app max per send, pushes within the plan); the sender is told once when every parent with an account has answered. Notification links: parents `/parent?tab=forms&form=<id>`, teachers `/teacher/forms?form=<id>`, admins `/admin/administrative?tab=forms&form=<id>`. UI: parent app **Schoolwork / Messages / Forms** (badge with forms to sign; `components/guardian/ParentForms.tsx`: to sign / answered lists, form sheet with attachment, per-child ticks, Yes/No, note, typed name, signature pad); senders `components/guardian/ConsentFormsManager.tsx`: teacher **Students → Parent forms** tab (`/teacher/forms`), admin **Administrative → Consent forms** tab; new form sheet (class, text, attachment, date, "can say no"), progress bars, tracking sheet with counts, filter, remind, close/reopen, **Download answers** (CSV made in the browser). The shared `Sheet` title is now an `h2` (heading order). Sample stubs. 7 unit tests (`consent-forms.test.ts`: signature, typed name, dates, links) + allowlist tests. **Tested locally**: send (teacher), parent told, sign / change / closed refused, other child 404, staff 403, agree-only, remind once per 12 h, everyone-answered notice once, admin sees all and a teacher can't see the school's form; screens for all three; axe clean at 390 px light and dark. The demo admin can't write locally (by design), so the school-wide send was checked with a form added to the local database. **Not done:** paper copies (print view), a drawn-signature viewer for senders (it's stored; the list says "drawn signature"), forms for one student only.
