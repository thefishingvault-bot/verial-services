CREATE TABLE "service_favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"service_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_favorites" ADD CONSTRAINT "service_favorites_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_favorites_user_service_unique" ON "service_favorites" USING btree ("user_id","service_id");--> statement-breakpoint
CREATE INDEX "service_favorites_user_idx" ON "service_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "service_favorites_service_idx" ON "service_favorites" USING btree ("service_id");