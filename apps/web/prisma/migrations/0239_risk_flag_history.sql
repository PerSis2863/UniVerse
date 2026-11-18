-- M292: early warning's score history per flag (JSON [{ at, score }], one point a day, the latest 12), for the
-- "getting worse / improving" trend on the board.
ALTER TABLE "student_risk_flags" ADD COLUMN "history" TEXT;
