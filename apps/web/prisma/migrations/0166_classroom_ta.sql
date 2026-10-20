-- Stage 5 · Q22 (D7 leftover): the class TA answers questions asked in an in-person class, as it does
-- in class calls (Whisper TA, D2): from the course's materials and the class notes taken so far.
-- Only the student who asked sees the answer; the teacher still sees the question without a name.
ALTER TABLE "classroom_questions" ADD COLUMN "answer" TEXT;
ALTER TABLE "classroom_questions" ADD COLUMN "citations" TEXT;
ALTER TABLE "classroom_questions" ADD COLUMN "grounded" BOOLEAN NOT NULL DEFAULT false;
