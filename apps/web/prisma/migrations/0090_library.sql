-- Stage 5 · B15.4: library. Books (from an ISBN look-up on Open Library, or typed in) with their
-- copies (each with its own barcode); loans of a copy to a student or teacher with a due date,
-- renewals and a fine when it comes back late; holds (reservations) queued per book, a returned
-- copy kept for the first in the queue for a few days. One settings row: loan days, renewals,
-- fine per day, how many books at once. Librarians are admins or staff with library.manage.
CREATE TABLE "library_books" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "publisher" TEXT,
    "year" INTEGER,
    "subjects" TEXT,
    "coverUrl" TEXT,
    "shelf" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "library_books_isbn_idx" ON "library_books"("isbn");
CREATE INDEX "library_books_title_idx" ON "library_books"("title");

CREATE TABLE "library_copies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "heldForId" TEXT,
    "heldUntil" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "library_copies_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "library_books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "library_copies_barcode_key" ON "library_copies"("barcode");
CREATE INDEX "library_copies_bookId_idx" ON "library_copies"("bookId");

CREATE TABLE "library_loans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "copyId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME NOT NULL,
    "returnedAt" DATETIME,
    "renewals" INTEGER NOT NULL DEFAULT 0,
    "fine" INTEGER NOT NULL DEFAULT 0,
    "fineStatus" TEXT,
    "remindedAt" DATETIME,
    CONSTRAINT "library_loans_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "library_copies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "library_loans_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "library_loans_borrowerId_idx" ON "library_loans"("borrowerId");
CREATE INDEX "library_loans_copyId_returnedAt_idx" ON "library_loans"("copyId", "returnedAt");
CREATE INDEX "library_loans_returnedAt_dueAt_idx" ON "library_loans"("returnedAt", "dueAt");

CREATE TABLE "library_holds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "copyId" TEXT,
    "readyUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "library_holds_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "library_books" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "library_holds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "library_holds_bookId_status_idx" ON "library_holds"("bookId", "status");
CREATE INDEX "library_holds_userId_idx" ON "library_holds"("userId");

CREATE TABLE "library_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanDays" INTEGER NOT NULL DEFAULT 14,
    "maxRenewals" INTEGER NOT NULL DEFAULT 2,
    "maxLoans" INTEGER NOT NULL DEFAULT 4,
    "finePerDay" INTEGER NOT NULL DEFAULT 0,
    "fineCap" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "holdDays" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
