ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "display_username" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_username_uidx" ON "user" USING btree ("username");
