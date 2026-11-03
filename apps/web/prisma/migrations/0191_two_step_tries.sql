-- M78: the admin sign-in code's tries, kept in the database (they were in one server's memory, and
-- the count never added up). Five tries within 15 minutes of each other lock the code step.
ALTER TABLE "users" ADD COLUMN "twoStepTries" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "twoStepTriedAt" DATETIME;
