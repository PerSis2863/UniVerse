-- M308: a brand's area alerts for copies: the countries it watches, how many likely copies (suspect scans and
-- reported fakes) in a day set off an alert, whether a cluster anywhere counts too, and when each area was last told.
ALTER TABLE "trace_brands" ADD COLUMN "watch" TEXT;
ALTER TABLE "trace_brands" ADD COLUMN "watchSent" TEXT;
