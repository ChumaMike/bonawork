CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"actor_role" text NOT NULL,
	"occurred_at" text NOT NULL,
	"subject_id" uuid,
	"anchored_value" text,
	"status_to" text,
	"reason" text,
	"note" text DEFAULT '' NOT NULL,
	"receipt" jsonb
);
--> statement-breakpoint
CREATE TABLE "commitment_documents" (
	"record_id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"type" text NOT NULL,
	"commitment" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "endorsements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_commitments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"algorithm" text DEFAULT 'sha256' NOT NULL,
	"digest" text NOT NULL,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"uploaded_by" uuid,
	"uploaded_by_role" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" text NOT NULL,
	"receipt" jsonb
);
--> statement-breakpoint
CREATE TABLE "independent_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"findings" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"commitment" text NOT NULL,
	"receipt" jsonb
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'school' NOT NULL,
	"name" text NOT NULL,
	"province" text NOT NULL,
	"district" text NOT NULL,
	"town" text NOT NULL,
	"external_ref" text,
	"phase" text NOT NULL,
	"learner_count" integer,
	"participation" text DEFAULT 'invited' NOT NULL,
	"participating_since" text,
	"about" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interim_protections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"measure" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" text NOT NULL,
	"commitment" text NOT NULL,
	"receipt" jsonb
);
--> statement-breakpoint
CREATE TABLE "ledger_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"position" serial NOT NULL,
	"report_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"payload" jsonb NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"summary" text NOT NULL,
	"claimed_by" uuid NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL,
	"commitment" text NOT NULL,
	"receipt" jsonb
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"institution_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"endorsement_count" integer DEFAULT 0 NOT NULL,
	"has_interim_protection" boolean DEFAULT false NOT NULL,
	"reporter_id" uuid,
	"commitment" text NOT NULL,
	"receipt" jsonb,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"institution_id" uuid,
	"display_name" text NOT NULL,
	"public_label" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_documents" ADD CONSTRAINT "commitment_documents_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_commitments" ADD CONSTRAINT "evidence_commitments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_commitments" ADD CONSTRAINT "evidence_commitments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "independent_reviews" ADD CONSTRAINT "independent_reviews_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "independent_reviews" ADD CONSTRAINT "independent_reviews_claim_id_repair_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."repair_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "independent_reviews" ADD CONSTRAINT "independent_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interim_protections" ADD CONSTRAINT "interim_protections_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interim_protections" ADD CONSTRAINT "interim_protections_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_jobs" ADD CONSTRAINT "ledger_jobs_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_jobs" ADD CONSTRAINT "ledger_jobs_event_id_case_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."case_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_claims" ADD CONSTRAINT "repair_claims_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_claims" ADD CONSTRAINT "repair_claims_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_events_report_sequence_idx" ON "case_events" USING btree ("report_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "endorsements_report_user_idx" ON "endorsements" USING btree ("report_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_report_digest_idx" ON "evidence_commitments" USING btree ("report_id","digest");--> statement-breakpoint
CREATE INDEX "evidence_digest_idx" ON "evidence_commitments" USING btree ("digest");--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_slug_idx" ON "institutions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ledger_jobs_status_idx" ON "ledger_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reference_idx" ON "reports" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "reports_institution_idx" ON "reports" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");