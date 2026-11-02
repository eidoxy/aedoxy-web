ALTER TABLE "plans" ADD COLUMN "fields_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "synced_version" integer;--> statement-breakpoint
UPDATE "plans" SET "synced_version" = 1 WHERE "synced_at" IS NOT NULL AND "newapi_plan_id" IS NOT NULL;
