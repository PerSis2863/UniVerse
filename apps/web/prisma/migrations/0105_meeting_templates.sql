-- Stage 5 · B8.2: the meeting template chosen when scheduling a call (class, office, parent,
-- interview, viva): when the host joins, their app turns on its settings and fills in its agenda.
ALTER TABLE "scheduled_calls" ADD COLUMN "template" TEXT;
