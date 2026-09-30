-- Withdrawing the application made at sign-up now cancels the account setup (the person goes
-- through registration again) instead of leaving a student account. Apply that to accounts that
-- withdrew before this change.
UPDATE "users" SET "onboardedAt" = NULL, "accountType" = NULL
WHERE "role" = 'STUDENT' AND "id" IN (
  SELECT ra."userId" FROM "role_applications" ra
  WHERE ra."source" = 'SIGNUP' AND ra."status" = 'WITHDRAWN'
    AND NOT EXISTS (SELECT 1 FROM "role_applications" r2 WHERE r2."userId" = ra."userId" AND r2."createdAt" > ra."createdAt")
);
