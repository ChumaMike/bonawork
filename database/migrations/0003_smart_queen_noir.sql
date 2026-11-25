ALTER TABLE "escrow_cases" ADD COLUMN "payees" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "escrow_cases" ADD COLUMN "layout" integer DEFAULT 1 NOT NULL;