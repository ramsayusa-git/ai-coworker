-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "org_status" AS ENUM ('provisioning', 'active', 'suspended', 'archived', 'failed');

-- CreateEnum
CREATE TYPE "org_edition" AS ENUM ('free', 'pro', 'self_hosted');

-- CreateEnum
CREATE TYPE "isolation_tier" AS ENUM ('schema', 'database', 'dedicated', 'self_hosted');

-- CreateEnum
CREATE TYPE "provisioning_kind" AS ENUM ('create', 'migrate', 'seed', 'backup', 'restore', 'archive', 'destroy');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('owner', 'admin', 'bookkeeper', 'readonly');

-- CreateEnum
CREATE TYPE "payroll_tax_method" AS ENUM ('table', 'flat', 'dedicated', 'none');

-- CreateTable
CREATE TABLE "orgs" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "legal_name" VARCHAR(200),
    "tax_id" VARCHAR(40),
    "status" "org_status" NOT NULL DEFAULT 'provisioning',
    "edition" "org_edition" NOT NULL DEFAULT 'free',
    "base_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Chicago',
    "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 1,
    "is_nonprofit" BOOLEAN NOT NULL DEFAULT false,
    "suspended_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_clusters" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5432,
    "region" VARCHAR(40),
    "admin_dsn_encrypted" TEXT NOT NULL,
    "shared_database" VARCHAR(63),
    "max_orgs" INTEGER NOT NULL DEFAULT 500,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "db_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compute_nodes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "runtime" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(200),
    "base_url" VARCHAR(500) NOT NULL,
    "region" VARCHAR(40),
    "cpu_limit" VARCHAR(20),
    "memory_limit" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'provisioning',
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compute_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_environments" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "tier" "isolation_tier" NOT NULL DEFAULT 'database',
    "cluster_id" INTEGER,
    "compute_node_id" INTEGER,
    "schema_name" VARCHAR(63),
    "database_name" VARCHAR(63) NOT NULL,
    "database_role" VARCHAR(63) NOT NULL,
    "db_host" VARCHAR(255) NOT NULL DEFAULT 'localhost',
    "db_port" INTEGER NOT NULL DEFAULT 5432,
    "dsn_encrypted" TEXT NOT NULL,
    "data_key_wrapped" TEXT NOT NULL,
    "storage_root" VARCHAR(500) NOT NULL,
    "migration_version" VARCHAR(64),
    "pool_size" INTEGER NOT NULL DEFAULT 5,
    "last_migrated_at" TIMESTAMPTZ(6),
    "last_backup_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "org_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_jobs" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "kind" "provisioning_kind" NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "log" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provisioning_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "product_name" VARCHAR(120) NOT NULL DEFAULT 'Aetos One Books',
    "short_name" VARCHAR(40) NOT NULL DEFAULT 'AOB',
    "tagline" VARCHAR(200),
    "vendor_name" VARCHAR(120) NOT NULL DEFAULT 'Aetos Tech Labs',
    "support_email" VARCHAR(200),
    "support_url" VARCHAR(500),
    "docs_url" VARCHAR(500),
    "logo_light_path" VARCHAR(500),
    "logo_dark_path" VARCHAR(500),
    "mark_path" VARCHAR(500),
    "favicon_path" VARCHAR(500),
    "letterhead_path" VARCHAR(500),
    "color_primary" VARCHAR(32) NOT NULL DEFAULT '#1f6feb',
    "color_accent" VARCHAR(32) NOT NULL DEFAULT '#0fa47f',
    "color_sidebar" VARCHAR(32),
    "default_theme" VARCHAR(16) NOT NULL DEFAULT 'system',
    "font_family" VARCHAR(120),
    "css_variables" JSONB,
    "email_from_name" VARCHAR(120),
    "email_from_addr" VARCHAR(200),
    "email_footer" TEXT,
    "hide_vendor_marks" BOOLEAN NOT NULL DEFAULT false,
    "terms_url" VARCHAR(500),
    "privacy_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_domains" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "hostname" VARCHAR(255) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "verify_token" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "org_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licences" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "signature" TEXT NOT NULL,
    "issued_to" VARCHAR(200) NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "licences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(200),
    "display_name" VARCHAR(200) NOT NULL DEFAULT '',
    "password_hash" VARCHAR(512) NOT NULL,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "totp_secret" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "org_id" INTEGER NOT NULL,
    "role" "platform_role" NOT NULL DEFAULT 'bookkeeper',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_accessed_at" TIMESTAMPTZ(6),
    "invited_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "role" "platform_role" NOT NULL DEFAULT 'bookkeeper',
    "token_hash" VARCHAR(64) NOT NULL,
    "invited_by" VARCHAR(100),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "active_org_id" INTEGER,
    "membership_id" INTEGER,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" SERIAL NOT NULL,
    "org_id" INTEGER NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_hint" VARCHAR(12) NOT NULL,
    "role" "platform_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" VARCHAR(100) NOT NULL DEFAULT '',
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100),
    "org_slug" VARCHAR(40),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(40),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit" (
    "id" SERIAL NOT NULL,
    "actor" VARCHAR(100) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(80) NOT NULL,
    "entity_id" INTEGER,
    "org_id" INTEGER,
    "detail" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" SERIAL NOT NULL,
    "base_currency" VARCHAR(3) NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_tax_rates" (
    "id" SERIAL NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "method" "payroll_tax_method" NOT NULL DEFAULT 'none',
    "spec" JSONB NOT NULL,
    "effective_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orgs_slug_key" ON "orgs"("slug");

-- CreateIndex
CREATE INDEX "orgs_status_idx" ON "orgs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "db_clusters_name_key" ON "db_clusters"("name");

-- CreateIndex
CREATE UNIQUE INDEX "compute_nodes_name_key" ON "compute_nodes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "org_environments_org_id_key" ON "org_environments"("org_id");

-- CreateIndex
CREATE INDEX "org_environments_tier_idx" ON "org_environments"("tier");

-- CreateIndex
CREATE INDEX "org_environments_cluster_id_idx" ON "org_environments"("cluster_id");

-- CreateIndex
CREATE INDEX "provisioning_jobs_org_id_kind_idx" ON "provisioning_jobs"("org_id", "kind");

-- CreateIndex
CREATE INDEX "provisioning_jobs_status_idx" ON "provisioning_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profiles_org_id_key" ON "brand_profiles"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_domains_hostname_key" ON "org_domains"("hostname");

-- CreateIndex
CREATE INDEX "org_domains_org_id_idx" ON "org_domains"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "licences_org_id_key" ON "licences"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "licences_key_key" ON "licences"("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "memberships_org_id_is_active_idx" ON "memberships"("org_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_org_id_key" ON "memberships"("user_id", "org_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");

-- CreateIndex
CREATE INDEX "invites_org_id_idx" ON "invites"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "api_tokens_token_hash_idx" ON "api_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_org_id_label_key" ON "api_tokens"("org_id", "label");

-- CreateIndex
CREATE INDEX "login_attempts_created_at_idx" ON "login_attempts"("created_at");

-- CreateIndex
CREATE INDEX "login_attempts_username_idx" ON "login_attempts"("username");

-- CreateIndex
CREATE INDEX "platform_audit_org_id_created_at_idx" ON "platform_audit"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_action_idx" ON "platform_audit"("action");

-- CreateIndex
CREATE INDEX "fx_rates_rate_date_idx" ON "fx_rates"("rate_date");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_base_currency_quote_currency_rate_date_key" ON "fx_rates"("base_currency", "quote_currency", "rate_date");

-- CreateIndex
CREATE INDEX "payroll_tax_rates_tax_year_idx" ON "payroll_tax_rates"("tax_year");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_tax_rates_state_tax_year_key" ON "payroll_tax_rates"("state", "tax_year");

-- AddForeignKey
ALTER TABLE "org_environments" ADD CONSTRAINT "org_environments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_environments" ADD CONSTRAINT "org_environments_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "db_clusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_environments" ADD CONSTRAINT "org_environments_compute_node_id_fkey" FOREIGN KEY ("compute_node_id") REFERENCES "compute_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_domains" ADD CONSTRAINT "org_domains_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licences" ADD CONSTRAINT "licences_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_org_id_fkey" FOREIGN KEY ("active_org_id") REFERENCES "orgs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

