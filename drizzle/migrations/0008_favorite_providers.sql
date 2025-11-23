CREATE TABLE "favorite_providers" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "user_id" varchar(255) NOT NULL,
  "provider_id" varchar(255) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "favorite_providers" ADD CONSTRAINT "favorite_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "favorite_providers" ADD CONSTRAINT "favorite_providers_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "favorite_providers_user_id_provider_id_unique" ON "favorite_providers" ("user_id","provider_id");
