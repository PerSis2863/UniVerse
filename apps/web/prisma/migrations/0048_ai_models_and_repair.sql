-- AI models chosen in the owner console, and AI agents asked to repair error reports.
ALTER TABLE "server_control" ADD COLUMN "aiModels" TEXT;
ALTER TABLE "error_reports" ADD COLUMN "repairAgent" TEXT;
ALTER TABLE "error_reports" ADD COLUMN "repairUrl" TEXT;
ALTER TABLE "error_reports" ADD COLUMN "repairAt" DATETIME;
