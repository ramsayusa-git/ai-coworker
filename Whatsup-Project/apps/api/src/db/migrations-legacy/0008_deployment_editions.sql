CREATE TABLE "license_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" uuid NOT NULL,
	"instance_id" text NOT NULL,
	"hostname" text,
	"version" text,
	"ip_address" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "license_activations_license_id_instance_id_unique" UNIQUE("license_id","instance_id")
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"key_hash" text NOT NULL,
	"plan_id" text NOT NULL,
	"deployment" text DEFAULT 'self_hosted' NOT NULL,
	"partner_id" uuid,
	"org_id" uuid,
	"issued_to_name" text NOT NULL,
	"issued_to_email" text,
	"seats" integer DEFAULT -1 NOT NULL,
	"channels" integer DEFAULT -1 NOT NULL,
	"max_instances" integer DEFAULT 1 NOT NULL,
	"white_label" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "deployment" text DEFAULT 'hosted' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "deployment" text DEFAULT 'hosted' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "audience" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "custom_pricing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "license_activations" ADD CONSTRAINT "license_activations_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;