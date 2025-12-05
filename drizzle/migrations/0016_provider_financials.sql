CREATE TYPE "public"."earning_status" AS ENUM('pending', 'awaiting_payout', 'paid_out', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'in_transit', 'paid', 'canceled', 'failed');--> statement-breakpoint
CREATE TABLE "financial_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"booking_id" varchar(255),
	"issue" text NOT NULL,
	"expected_value" text,
	"actual_value" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_earnings" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"booking_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"service_id" varchar(255),
	"gross_amount" integer NOT NULL,
	"platform_fee_amount" integer NOT NULL,
	"gst_amount" integer DEFAULT 0 NOT NULL,
	"net_amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'nzd' NOT NULL,
	"status" "earning_status" DEFAULT 'pending' NOT NULL,
	"stripe_balance_transaction_id" varchar(255),
	"payout_id" varchar(255),
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_earnings_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "provider_payouts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"stripe_payout_id" varchar(255),
	"amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'nzd' NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"arrival_date" timestamp,
	"estimated_arrival" timestamp,
	"failure_code" varchar(255),
	"failure_message" text,
	"balance_transaction_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_payouts_stripe_payout_id_unique" UNIQUE("stripe_payout_id")
);
--> statement-breakpoint
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_earnings" ADD CONSTRAINT "provider_earnings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_earnings" ADD CONSTRAINT "provider_earnings_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_earnings" ADD CONSTRAINT "provider_earnings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_earnings" ADD CONSTRAINT "provider_earnings_payout_id_provider_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."provider_payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_payouts" ADD CONSTRAINT "provider_payouts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;