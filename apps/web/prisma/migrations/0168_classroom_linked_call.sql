-- Stage 5 · Q22 (D7 leftover): an in-person class linked to the course's class call running at the
-- same time (a hybrid class). The teacher's panel adds the call's students to the lost meter, and
-- students in the call are marked present like those who joined with the code in the room.
ALTER TABLE "classroom_sessions" ADD COLUMN "linkedCall" BOOLEAN NOT NULL DEFAULT false;
