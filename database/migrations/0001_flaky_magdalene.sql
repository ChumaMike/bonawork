CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"order_version" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"evidence_digests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_by" uuid NOT NULL,
	"commitment" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"order_version" integer NOT NULL,
	"invoice_number" text NOT NULL,
	"supplier_ref" text NOT NULL,
	"lines" jsonb NOT NULL,
	"stated_total_cents" integer NOT NULL,
	"submitted_by" uuid NOT NULL,
	"ai_drafted" boolean DEFAULT false NOT NULL,
	"source_text_digest" text,
	"commitment" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"receipt_id" uuid,
	"order_version" integer NOT NULL,
	"outcome" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"inputs_digest" text NOT NULL,
	"engine_version" text NOT NULL,
	"commitment" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_instructions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"authorised_by" uuid NOT NULL,
	"commitment" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"scope" text NOT NULL,
	"lines" jsonb NOT NULL,
	"total_cents" integer NOT NULL,
	"approved_by" uuid NOT NULL,
	"commitment" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"report_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_ref" text NOT NULL,
	"current_version" integer NOT NULL,
	"acknowledged_version" integer,
	"acknowledged_by" uuid,
	"acknowledged_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "supplier_ref" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "supplier_name" text;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_order_id_work_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_work_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_order_id_work_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_instructions" ADD CONSTRAINT "release_instructions_order_id_work_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_instructions" ADD CONSTRAINT "release_instructions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_instructions" ADD CONSTRAINT "release_instructions_match_id_match_results_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_instructions" ADD CONSTRAINT "release_instructions_review_id_independent_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."independent_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_instructions" ADD CONSTRAINT "release_instructions_authorised_by_users_id_fk" FOREIGN KEY ("authorised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_versions" ADD CONSTRAINT "work_order_versions_order_id_work_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_versions" ADD CONSTRAINT "work_order_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goods_receipts_order_idx" ON "goods_receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "match_results_invoice_idx" ON "match_results" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_instructions_order_idx" ON "release_instructions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_versions_order_version_idx" ON "work_order_versions" USING btree ("order_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_report_idx" ON "work_orders" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "work_orders_supplier_idx" ON "work_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_supplier_ref_idx" ON "users" USING btree ("supplier_ref");