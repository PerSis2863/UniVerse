-- Workers Free's daily allowances (cloudflare/usage-guard.ts): today's usage, and the last warning
-- sent ("<YYYY-MM-DD>:<warn|high>"), so the owner is told once at 70% and once at 90% a day.
ALTER TABLE usage_guard ADD COLUMN daily TEXT;
ALTER TABLE usage_guard ADD COLUMN dailyAlerted TEXT;
