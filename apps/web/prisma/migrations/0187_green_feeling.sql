-- "How did it go?" for Green actions (M60, the owner's pick of the Candour ideas): after logging an
-- action the person can say it felt easy, okay or hard. One answer per action, only theirs.
ALTER TABLE "green_actions" ADD COLUMN "feeling" TEXT;
