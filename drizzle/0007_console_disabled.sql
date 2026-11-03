ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "console_disabled" boolean DEFAULT false NOT NULL;
