-- M301: a second sign-in step anyone can turn on: a code from an authenticator app (TOTP). The secret is kept
-- encrypted (secret-box); totpStep is the last code's time step, so one code can't be used twice.
ALTER TABLE "users" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "totpOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "totpStep" INTEGER;
