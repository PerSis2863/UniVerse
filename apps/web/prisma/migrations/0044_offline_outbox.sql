-- Upgrade 4, offline-first classroom: work done with no connection is sent later from the
-- device's outbox. A client id makes a retried send save once; quizzes and assignments keep when
-- they were really done on the device (a quiz finished after its due date waits for the teacher).
ALTER TABLE "messages" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "messages_senderId_clientId_key" ON "messages"("senderId", "clientId");
ALTER TABLE "quiz_submissions" ADD COLUMN "clientId" TEXT;
ALTER TABLE "quiz_submissions" ADD COLUMN "offlineStartedAt" DATETIME;
ALTER TABLE "quiz_submissions" ADD COLUMN "offlineAt" DATETIME;
ALTER TABLE "quiz_submissions" ADD COLUMN "offlineStatus" TEXT;
ALTER TABLE "assignment_submissions" ADD COLUMN "offlineAt" DATETIME;
