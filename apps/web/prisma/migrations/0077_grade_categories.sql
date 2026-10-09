-- Stage 5 · B3.4: gradebook categories. A course's categories (weight = percent of the final,
-- drop each student's lowest N) and which category each assessment (by name) belongs to, so every
-- grade for "Midterm" counts in Exams, including ones returned later.
CREATE TABLE "grade_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "dropLowest" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grade_categories_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "grade_assessments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "grade_assessments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "grade_assessments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "grade_categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "grade_categories_courseId_idx" ON "grade_categories"("courseId");
CREATE UNIQUE INDEX "grade_assessments_courseId_name_key" ON "grade_assessments"("courseId", "name");
