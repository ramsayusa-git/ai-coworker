ALTER TABLE "channels" ADD COLUMN "credentials" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "webhook_verify_token" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "provider_msg_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "error_message" text;