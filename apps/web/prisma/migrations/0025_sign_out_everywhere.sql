-- "Sign out everywhere": sign-ins that started before this time are refused, on every device.
ALTER TABLE "users" ADD COLUMN "signedOutAt" DATETIME;
