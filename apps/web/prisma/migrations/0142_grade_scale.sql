-- Stage 5 · B3.4: a school's own letter grades and GPA points (JSON [{ letter, min, gpa }], highest first; null: A ≥ 90 … F, 4.0).
ALTER TABLE "organizations" ADD COLUMN "gradeScale" TEXT;
