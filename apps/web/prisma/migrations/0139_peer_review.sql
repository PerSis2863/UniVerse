-- Stage 5 · B3.2: anonymous peer review (src/lib/peer-review.ts). peerReviews: how many answers each
-- student reviews (0: none); peerDueDate: when reviews are due (after it, students see the reviews of
-- their own work; without one, once the teacher returns their grade).
ALTER TABLE "assignments" ADD COLUMN "peerReviews" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "assignments" ADD COLUMN "peerDueDate" DATETIME;

CREATE TABLE "peer_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "criteria" TEXT,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    CONSTRAINT "peer_reviews_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "peer_reviews_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "assignment_submissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "peer_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "peer_reviews_submissionId_reviewerId_key" ON "peer_reviews"("submissionId", "reviewerId");
CREATE INDEX "peer_reviews_assignmentId_idx" ON "peer_reviews"("assignmentId");
CREATE INDEX "peer_reviews_reviewerId_idx" ON "peer_reviews"("reviewerId");
