# Stage 5 handoff (for the next agent)

Read this first, then `STAGE-5-PLAN.md`: the plan has every item, and its **Progress** table says what's
done, where the code is and what's left for each item. Keep that table up to date as you go.

## Latest (14 Oct 2026): read this first

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
  limit, waitlist and sections (rest of Q5.6, **0135**), rich lesson pages (Q5.2). Each has a Progress
  row. **Left in Q5:** Common Cartridge import/export (Q5.8). **Next migration: `0136`.**
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

