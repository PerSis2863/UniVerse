-- Stage 5 · A8 security: passkeys (sign in with the device's fingerprint, face or PIN; the second
-- step for admins without an email), signing out one device (the sign-in moments it may no longer
-- use, and each sign-in's moment in the history), and the browser's reports of blocked content
-- (Content-Security-Policy, kept small: one row per kind of report, counted).
CREATE TABLE "passkeys" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "alg" INTEGER NOT NULL,
  "signCount" INTEGER NOT NULL DEFAULT 0,
  "lastChallengeAt" REAL NOT NULL DEFAULT 0,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" DATETIME,
  CONSTRAINT "passkeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "passkeys_credentialId_key" ON "passkeys"("credentialId");
CREATE INDEX "passkeys_userId_idx" ON "passkeys"("userId");
ALTER TABLE "users" ADD COLUMN "revokedSessions" TEXT;
ALTER TABLE "login_events" ADD COLUMN "sessionAt" INTEGER;
CREATE TABLE "csp_reports" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "directive" TEXT NOT NULL,
  "blocked" TEXT NOT NULL,
  "page" TEXT NOT NULL,
  "sample" TEXT,
  "count" INTEGER NOT NULL DEFAULT 1,
  "firstAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "csp_reports_key_key" ON "csp_reports"("key");
CREATE INDEX "csp_reports_lastAt_idx" ON "csp_reports"("lastAt");
