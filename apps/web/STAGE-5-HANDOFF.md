# Stage 5 handoff (for the next agent)

Read this first, then `STAGE-5-PLAN.md`: the plan has every item, and its **Progress** table says what's
done, where the code is and what's left for each item. Keep that table up to date as you go.

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
