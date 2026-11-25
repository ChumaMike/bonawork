CREATE TABLE "repair_budgets" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"total_cents" integer NOT NULL,
	"materials_cents" integer NOT NULL,
	"completion_cents" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repair_budgets" ADD CONSTRAINT "repair_budgets_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_budgets" ADD CONSTRAINT "repair_budgets_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;