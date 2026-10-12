-- Migration 0118: Peer Tutoring Time-Bank (Stage 5 · D5)
-- Student time-banking ledger, D1 Learning DNA mastery-matched tutor profiles,
-- 20-minute session booking, call log & peer rating verification, and automated
-- Skill Passport 'Peer Teaching' evidence issuance.

CREATE TABLE IF NOT EXISTS "peer_time_bank_accounts" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE SET NULL,
  "balanceCredits" INTEGER NOT NULL DEFAULT 3,
  "creditsEarned" INTEGER NOT NULL DEFAULT 0,
  "creditsSpent" INTEGER NOT NULL DEFAULT 0,
  "sessionsCompletedAsTutor" INTEGER NOT NULL DEFAULT 0,
  "sessionsCompletedAsLearner" INTEGER NOT NULL DEFAULT 0,
  "totalMinutesTutored" INTEGER NOT NULL DEFAULT 0,
  "averageRating" REAL NOT NULL DEFAULT 0,
  "ratingsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "peer_time_bank_accounts_user_idx" ON "peer_time_bank_accounts"("userId");
CREATE INDEX IF NOT EXISTS "peer_time_bank_accounts_org_idx" ON "peer_time_bank_accounts"("organizationId");

CREATE TABLE IF NOT EXISTS "peer_time_credit_transactions" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "peer_time_bank_accounts"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "referenceId" TEXT,
  "description" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "peer_time_credit_tx_account_idx" ON "peer_time_credit_transactions"("accountId");
CREATE INDEX IF NOT EXISTS "peer_time_credit_tx_user_idx" ON "peer_time_credit_transactions"("userId");
CREATE INDEX IF NOT EXISTS "peer_time_credit_tx_created_idx" ON "peer_time_credit_transactions"("createdAt");

CREATE TABLE IF NOT EXISTS "peer_tutor_profiles" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE SET NULL,
  "headline" TEXT,
  "bio" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT 1,
  "subjects" TEXT NOT NULL DEFAULT '[]',
  "badgeIssued" BOOLEAN NOT NULL DEFAULT 0,
  "badgeIssuedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "peer_tutor_profiles_user_idx" ON "peer_tutor_profiles"("userId");
CREATE INDEX IF NOT EXISTS "peer_tutor_profiles_active_idx" ON "peer_tutor_profiles"("isActive");

CREATE TABLE IF NOT EXISTS "peer_tutor_slots" (
  "id" TEXT PRIMARY KEY,
  "tutorId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "dayOfWeek" INTEGER,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "date" TEXT,
  "isBooked" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "peer_tutor_slots_tutor_idx" ON "peer_tutor_slots"("tutorId");
CREATE INDEX IF NOT EXISTS "peer_tutor_slots_booked_idx" ON "peer_tutor_slots"("isBooked");
CREATE INDEX IF NOT EXISTS "peer_tutor_slots_date_idx" ON "peer_tutor_slots"("date");

CREATE TABLE IF NOT EXISTS "peer_tutoring_sessions" (
  "id" TEXT PRIMARY KEY,
  "tutorId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "learnerId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organizationId" TEXT REFERENCES "organizations"("id") ON DELETE SET NULL,
  "courseId" TEXT REFERENCES "courses"("id") ON DELETE SET NULL,
  "topic" TEXT NOT NULL,
  "conceptName" TEXT,
  "scheduledAt" DATETIME NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 20,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "callRoomId" TEXT NOT NULL,
  "callDurationSeconds" INTEGER NOT NULL DEFAULT 0,
  "callVerified" BOOLEAN NOT NULL DEFAULT 0,
  "learnerRating" INTEGER,
  "learnerFeedback" TEXT,
  "feedbackTags" TEXT NOT NULL DEFAULT '[]',
  "tutorNotes" TEXT,
  "creditTransacted" BOOLEAN NOT NULL DEFAULT 0,
  "evidenceId" TEXT REFERENCES "skill_evidence"("id") ON DELETE SET NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);

CREATE INDEX IF NOT EXISTS "peer_tutoring_sessions_tutor_idx" ON "peer_tutoring_sessions"("tutorId");
CREATE INDEX IF NOT EXISTS "peer_tutoring_sessions_learner_idx" ON "peer_tutoring_sessions"("learnerId");
CREATE INDEX IF NOT EXISTS "peer_tutoring_sessions_scheduled_idx" ON "peer_tutoring_sessions"("scheduledAt");
CREATE INDEX IF NOT EXISTS "peer_tutoring_sessions_status_idx" ON "peer_tutoring_sessions"("status");
CREATE INDEX IF NOT EXISTS "peer_tutoring_sessions_room_idx" ON "peer_tutoring_sessions"("callRoomId");
