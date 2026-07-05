CREATE TABLE "app_release" (
	"id" text PRIMARY KEY NOT NULL,
	"version_code" integer NOT NULL,
	"apk_url" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
