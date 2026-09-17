CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}',
	"created_by" uuid,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "conversation_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"category" text NOT NULL,
	"country_code" text NOT NULL,
	"rate_paise" integer NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_end" timestamp NOT NULL,
	"message_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_charges_conversation_id_category_window_start_unique" UNIQUE("conversation_id","category","window_start")
);
--> statement-breakpoint
CREATE TABLE "conversation_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"country_code" text NOT NULL,
	"marketing_milli_paise" integer DEFAULT 0 NOT NULL,
	"utility_milli_paise" integer DEFAULT 0 NOT NULL,
	"authentication_milli_paise" integer DEFAULT 0 NOT NULL,
	"service_milli_paise" integer DEFAULT 0 NOT NULL,
	"markup_bps" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_rates_country_code_unique" UNIQUE("country_code")
);
--> statement-breakpoint
CREATE TABLE "flow_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"flow_id" uuid,
	"meta_flow_token" text,
	"contact_id" uuid,
	"conversation_id" uuid,
	"answers" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"categories" text[] DEFAULT '{}',
	"screens" jsonb DEFAULT '[]'::jsonb,
	"meta_flow_id" text,
	"channel_id" uuid,
	"publish_error" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"price_monthly_paise" integer DEFAULT 0 NOT NULL,
	"price_quarterly_paise" integer DEFAULT 0 NOT NULL,
	"price_annual_paise" integer DEFAULT 0 NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb,
	"features" jsonb DEFAULT '{}'::jsonb,
	"highlights" text[] DEFAULT '{}',
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"balance_after_paise" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_code" integer,
	"error" text,
	"next_attempt_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}',
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "msg_type" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "interactive" jsonb;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "plan_cycle" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "plan_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "plan_renews_at" timestamp;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "billing_country_code" text DEFAULT 'IN' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "header_type" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "header_text" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "header_media_url" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "footer" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "interactive_type" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "buttons" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "list_button_text" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "list_sections" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "catalog_id" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "catalog_sections" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "flow_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "flow_cta_text" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_charges" ADD CONSTRAINT "conversation_charges_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_charges" ADD CONSTRAINT "conversation_charges_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_responses" ADD CONSTRAINT "flow_responses_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_responses" ADD CONSTRAINT "flow_responses_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_responses" ADD CONSTRAINT "flow_responses_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_responses" ADD CONSTRAINT "flow_responses_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;