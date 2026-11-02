CREATE TABLE "site_assets" (
	"kind" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_assets_kind" CHECK ("site_assets"."kind" in ('logo', 'favicon', 'og'))
);
