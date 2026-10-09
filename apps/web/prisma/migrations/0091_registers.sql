-- Stage 5 · B15.5: registers. Equipment (each with a tag printed as a QR label: where it is, who
-- has it, its state, and every change), school buses (routes with stops and times, and who rides
-- from which stop) and the hostel (rooms with beds, and who lives where). Managed by admins or
-- staff with registers.manage; students and their parents see the student's bus, room and kit.
CREATE TABLE "assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_USE',
    "assignedToId" TEXT,
    "serial" TEXT,
    "purchasedAt" TEXT,
    "cost" INTEGER,
    "currency" TEXT,
    "notes" TEXT,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assets_tag_key" ON "assets"("tag");
CREATE INDEX "assets_assignedToId_idx" ON "assets"("assignedToId");
CREATE INDEX "assets_category_idx" ON "assets"("category");

CREATE TABLE "asset_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "byId" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "asset_events_assetId_at_idx" ON "asset_events"("assetId", "at");

CREATE TABLE "transport_routes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "vehicle" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "capacity" INTEGER,
    "stops" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "transport_riders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "stop" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transport_riders_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transport_riders_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "transport_riders_studentId_key" ON "transport_riders"("studentId");
CREATE INDEX "transport_riders_routeId_idx" ON "transport_riders"("routeId");

CREATE TABLE "hostel_rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "building" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beds" INTEGER NOT NULL DEFAULT 2,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "hostel_rooms_building_name_key" ON "hostel_rooms"("building", "name");

CREATE TABLE "hostel_residents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bed" TEXT,
    "since" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hostel_residents_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "hostel_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hostel_residents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "hostel_residents_studentId_key" ON "hostel_residents"("studentId");
CREATE INDEX "hostel_residents_roomId_idx" ON "hostel_residents"("roomId");
