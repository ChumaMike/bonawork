CREATE TABLE "escrow_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"cluster" text DEFAULT 'devnet' NOT NULL,
	"escrow_address" text NOT NULL,
	"vault_address" text NOT NULL,
	"case_hash" text NOT NULL,
	"terms_hash" text NOT NULL,
	"funder_address" text NOT NULL,
	"funder_kind" text NOT NULL,
	"contractor_address" text NOT NULL,
	"school_address" text NOT NULL,
	"reviewer_address" text NOT NULL,
	"tranche_amounts" jsonb NOT NULL,
	"challenge_seconds" integer NOT NULL,
	"transactions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"watch" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escrow_cases" ADD CONSTRAINT "escrow_cases_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_cases" ADD CONSTRAINT "escrow_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_cases_report_idx" ON "escrow_cases" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_cases_escrow_idx" ON "escrow_cases" USING btree ("escrow_address");--> statement-breakpoint
CREATE INDEX "escrow_cases_watch_idx" ON "escrow_cases" USING btree ("watch");