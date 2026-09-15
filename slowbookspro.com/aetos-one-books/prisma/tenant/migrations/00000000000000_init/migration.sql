-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'COGS');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('product', 'service', 'material', 'labor');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('purchase', 'sale', 'adjustment', 'return_in', 'return_out', 'void');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'partial', 'paid', 'void');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('pending', 'accepted', 'rejected', 'converted');

-- CreateEnum
CREATE TYPE "CreditMemoStatus" AS ENUM ('draft', 'issued', 'applied', 'void');

-- CreateEnum
CREATE TYPE "bill_status" AS ENUM ('draft', 'unpaid', 'partial', 'paid', 'void');

-- CreateEnum
CREATE TYPE "po_status" AS ENUM ('draft', 'sent', 'partial', 'received', 'closed');

-- CreateEnum
CREATE TYPE "vendor_credit_status" AS ENUM ('draft', 'issued', 'applied', 'void');

-- CreateEnum
CREATE TYPE "depreciation_method" AS ENUM ('straight_line', 'declining_balance');

-- CreateEnum
CREATE TYPE "fixed_asset_status" AS ENUM ('registered', 'disposed');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('in_progress', 'completed');

-- CreateEnum
CREATE TYPE "BankMatchStatus" AS ENUM ('unmatched', 'auto', 'manual', 'added', 'excluded');

-- CreateEnum
CREATE TYPE "BankRuleType" AS ENUM ('contains', 'starts_with', 'exact');

-- CreateEnum
CREATE TYPE "BankCsvFormat" AS ENUM ('chase_checking', 'chase_credit', 'paypal', 'paypal_new', 'bofa_detail', 'unknown');

-- CreateEnum
CREATE TYPE "ImportChannel" AS ENUM ('ofx', 'qfx', 'csv', 'simplefin');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('salary', 'hourly');

-- CreateEnum
CREATE TYPE "FilingStatus" AS ENUM ('single', 'married', 'head_of_household');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('weekly', 'biweekly', 'semi_monthly', 'monthly');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('admin', 'manager', 'employee');

-- CreateEnum
CREATE TYPE "PayRunStatus" AS ENUM ('draft', 'processed', 'void');

-- CreateEnum
CREATE TYPE "PayRunType" AS ENUM ('regular', 'off_cycle', 'bonus');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "GarnishmentType" AS ENUM ('child_support', 'federal_levy', 'state_tax_levy', 'student_loan', 'bankruptcy', 'creditor');

-- CreateEnum
CREATE TYPE "GarnishmentMethod" AS ENUM ('fixed', 'percent_disposable');

-- CreateEnum
CREATE TYPE "BenefitKind" AS ENUM ('deduction', 'benefit', 'both');

-- CreateEnum
CREATE TYPE "BenefitCategory" AS ENUM ('pretax', 'posttax');

-- CreateEnum
CREATE TYPE "BenefitCalcMethod" AS ENUM ('fixed_amount', 'percent_of_gross', 'percent_of_taxable', 'amount_per_hour', 'tiered', 'match_percent');

-- CreateEnum
CREATE TYPE "BenefitBurdenRouting" AS ENUM ('fringe_pool', 'job_burden');

-- CreateEnum
CREATE TYPE "BenefitSource" AS ENUM ('assignment', 'group');

-- CreateEnum
CREATE TYPE "PtoType" AS ENUM ('vacation', 'sick', 'personal');

-- CreateEnum
CREATE TYPE "PtoAccrualMethod" AS ENUM ('per_hour_worked', 'per_pay_period', 'annual_grant');

-- CreateEnum
CREATE TYPE "PtoRequestStatus" AS ENUM ('pending', 'approved', 'denied');

-- CreateEnum
CREATE TYPE "PtoValuation" AS ENUM ('current_rate', 'average_rate');

-- CreateEnum
CREATE TYPE "PtoAccrualEntryType" AS ENUM ('accrual', 'usage', 'carryover_forfeit', 'revaluation', 'termination_payout', 'adjustment');

-- CreateEnum
CREATE TYPE "OnboardingTaskType" AS ENUM ('w4', 'i9_section1', 'i9_section2', 'everify', 'direct_deposit', 'state_new_hire_report', 'policy_acknowledgment', 'emergency_contact');

-- CreateEnum
CREATE TYPE "OnboardingTaskStatus" AS ENUM ('pending', 'in_progress', 'complete');

-- CreateEnum
CREATE TYPE "BankAccountKind" AS ENUM ('checking', 'savings');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('full', 'percent', 'fixed', 'remainder');

-- CreateEnum
CREATE TYPE "PrenoteStatus" AS ENUM ('not_sent', 'pending', 'confirmed');

-- CreateEnum
CREATE TYPE "PayStubLineType" AS ENUM ('earning', 'employee_tax', 'employee_deduction', 'garnishment', 'addition', 'employer_tax', 'employer_benefit');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'awarded', 'in_progress', 'closed', 'not_awarded');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('posted', 'void');

-- CreateEnum
CREATE TYPE "JobCostSource" AS ENUM ('manual', 'time_entry', 'allocation', 'payroll');

-- CreateEnum
CREATE TYPE "JobBudgetSource" AS ENUM ('manual', 'estimate', 'change');

-- CreateEnum
CREATE TYPE "BurdenMethod" AS ENUM ('flat', 'payroll');

-- CreateEnum
CREATE TYPE "FundRestriction" AS ENUM ('unrestricted', 'temporarily_restricted', 'permanently_restricted');

-- CreateEnum
CREATE TYPE "ExpenseFunction" AS ENUM ('program', 'management', 'fundraising');

-- CreateEnum
CREATE TYPE "AllocationBasis" AS ENUM ('percent', 'square_feet', 'hours');

-- CreateEnum
CREATE TYPE "SavedReportType" AS ENUM ('profit_loss', 'balance_sheet', 'ar_aging', 'ap_aging', 'sales_tax', 'general_ledger', 'income_by_customer', 'account_transactions', 'cash_flow', 'analytics_dashboard', 'statement_of_financial_position', 'statement_of_activities', 'fund_balances', 'functional_expenses', 'pledges');

-- CreateEnum
CREATE TYPE "backup_type" AS ENUM ('manual', 'auto');

-- CreateEnum
CREATE TYPE "qbo_entity_type" AS ENUM ('account', 'customer', 'vendor', 'item', 'invoice', 'payment');

-- CreateEnum
CREATE TYPE "ai_provider" AS ENUM ('grok', 'groq', 'cloudflare', 'cloudflare_worker', 'anthropic', 'openai', 'gemini', 'custom');

-- CreateEnum
CREATE TYPE "ai_wire_format" AS ENUM ('openai', 'anthropic', 'gemini');

-- CreateEnum
CREATE TYPE "ocr_intake_status" AS ENUM ('pending', 'attached', 'expired', 'deleted');

-- CreateEnum
CREATE TYPE "migration_source" AS ENUM ('xero', 'myob', 'sage', 'wave', 'zoho', 'gnucash', 'iif', 'qbo', 'qb_report');

-- CreateEnum
CREATE TYPE "migration_run_mode" AS ENUM ('dry_run', 'import', 'validate', 'export');

-- CreateEnum
CREATE TYPE "migration_run_status" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "search_entity_type" AS ENUM ('customers', 'vendors', 'items', 'invoices', 'estimates', 'payments');

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "key" VARCHAR(50) NOT NULL,
    "value" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "record_id" INTEGER NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "changed_fields" JSONB,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(100),
    "username" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "account_number" VARCHAR(20),
    "account_type" "AccountType" NOT NULL,
    "parent_id" INTEGER,
    "description" VARCHAR(500),
    "is_active" BOOLEAN DEFAULT true,
    "is_system" BOOLEAN DEFAULT false,
    "balance" DECIMAL(14,2) DEFAULT 0,
    "bank_kind" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "reference" VARCHAR(100),
    "description" TEXT,
    "source_type" VARCHAR(50),
    "source_id" INTEGER,
    "class_id" INTEGER,
    "job_id" INTEGER,
    "is_voided" BOOLEAN NOT NULL DEFAULT false,
    "voided_at" TIMESTAMPTZ(6),
    "reversal_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_lines" (
    "id" SERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" VARCHAR(300),
    "job_id" INTEGER,
    "class_id" INTEGER,
    "cost_code_id" INTEGER,
    "cost_type" VARCHAR(20),
    "function" VARCHAR(20),
    "is_billable" BOOLEAN NOT NULL DEFAULT false,
    "billed_invoice_line_id" INTEGER,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "reconciliation_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transaction_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_category_mappings" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "tax_line" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_category_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_date_logs" (
    "id" SERIAL NOT NULL,
    "previous_closing_date" DATE,
    "new_closing_date" DATE,
    "action" VARCHAR(20) NOT NULL,
    "password_override_used" BOOLEAN NOT NULL DEFAULT false,
    "username" VARCHAR(100) NOT NULL,
    "principal_type" VARCHAR(20),
    "notes" TEXT,
    "user_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "closing_date_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "company" VARCHAR(200),
    "email" VARCHAR(200),
    "phone" VARCHAR(50),
    "mobile" VARCHAR(50),
    "fax" VARCHAR(50),
    "website" VARCHAR(200),
    "bill_address1" VARCHAR(200),
    "bill_address2" VARCHAR(200),
    "bill_city" VARCHAR(100),
    "bill_state" VARCHAR(50),
    "bill_zip" VARCHAR(20),
    "bill_country" VARCHAR(100) DEFAULT 'US',
    "ship_address1" VARCHAR(200),
    "ship_address2" VARCHAR(200),
    "ship_city" VARCHAR(100),
    "ship_state" VARCHAR(50),
    "ship_zip" VARCHAR(20),
    "ship_country" VARCHAR(100) DEFAULT 'US',
    "terms" VARCHAR(50) DEFAULT 'Net 30',
    "credit_limit" DECIMAL(14,2),
    "tax_id" VARCHAR(50),
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "donor_type" VARCHAR(20),
    "salutation" VARCHAR(100),
    "send_year_end_statement" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "description" TEXT,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "income_account_id" INTEGER,
    "expense_account_id" INTEGER,
    "asset_account_id" INTEGER,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "track_inventory" BOOLEAN NOT NULL DEFAULT false,
    "quantity_on_hand" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reorder_point" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "movement_type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "balance_qty" DECIMAL(14,4) NOT NULL,
    "balance_avg_cost" DECIMAL(14,4) NOT NULL,
    "source_type" VARCHAR(32),
    "source_id" INTEGER,
    "transaction_id" INTEGER,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "date" DATE NOT NULL,
    "due_date" DATE,
    "terms" VARCHAR(50) DEFAULT 'Net 30',
    "po_number" VARCHAR(100),
    "bill_address1" VARCHAR(200),
    "bill_address2" VARCHAR(200),
    "bill_city" VARCHAR(100),
    "bill_state" VARCHAR(50),
    "bill_zip" VARCHAR(20),
    "ship_address1" VARCHAR(200),
    "ship_address2" VARCHAR(200),
    "ship_city" VARCHAR(100),
    "ship_state" VARCHAR(50),
    "ship_zip" VARCHAR(20),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "transaction_id" INTEGER,
    "payment_token" VARCHAR(36),
    "stripe_checkout_session_id" VARCHAR(255),
    "checkout_provider" VARCHAR(20),
    "checkout_external_id" VARCHAR(255),
    "class_id" INTEGER,
    "job_id" INTEGER,
    "is_sales_receipt" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3),
    "exchange_rate" DECIMAL(18,8),
    "is_pledge" BOOLEAN NOT NULL DEFAULT false,
    "fair_value_amount" DECIMAL(14,2),
    "fair_value_description" VARCHAR(200),
    "recurring_invoice_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "class_name" VARCHAR(100),
    "job_id" INTEGER,
    "class_id" INTEGER,
    "cost_code_id" INTEGER,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "line_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimates" (
    "id" SERIAL NOT NULL,
    "estimate_number" VARCHAR(50) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'pending',
    "date" DATE NOT NULL,
    "expiration_date" DATE,
    "bill_address1" VARCHAR(200),
    "bill_address2" VARCHAR(200),
    "bill_city" VARCHAR(100),
    "bill_state" VARCHAR(50),
    "bill_zip" VARCHAR(20),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "converted_invoice_id" INTEGER,
    "class_id" INTEGER,
    "job_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_lines" (
    "id" SERIAL NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "class_name" VARCHAR(100),
    "job_id" INTEGER,
    "cost_code_id" INTEGER,
    "unit_cost" DECIMAL(14,4),
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "line_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" VARCHAR(50),
    "check_number" VARCHAR(50),
    "reference" VARCHAR(100),
    "deposit_to_account_id" INTEGER,
    "notes" TEXT,
    "transaction_id" INTEGER,
    "is_voided" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3),
    "exchange_rate" DECIMAL(18,8),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" SERIAL NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_memos" (
    "id" SERIAL NOT NULL,
    "memo_number" VARCHAR(50) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "status" "CreditMemoStatus" NOT NULL DEFAULT 'draft',
    "original_invoice_id" INTEGER,
    "date" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_applied" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_remaining" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "transaction_id" INTEGER,
    "class_id" INTEGER,
    "job_id" INTEGER,
    "is_write_off" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_memo_lines" (
    "id" SERIAL NOT NULL,
    "credit_memo_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_memo_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_applications" (
    "id" SERIAL NOT NULL,
    "credit_memo_id" INTEGER NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_invoices" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "frequency" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "next_due" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "terms" VARCHAR(50) DEFAULT 'Net 30',
    "tax_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "invoices_created" INTEGER NOT NULL DEFAULT 0,
    "class_id" INTEGER,
    "job_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recurring_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_invoice_lines" (
    "id" SERIAL NOT NULL,
    "recurring_invoice_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "line_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recurring_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "subject_template" VARCHAR(500) NOT NULL,
    "body_template" TEXT NOT NULL,
    "template_type" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" SERIAL NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "recipient" VARCHAR(200) NOT NULL,
    "subject" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL,
    "error_message" TEXT,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reseller_permits" (
    "id" SERIAL NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" INTEGER,
    "jurisdiction" VARCHAR(20) NOT NULL,
    "permit_number" VARCHAR(50) NOT NULL,
    "issued_at" DATE,
    "expires_at" DATE,
    "last_verified_at" TIMESTAMPTZ(6),
    "verified_by" VARCHAR(100),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reseller_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_accesses" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "path" VARCHAR(200),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "company" VARCHAR(200),
    "email" VARCHAR(200),
    "phone" VARCHAR(50),
    "fax" VARCHAR(50),
    "website" VARCHAR(200),
    "address1" VARCHAR(200),
    "address2" VARCHAR(200),
    "city" VARCHAR(100),
    "state" VARCHAR(50),
    "zip" VARCHAR(20),
    "country" VARCHAR(100) DEFAULT 'US',
    "terms" VARCHAR(50) DEFAULT 'Net 30',
    "tax_id" VARCHAR(50),
    "account_number" VARCHAR(50),
    "default_expense_account_id" INTEGER,
    "is_1099_vendor" BOOLEAN NOT NULL DEFAULT false,
    "vendor_1099_type" VARCHAR(10),
    "is_1099_eligible" BOOLEAN NOT NULL DEFAULT false,
    "w9_on_file" BOOLEAN NOT NULL DEFAULT false,
    "w9_document_id" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" SERIAL NOT NULL,
    "bill_number" VARCHAR(100) NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status" "bill_status" NOT NULL DEFAULT 'unpaid',
    "po_id" INTEGER,
    "date" DATE NOT NULL,
    "due_date" DATE,
    "terms" VARCHAR(50) DEFAULT 'Net 30',
    "ref_number" VARCHAR(100),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "transaction_id" INTEGER,
    "class_id" INTEGER,
    "job_id" INTEGER,
    "currency" VARCHAR(3),
    "exchange_rate" DECIMAL(18,8),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_lines" (
    "id" SERIAL NOT NULL,
    "bill_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "account_id" INTEGER,
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "job_id" INTEGER,
    "class_id" INTEGER,
    "cost_code_id" INTEGER,
    "function" VARCHAR(20),
    "is_billable" BOOLEAN NOT NULL DEFAULT false,
    "billed_invoice_line_id" INTEGER,
    "line_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payments" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" VARCHAR(50),
    "check_number" VARCHAR(50),
    "pay_from_account_id" INTEGER,
    "notes" TEXT,
    "currency" VARCHAR(3),
    "exchange_rate" DECIMAL(18,8),
    "transaction_id" INTEGER,
    "is_voided" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payment_allocations" (
    "id" SERIAL NOT NULL,
    "bill_payment_id" INTEGER NOT NULL,
    "bill_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "bill_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" SERIAL NOT NULL,
    "po_number" VARCHAR(50) NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status" "po_status" NOT NULL DEFAULT 'draft',
    "date" DATE NOT NULL,
    "expected_date" DATE,
    "ship_to" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "job_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "received_qty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "job_id" INTEGER,
    "cost_code_id" INTEGER,
    "line_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_credits" (
    "id" SERIAL NOT NULL,
    "credit_number" VARCHAR(50) NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "status" "vendor_credit_status" NOT NULL DEFAULT 'draft',
    "original_bill_id" INTEGER,
    "ref_number" VARCHAR(100),
    "date" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_applied" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance_remaining" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "transaction_id" INTEGER,
    "class_id" INTEGER,
    "job_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendor_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_credit_lines" (
    "id" SERIAL NOT NULL,
    "vendor_credit_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "account_id" INTEGER,
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "job_id" INTEGER,
    "class_id" INTEGER,
    "cost_code_id" INTEGER,
    "line_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_credit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_credit_applications" (
    "id" SERIAL NOT NULL,
    "vendor_credit_id" INTEGER NOT NULL,
    "bill_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "vendor_credit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_types" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "asset_account_id" INTEGER,
    "accumulated_depreciation_account_id" INTEGER,
    "depreciation_expense_account_id" INTEGER,
    "depreciation_method" "depreciation_method" NOT NULL DEFAULT 'straight_line',
    "effective_life_years" DECIMAL(14,4),
    "annual_rate" DECIMAL(14,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fixed_asset_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" SERIAL NOT NULL,
    "asset_number" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "asset_type_id" INTEGER NOT NULL,
    "status" "fixed_asset_status" NOT NULL DEFAULT 'registered',
    "purchase_date" DATE NOT NULL,
    "purchase_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "salvage_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "accumulated_depreciation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "last_depreciation_date" DATE,
    "disposal_date" DATE,
    "disposal_proceeds" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "account_id" INTEGER,
    "bank_name" VARCHAR(200),
    "last_four" VARCHAR(4),
    "legacy_balance" DECIMAL(14,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" SERIAL NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payee" VARCHAR(200),
    "description" VARCHAR(500),
    "check_number" VARCHAR(50),
    "category_account_id" INTEGER,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "transaction_id" INTEGER,
    "transaction_line_id" INTEGER,
    "import_id" VARCHAR(100),
    "import_source" VARCHAR(50),
    "match_status" "BankMatchStatus",
    "import_batch_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER,
    "bank_account_id" INTEGER,
    "statement_date" DATE NOT NULL,
    "statement_balance" DECIMAL(14,2) NOT NULL,
    "beginning_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cleared_total" DECIMAL(14,2),
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_rules" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "pattern" VARCHAR(200) NOT NULL,
    "account_id" INTEGER,
    "vendor_id" INTEGER,
    "rule_type" "BankRuleType" NOT NULL DEFAULT 'contains',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" SERIAL NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255),
    "file_bytes" INTEGER,
    "fingerprint" VARCHAR(64),
    "occurrence" INTEGER NOT NULL DEFAULT 0,
    "channel" "ImportChannel" NOT NULL,
    "csv_format" "BankCsvFormat",
    "import_source" VARCHAR(50) NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "matched_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "categorised_rows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "ssn_last_four" VARCHAR(4),
    "pay_type" "PayType" NOT NULL DEFAULT 'hourly',
    "pay_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pay_frequency" "PayFrequency" NOT NULL DEFAULT 'biweekly',
    "filing_status" "FilingStatus" NOT NULL DEFAULT 'single',
    "multiple_jobs" BOOLEAN NOT NULL DEFAULT false,
    "dependents_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_income_annual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions_annual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "extra_withholding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "address1" VARCHAR(200),
    "address2" VARCHAR(200),
    "city" VARCHAR(100),
    "state" VARCHAR(50),
    "zip" VARCHAR(20),
    "work_state" VARCHAR(2),
    "residence_state" VARCHAR(2),
    "wc_class_code" VARCHAR(20),
    "state_allowances" INTEGER NOT NULL DEFAULT 0,
    "state_extra_withholding" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "state_rate_override" DECIMAL(14,4),
    "local_tax_rate" DECIMAL(14,4),
    "cost_rate" DECIMAL(14,2),
    "burden_pct" DECIMAL(14,4),
    "employee_group_id" INTEGER,
    "hire_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "email" VARCHAR(200),
    "role" "EmployeeRole" NOT NULL DEFAULT 'employee',
    "manager_id" INTEGER,
    "portal_token" VARCHAR(64),
    "portal_token_last_used" TIMESTAMPTZ(6),
    "portal_token_expires_at" TIMESTAMPTZ(6),
    "everify_case_number" VARCHAR(30),
    "everify_status" VARCHAR(30),
    "everify_submitted_at" TIMESTAMPTZ(6),
    "everify_closed_at" TIMESTAMPTZ(6),
    "everify_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank_accounts" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "nickname" VARCHAR(100),
    "account_kind" "BankAccountKind" NOT NULL DEFAULT 'checking',
    "routing_number_enc" VARCHAR(255),
    "account_number_enc" VARCHAR(255),
    "account_last_four" VARCHAR(4),
    "deposit_type" "DepositType" NOT NULL DEFAULT 'full',
    "deposit_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "prenote_status" "PrenoteStatus" NOT NULL DEFAULT 'not_sent',
    "prenote_sent_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_runs" (
    "id" SERIAL NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "pay_date" DATE NOT NULL,
    "status" "PayRunStatus" NOT NULL DEFAULT 'draft',
    "run_type" "PayRunType" NOT NULL DEFAULT 'regular',
    "total_gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_taxes" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_employer_taxes" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_employer_benefits" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transaction_id" INTEGER,
    "burden_job_cost_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pay_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_stubs" (
    "id" SERIAL NOT NULL,
    "pay_run_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "hours" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "regular_hours" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "doubletime_hours" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "gross_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "federal_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "state_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "state_other_employee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ss_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "medicare_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pretax_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "posttax_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "garnishments" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reimbursements" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "work_state" VARCHAR(2),
    "employer_ss_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employer_medicare_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "futa_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "suta_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "state_other_employer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employer_benefits" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "detail_json" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pay_stubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_stub_lines" (
    "id" SERIAL NOT NULL,
    "pay_stub_id" INTEGER NOT NULL,
    "line_type" "PayStubLineType" NOT NULL,
    "detail_key" VARCHAR(120) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "benefit_code_id" INTEGER,
    "garnishment_order_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pay_stub_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "hours_regular" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "hours_overtime" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "hours_doubletime" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "project_id" INTEGER,
    "job_id" INTEGER,
    "cost_code_id" INTEGER,
    "job_cost_id" INTEGER,
    "notes" TEXT,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'draft',
    "approved_by" VARCHAR(200),
    "approved_at" TIMESTAMPTZ(6),
    "pay_run_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garnishment_orders" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "garnishment_type" "GarnishmentType" NOT NULL DEFAULT 'creditor',
    "calc_method" "GarnishmentMethod" NOT NULL DEFAULT 'fixed',
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "case_number" VARCHAR(80),
    "supports_secondary_family" BOOLEAN NOT NULL DEFAULT false,
    "in_arrears_12_weeks" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "garnishment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "BenefitKind" NOT NULL DEFAULT 'deduction',
    "category" "BenefitCategory" NOT NULL DEFAULT 'pretax',
    "calc_method" "BenefitCalcMethod" NOT NULL DEFAULT 'fixed_amount',
    "employer_calc_method" "BenefitCalcMethod",
    "reduces_federal" BOOLEAN NOT NULL DEFAULT false,
    "reduces_state" BOOLEAN NOT NULL DEFAULT false,
    "reduces_fica" BOOLEAN NOT NULL DEFAULT false,
    "employer_taxable" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 100,
    "expense_account_id" INTEGER,
    "liability_account_id" INTEGER,
    "remittance_vendor_id" INTEGER,
    "burden_routing" "BenefitBurdenRouting" NOT NULL DEFAULT 'fringe_pool',
    "tracks_balance" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" DATE,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "benefit_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_rates" (
    "id" SERIAL NOT NULL,
    "benefit_code_id" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "employee_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "employer_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "per_period_cap" DECIMAL(14,2),
    "annual_cap" DECIMAL(14,2),
    "wage_base_ceiling" DECIMAL(14,2),
    "employer_annual_cap" DECIMAL(14,2),
    "employer_match_limit_pct" DECIMAL(14,4),
    "tiers_json" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "benefit_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_group_benefits" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "benefit_code_id" INTEGER NOT NULL,
    "employee_rate" DECIMAL(14,4),
    "employer_rate" DECIMAL(14,4),
    "per_period_cap" DECIMAL(14,2),
    "annual_cap" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_group_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_benefits" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "benefit_code_id" INTEGER NOT NULL,
    "employee_rate" DECIMAL(14,4),
    "employer_rate" DECIMAL(14,4),
    "per_period_cap" DECIMAL(14,2),
    "annual_cap" DECIMAL(14,2),
    "balance_remaining" DECIMAL(14,2),
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_ytd" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "benefit_code_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "employee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employer_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "benefit_ytd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_stub_benefits" (
    "id" SERIAL NOT NULL,
    "pay_stub_id" INTEGER NOT NULL,
    "benefit_code_id" INTEGER,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "BenefitKind" NOT NULL,
    "category" "BenefitCategory" NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 100,
    "calc_method" "BenefitCalcMethod" NOT NULL,
    "employee_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "employer_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reduces_federal" BOOLEAN NOT NULL DEFAULT false,
    "reduces_state" BOOLEAN NOT NULL DEFAULT false,
    "reduces_fica" BOOLEAN NOT NULL DEFAULT false,
    "expense_account_id" INTEGER,
    "liability_account_id" INTEGER,
    "remittance_vendor_id" INTEGER,
    "burden_routing" "BenefitBurdenRouting" NOT NULL DEFAULT 'fringe_pool',
    "rule_json" TEXT,
    "employee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employer_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pay_stub_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pto_policies" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "pto_type" "PtoType" NOT NULL DEFAULT 'vacation',
    "accrual_method" "PtoAccrualMethod" NOT NULL DEFAULT 'per_pay_period',
    "accrual_rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "max_carryover" DECIMAL(14,4),
    "max_balance" DECIMAL(14,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "accrue_liability" BOOLEAN NOT NULL DEFAULT false,
    "valuation" "PtoValuation" NOT NULL DEFAULT 'current_rate',
    "expense_account_id" INTEGER,
    "liability_account_id" INTEGER,
    "pays_out_on_termination" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pto_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pto_accruals" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "policy_id" INTEGER NOT NULL,
    "balance" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "accrued_ytd" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "used_ytd" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "dollar_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pto_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pto_requests" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "hours" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "pto_type" "PtoType" NOT NULL DEFAULT 'vacation',
    "status" "PtoRequestStatus" NOT NULL DEFAULT 'pending',
    "approver_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pto_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pto_accrual_entries" (
    "id" SERIAL NOT NULL,
    "pto_balance_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "policy_id" INTEGER NOT NULL,
    "entry_type" "PtoAccrualEntryType" NOT NULL,
    "effective_date" DATE NOT NULL,
    "hours" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "hours_earned_pre_cap" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "hours_worked" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "dollars" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit_value" DECIMAL(14,4),
    "balance_after" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "dollar_balance_after" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pay_run_id" INTEGER,
    "pto_request_id" INTEGER,
    "transaction_id" INTEGER,
    "year_closed" INTEGER,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pto_accrual_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "task_type" "OnboardingTaskType" NOT NULL,
    "status" "OnboardingTaskStatus" NOT NULL DEFAULT 'pending',
    "document_id" INTEGER,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "completed_by" VARCHAR(120),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_audits" (
    "id" SERIAL NOT NULL,
    "doc_type" VARCHAR(20) NOT NULL,
    "doc_key" VARCHAR(80) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "report_type" "SavedReportType" NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layouts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "value" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "job_number" VARCHAR(50),
    "status" "JobStatus" NOT NULL DEFAULT 'in_progress',
    "job_type" VARCHAR(100),
    "description" TEXT,
    "site_address" TEXT,
    "start_date" DATE,
    "projected_end_date" DATE,
    "end_date" DATE,
    "contract_amount" DECIMAL(14,2),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "cost_type" VARCHAR(20) NOT NULL DEFAULT 'other',
    "account_id" INTEGER,
    "parent_id" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cost_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_types" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_labor" BOOLEAN NOT NULL DEFAULT false,
    "burden_pct" DECIMAL(14,4),
    "burden_method" "BurdenMethod" NOT NULL DEFAULT 'flat',
    "default_account_id" INTEGER,
    "offset_account_id" INTEGER,
    "burden_offset_account_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cost_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30),
    "name" VARCHAR(200) NOT NULL,
    "hourly_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_code_id" INTEGER,
    "recovery_account_id" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_costs" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "date" DATE NOT NULL,
    "job_id" INTEGER,
    "memo" TEXT,
    "source" "JobCostSource" NOT NULL DEFAULT 'manual',
    "status" "DocStatus" NOT NULL DEFAULT 'posted',
    "transaction_id" INTEGER,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_cost_lines" (
    "id" SERIAL NOT NULL,
    "job_cost_id" INTEGER NOT NULL,
    "job_id" INTEGER,
    "cost_code_id" INTEGER,
    "cost_type" VARCHAR(20),
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "debit_account_id" INTEGER NOT NULL,
    "credit_account_id" INTEGER NOT NULL,
    "employee_id" INTEGER,
    "equipment_id" INTEGER,
    "time_entry_id" INTEGER,
    "is_burden" BOOLEAN NOT NULL DEFAULT false,
    "is_billable" BOOLEAN NOT NULL DEFAULT false,
    "line_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_cost_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_budgets" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "cost_code_id" INTEGER,
    "cost_type" VARCHAR(20),
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenue_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "source" "JobBudgetSource" NOT NULL DEFAULT 'manual',
    "estimate_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "is_system_default" BOOLEAN NOT NULL DEFAULT false,
    "restriction" "FundRestriction" NOT NULL DEFAULT 'unrestricted',
    "default_function" "ExpenseFunction",
    "donor_name" VARCHAR(200),
    "purpose" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restriction_releases" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "date" DATE NOT NULL,
    "class_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "period_start" DATE,
    "period_end" DATE,
    "memo" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'posted',
    "transaction_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restriction_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_rules" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "basis" "AllocationBasis" NOT NULL,
    "source_account_id" INTEGER,
    "source_class_id" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "allocation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_rule_targets" (
    "id" SERIAL NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "class_id" INTEGER,
    "function" "ExpenseFunction",
    "job_id" INTEGER,
    "weight" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "line_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "allocation_rule_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "functional_allocations" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "date" DATE NOT NULL,
    "rule_id" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "memo" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'posted',
    "transaction_id" INTEGER,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "functional_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_kind_gifts" (
    "id" SERIAL NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "memo" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'posted',
    "transaction_id" INTEGER,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "class_id" INTEGER,
    "job_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "in_kind_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_kind_gift_lines" (
    "id" SERIAL NOT NULL,
    "in_kind_gift_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "fair_value" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "debit_account_id" INTEGER NOT NULL,
    "credit_account_id" INTEGER NOT NULL,
    "class_id" INTEGER,
    "job_id" INTEGER,
    "line_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "in_kind_gift_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" SERIAL NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100),
    "file_size" INTEGER,
    "employee_id" INTEGER,
    "doc_category" VARCHAR(50),
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "file_size" INTEGER,
    "backup_type" "backup_type" DEFAULT 'manual',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_templates" (
    "id" SERIAL NOT NULL,
    "merchant_key" VARCHAR(120) NOT NULL,
    "merchant_name" VARCHAR(200),
    "fields_json" TEXT NOT NULL DEFAULT '{}',
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ocr_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_intakes" (
    "id" SERIAL NOT NULL,
    "intake_id" VARCHAR(32) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100),
    "size" INTEGER,
    "status" "ocr_intake_status" NOT NULL DEFAULT 'pending',
    "engine" VARCHAR(20),
    "language" VARCHAR(40),
    "raw_text" TEXT,
    "extracted" JSONB,
    "template_id" INTEGER,
    "attachment_id" INTEGER,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ocr_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qbo_mappings" (
    "id" SERIAL NOT NULL,
    "entity_type" "qbo_entity_type" NOT NULL,
    "slowbooks_id" INTEGER NOT NULL,
    "qbo_id" VARCHAR(100) NOT NULL,
    "qbo_sync_token" VARCHAR(50),
    "last_synced_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "qbo_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" SERIAL NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "wire_format" "ai_wire_format" NOT NULL,
    "model" VARCHAR(200) NOT NULL DEFAULT '',
    "api_key_encrypted" TEXT,
    "cloudflare_account_id" VARCHAR(32),
    "worker_url" VARCHAR(2048),
    "endpoint_url" VARCHAR(2048),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_tested_at" TIMESTAMPTZ(6),
    "last_test_result" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_runs" (
    "id" SERIAL NOT NULL,
    "source" "migration_source" NOT NULL,
    "source_label" VARCHAR(100) NOT NULL,
    "source_type" VARCHAR(50),
    "mode" "migration_run_mode" NOT NULL,
    "status" "migration_run_status" NOT NULL DEFAULT 'running',
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "files" JSONB,
    "accounts" INTEGER NOT NULL DEFAULT 0,
    "journals" INTEGER NOT NULL DEFAULT 0,
    "imported_accounts" INTEGER NOT NULL DEFAULT 0,
    "imported_journals" INTEGER NOT NULL DEFAULT 0,
    "duplicates_skipped" INTEGER NOT NULL DEFAULT 0,
    "opening_balances" JSONB,
    "result" JSONB,
    "errors" JSONB,
    "warnings" JSONB,
    "started_by" VARCHAR(100),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "migration_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_index_entries" (
    "id" SERIAL NOT NULL,
    "entity_type" "search_entity_type" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "subtitle" VARCHAR(300),
    "keywords" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "entry_date" DATE,
    "status" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "indexed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "search_index_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "user_preferences_user_id_idx" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key_key" ON "user_preferences"("user_id", "key");

-- CreateIndex
CREATE INDEX "audit_log_table_name_record_id_idx" ON "audit_log"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log"("timestamp");

-- CreateIndex
CREATE INDEX "audit_log_username_idx" ON "audit_log"("username");

-- CreateIndex
CREATE INDEX "accounts_account_type_idx" ON "accounts"("account_type");

-- CreateIndex
CREATE INDEX "accounts_bank_kind_idx" ON "accounts"("bank_kind");

-- CreateIndex
CREATE INDEX "accounts_parent_id_idx" ON "accounts"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_account_number_key" ON "accounts"("account_number");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_reversal_id_key" ON "transactions"("reversal_id");

-- CreateIndex
CREATE INDEX "transactions_date_idx" ON "transactions"("date");

-- CreateIndex
CREATE INDEX "transactions_is_voided_date_idx" ON "transactions"("is_voided", "date");

-- CreateIndex
CREATE INDEX "transactions_source_type_source_id_idx" ON "transactions"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "transactions_class_id_idx" ON "transactions"("class_id");

-- CreateIndex
CREATE INDEX "transactions_job_id_idx" ON "transactions"("job_id");

-- CreateIndex
CREATE INDEX "transaction_lines_transaction_id_idx" ON "transaction_lines"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_lines_account_id_idx" ON "transaction_lines"("account_id");

-- CreateIndex
CREATE INDEX "transaction_lines_job_id_idx" ON "transaction_lines"("job_id");

-- CreateIndex
CREATE INDEX "transaction_lines_class_id_idx" ON "transaction_lines"("class_id");

-- CreateIndex
CREATE INDEX "transaction_lines_cost_code_id_idx" ON "transaction_lines"("cost_code_id");

-- CreateIndex
CREATE INDEX "transaction_lines_reconciliation_id_idx" ON "transaction_lines"("reconciliation_id");

-- CreateIndex
CREATE INDEX "transaction_lines_billed_invoice_line_id_idx" ON "transaction_lines"("billed_invoice_line_id");

-- CreateIndex
CREATE INDEX "tax_category_mappings_tax_line_idx" ON "tax_category_mappings"("tax_line");

-- CreateIndex
CREATE UNIQUE INDEX "tax_category_mappings_account_id_key" ON "tax_category_mappings"("account_id");

-- CreateIndex
CREATE INDEX "closing_date_logs_created_at_idx" ON "closing_date_logs"("created_at");

-- CreateIndex
CREATE INDEX "closing_date_logs_new_closing_date_idx" ON "closing_date_logs"("new_closing_date");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "customers"("is_active");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "items_is_active_idx" ON "items"("is_active");

-- CreateIndex
CREATE INDEX "items_track_inventory_idx" ON "items"("track_inventory");

-- CreateIndex
CREATE INDEX "inventory_movements_item_id_idx" ON "inventory_movements"("item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_item_id_date_idx" ON "inventory_movements"("item_id", "date");

-- CreateIndex
CREATE INDEX "inventory_movements_source_type_source_id_idx" ON "inventory_movements"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_token_key" ON "invoices"("payment_token");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_date_idx" ON "invoices"("date");

-- CreateIndex
CREATE INDEX "invoices_is_sales_receipt_idx" ON "invoices"("is_sales_receipt");

-- CreateIndex
CREATE INDEX "invoices_checkout_external_id_idx" ON "invoices"("checkout_external_id");

-- CreateIndex
CREATE INDEX "invoices_recurring_invoice_id_idx" ON "invoices"("recurring_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_item_id_idx" ON "invoice_lines"("item_id");

-- CreateIndex
CREATE INDEX "estimates_customer_id_idx" ON "estimates"("customer_id");

-- CreateIndex
CREATE INDEX "estimates_date_idx" ON "estimates"("date");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_estimate_number_key" ON "estimates"("estimate_number");

-- CreateIndex
CREATE INDEX "estimate_lines_estimate_id_idx" ON "estimate_lines"("estimate_id");

-- CreateIndex
CREATE INDEX "estimate_lines_item_id_idx" ON "estimate_lines"("item_id");

-- CreateIndex
CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");

-- CreateIndex
CREATE INDEX "payments_date_idx" ON "payments"("date");

-- CreateIndex
CREATE INDEX "payments_reference_idx" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "credit_memos_customer_id_idx" ON "credit_memos"("customer_id");

-- CreateIndex
CREATE INDEX "credit_memos_date_idx" ON "credit_memos"("date");

-- CreateIndex
CREATE UNIQUE INDEX "credit_memos_memo_number_key" ON "credit_memos"("memo_number");

-- CreateIndex
CREATE INDEX "credit_memo_lines_credit_memo_id_idx" ON "credit_memo_lines"("credit_memo_id");

-- CreateIndex
CREATE INDEX "credit_memo_lines_item_id_idx" ON "credit_memo_lines"("item_id");

-- CreateIndex
CREATE INDEX "credit_applications_credit_memo_id_idx" ON "credit_applications"("credit_memo_id");

-- CreateIndex
CREATE INDEX "credit_applications_invoice_id_idx" ON "credit_applications"("invoice_id");

-- CreateIndex
CREATE INDEX "recurring_invoices_customer_id_idx" ON "recurring_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "recurring_invoices_is_active_next_due_idx" ON "recurring_invoices"("is_active", "next_due");

-- CreateIndex
CREATE INDEX "recurring_invoice_lines_recurring_invoice_id_idx" ON "recurring_invoice_lines"("recurring_invoice_id");

-- CreateIndex
CREATE INDEX "recurring_invoice_lines_item_id_idx" ON "recurring_invoice_lines"("item_id");

-- CreateIndex
CREATE INDEX "email_templates_template_type_name_idx" ON "email_templates"("template_type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_name_key" ON "email_templates"("name");

-- CreateIndex
CREATE INDEX "email_log_entity_type_entity_id_idx" ON "email_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "email_log_sent_at_idx" ON "email_log"("sent_at");

-- CreateIndex
CREATE INDEX "reseller_permits_entity_type_entity_id_idx" ON "reseller_permits"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "reseller_permits_jurisdiction_idx" ON "reseller_permits"("jurisdiction");

-- CreateIndex
CREATE INDEX "reseller_permits_permit_number_idx" ON "reseller_permits"("permit_number");

-- CreateIndex
CREATE INDEX "reseller_permits_expires_at_idx" ON "reseller_permits"("expires_at");

-- CreateIndex
CREATE INDEX "reseller_permits_is_active_idx" ON "reseller_permits"("is_active");

-- CreateIndex
CREATE INDEX "portal_accesses_employee_id_idx" ON "portal_accesses"("employee_id");

-- CreateIndex
CREATE INDEX "portal_accesses_created_at_idx" ON "portal_accesses"("created_at");

-- CreateIndex
CREATE INDEX "portal_accesses_success_idx" ON "portal_accesses"("success");

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "vendors_is_active_idx" ON "vendors"("is_active");

-- CreateIndex
CREATE INDEX "vendors_is_1099_vendor_idx" ON "vendors"("is_1099_vendor");

-- CreateIndex
CREATE INDEX "bills_vendor_id_bill_number_idx" ON "bills"("vendor_id", "bill_number");

-- CreateIndex
CREATE INDEX "bills_status_idx" ON "bills"("status");

-- CreateIndex
CREATE INDEX "bills_date_idx" ON "bills"("date");

-- CreateIndex
CREATE INDEX "bills_due_date_idx" ON "bills"("due_date");

-- CreateIndex
CREATE INDEX "bills_po_id_idx" ON "bills"("po_id");

-- CreateIndex
CREATE INDEX "bill_lines_bill_id_idx" ON "bill_lines"("bill_id");

-- CreateIndex
CREATE INDEX "bill_lines_item_id_idx" ON "bill_lines"("item_id");

-- CreateIndex
CREATE INDEX "bill_lines_billed_invoice_line_id_idx" ON "bill_lines"("billed_invoice_line_id");

-- CreateIndex
CREATE INDEX "bill_payments_vendor_id_idx" ON "bill_payments"("vendor_id");

-- CreateIndex
CREATE INDEX "bill_payments_date_idx" ON "bill_payments"("date");

-- CreateIndex
CREATE INDEX "bill_payments_is_voided_idx" ON "bill_payments"("is_voided");

-- CreateIndex
CREATE INDEX "bill_payment_allocations_bill_payment_id_idx" ON "bill_payment_allocations"("bill_payment_id");

-- CreateIndex
CREATE INDEX "bill_payment_allocations_bill_id_idx" ON "bill_payment_allocations"("bill_id");

-- CreateIndex
CREATE INDEX "purchase_orders_vendor_id_idx" ON "purchase_orders"("vendor_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_date_idx" ON "purchase_orders"("date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchase_order_id_idx" ON "purchase_order_lines"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_lines_item_id_idx" ON "purchase_order_lines"("item_id");

-- CreateIndex
CREATE INDEX "vendor_credits_vendor_id_idx" ON "vendor_credits"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_credits_status_idx" ON "vendor_credits"("status");

-- CreateIndex
CREATE INDEX "vendor_credits_date_idx" ON "vendor_credits"("date");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_credits_credit_number_key" ON "vendor_credits"("credit_number");

-- CreateIndex
CREATE INDEX "vendor_credit_lines_vendor_credit_id_idx" ON "vendor_credit_lines"("vendor_credit_id");

-- CreateIndex
CREATE INDEX "vendor_credit_lines_item_id_idx" ON "vendor_credit_lines"("item_id");

-- CreateIndex
CREATE INDEX "vendor_credit_applications_vendor_credit_id_idx" ON "vendor_credit_applications"("vendor_credit_id");

-- CreateIndex
CREATE INDEX "vendor_credit_applications_bill_id_idx" ON "vendor_credit_applications"("bill_id");

-- CreateIndex
CREATE INDEX "fixed_asset_types_is_active_idx" ON "fixed_asset_types"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_types_name_key" ON "fixed_asset_types"("name");

-- CreateIndex
CREATE INDEX "fixed_assets_asset_type_id_idx" ON "fixed_assets"("asset_type_id");

-- CreateIndex
CREATE INDEX "fixed_assets_status_idx" ON "fixed_assets"("status");

-- CreateIndex
CREATE INDEX "fixed_assets_purchase_date_idx" ON "fixed_assets"("purchase_date");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_asset_number_key" ON "fixed_assets"("asset_number");

-- CreateIndex
CREATE INDEX "bank_accounts_account_id_idx" ON "bank_accounts"("account_id");

-- CreateIndex
CREATE INDEX "bank_accounts_is_active_name_idx" ON "bank_accounts"("is_active", "name");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_match_status_idx" ON "bank_transactions"("bank_account_id", "match_status");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_date_idx" ON "bank_transactions"("bank_account_id", "date");

-- CreateIndex
CREATE INDEX "bank_transactions_transaction_line_id_idx" ON "bank_transactions"("transaction_line_id");

-- CreateIndex
CREATE INDEX "bank_transactions_date_idx" ON "bank_transactions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_bank_account_id_import_id_key" ON "bank_transactions"("bank_account_id", "import_id");

-- CreateIndex
CREATE INDEX "reconciliations_account_id_statement_date_idx" ON "reconciliations"("account_id", "statement_date");

-- CreateIndex
CREATE INDEX "reconciliations_account_id_status_idx" ON "reconciliations"("account_id", "status");

-- CreateIndex
CREATE INDEX "reconciliations_bank_account_id_idx" ON "reconciliations"("bank_account_id");

-- CreateIndex
CREATE INDEX "bank_rules_is_active_priority_idx" ON "bank_rules"("is_active", "priority");

-- CreateIndex
CREATE INDEX "bank_rules_name_idx" ON "bank_rules"("name");

-- CreateIndex
CREATE INDEX "import_batches_bank_account_id_imported_at_idx" ON "import_batches"("bank_account_id", "imported_at");

-- CreateIndex
CREATE INDEX "import_batches_channel_idx" ON "import_batches"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_bank_account_id_fingerprint_occurrence_key" ON "import_batches"("bank_account_id", "fingerprint", "occurrence");

-- CreateIndex
CREATE INDEX "employees_last_name_first_name_idx" ON "employees"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "employees_is_active_idx" ON "employees"("is_active");

-- CreateIndex
CREATE INDEX "employees_employee_group_id_idx" ON "employees"("employee_group_id");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employees"("manager_id");

-- CreateIndex
CREATE INDEX "employees_work_state_idx" ON "employees"("work_state");

-- CreateIndex
CREATE UNIQUE INDEX "employees_portal_token_key" ON "employees"("portal_token");

-- CreateIndex
CREATE INDEX "employee_bank_accounts_employee_id_priority_idx" ON "employee_bank_accounts"("employee_id", "priority");

-- CreateIndex
CREATE INDEX "pay_runs_pay_date_idx" ON "pay_runs"("pay_date");

-- CreateIndex
CREATE INDEX "pay_runs_status_pay_date_idx" ON "pay_runs"("status", "pay_date");

-- CreateIndex
CREATE INDEX "pay_runs_run_type_pay_date_idx" ON "pay_runs"("run_type", "pay_date");

-- CreateIndex
CREATE INDEX "pay_stubs_employee_id_idx" ON "pay_stubs"("employee_id");

-- CreateIndex
CREATE INDEX "pay_stubs_pay_run_id_idx" ON "pay_stubs"("pay_run_id");

-- CreateIndex
CREATE INDEX "pay_stub_lines_pay_stub_id_sequence_idx" ON "pay_stub_lines"("pay_stub_id", "sequence");

-- CreateIndex
CREATE INDEX "pay_stub_lines_line_type_idx" ON "pay_stub_lines"("line_type");

-- CreateIndex
CREATE UNIQUE INDEX "pay_stub_lines_pay_stub_id_detail_key_key" ON "pay_stub_lines"("pay_stub_id", "detail_key");

-- CreateIndex
CREATE INDEX "time_entries_employee_id_date_idx" ON "time_entries"("employee_id", "date");

-- CreateIndex
CREATE INDEX "time_entries_date_idx" ON "time_entries"("date");

-- CreateIndex
CREATE INDEX "time_entries_status_pay_run_id_idx" ON "time_entries"("status", "pay_run_id");

-- CreateIndex
CREATE INDEX "time_entries_pay_run_id_idx" ON "time_entries"("pay_run_id");

-- CreateIndex
CREATE INDEX "time_entries_job_id_cost_code_id_idx" ON "time_entries"("job_id", "cost_code_id");

-- CreateIndex
CREATE INDEX "garnishment_orders_employee_id_priority_idx" ON "garnishment_orders"("employee_id", "priority");

-- CreateIndex
CREATE INDEX "garnishment_orders_is_active_idx" ON "garnishment_orders"("is_active");

-- CreateIndex
CREATE INDEX "benefit_codes_sequence_code_idx" ON "benefit_codes"("sequence", "code");

-- CreateIndex
CREATE INDEX "benefit_codes_is_active_idx" ON "benefit_codes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_codes_code_key" ON "benefit_codes"("code");

-- CreateIndex
CREATE INDEX "benefit_rates_benefit_code_id_effective_from_idx" ON "benefit_rates"("benefit_code_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_rates_benefit_code_id_effective_from_key" ON "benefit_rates"("benefit_code_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "employee_groups_name_key" ON "employee_groups"("name");

-- CreateIndex
CREATE INDEX "employee_group_benefits_group_id_idx" ON "employee_group_benefits"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_group_benefits_group_id_benefit_code_id_key" ON "employee_group_benefits"("group_id", "benefit_code_id");

-- CreateIndex
CREATE INDEX "employee_benefits_employee_id_is_active_idx" ON "employee_benefits"("employee_id", "is_active");

-- CreateIndex
CREATE INDEX "employee_benefits_benefit_code_id_idx" ON "employee_benefits"("benefit_code_id");

-- CreateIndex
CREATE INDEX "benefit_ytd_year_idx" ON "benefit_ytd"("year");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_ytd_employee_id_benefit_code_id_year_key" ON "benefit_ytd"("employee_id", "benefit_code_id", "year");

-- CreateIndex
CREATE INDEX "pay_stub_benefits_pay_stub_id_sequence_idx" ON "pay_stub_benefits"("pay_stub_id", "sequence");

-- CreateIndex
CREATE INDEX "pay_stub_benefits_benefit_code_id_idx" ON "pay_stub_benefits"("benefit_code_id");

-- CreateIndex
CREATE INDEX "pay_stub_benefits_remittance_vendor_id_idx" ON "pay_stub_benefits"("remittance_vendor_id");

-- CreateIndex
CREATE INDEX "pto_policies_pto_type_idx" ON "pto_policies"("pto_type");

-- CreateIndex
CREATE INDEX "pto_policies_name_idx" ON "pto_policies"("name");

-- CreateIndex
CREATE INDEX "pto_accruals_employee_id_idx" ON "pto_accruals"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "pto_accruals_employee_id_policy_id_key" ON "pto_accruals"("employee_id", "policy_id");

-- CreateIndex
CREATE INDEX "pto_requests_employee_id_start_date_idx" ON "pto_requests"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "pto_requests_status_idx" ON "pto_requests"("status");

-- CreateIndex
CREATE INDEX "pto_accrual_entries_pto_balance_id_effective_date_idx" ON "pto_accrual_entries"("pto_balance_id", "effective_date");

-- CreateIndex
CREATE INDEX "pto_accrual_entries_employee_id_effective_date_idx" ON "pto_accrual_entries"("employee_id", "effective_date");

-- CreateIndex
CREATE INDEX "pto_accrual_entries_entry_type_idx" ON "pto_accrual_entries"("entry_type");

-- CreateIndex
CREATE INDEX "onboarding_tasks_employee_id_idx" ON "onboarding_tasks"("employee_id");

-- CreateIndex
CREATE INDEX "onboarding_tasks_status_idx" ON "onboarding_tasks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_tasks_employee_id_task_type_key" ON "onboarding_tasks"("employee_id", "task_type");

-- CreateIndex
CREATE INDEX "document_audits_doc_type_idx" ON "document_audits"("doc_type");

-- CreateIndex
CREATE INDEX "document_audits_doc_key_idx" ON "document_audits"("doc_key");

-- CreateIndex
CREATE INDEX "document_audits_content_hash_idx" ON "document_audits"("content_hash");

-- CreateIndex
CREATE INDEX "document_audits_created_at_idx" ON "document_audits"("created_at");

-- CreateIndex
CREATE INDEX "budgets_year_idx" ON "budgets"("year");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_account_id_year_month_key" ON "budgets"("account_id", "year", "month");

-- CreateIndex
CREATE INDEX "saved_reports_report_type_idx" ON "saved_reports"("report_type");

-- CreateIndex
CREATE INDEX "saved_reports_name_idx" ON "saved_reports"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_layouts_user_id_key" ON "dashboard_layouts"("user_id");

-- CreateIndex
CREATE INDEX "jobs_customer_id_idx" ON "jobs"("customer_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_is_active_idx" ON "jobs"("is_active");

-- CreateIndex
CREATE INDEX "cost_codes_parent_id_idx" ON "cost_codes"("parent_id");

-- CreateIndex
CREATE INDEX "cost_codes_cost_type_idx" ON "cost_codes"("cost_type");

-- CreateIndex
CREATE UNIQUE INDEX "cost_codes_code_key" ON "cost_codes"("code");

-- CreateIndex
CREATE INDEX "cost_types_sort_order_code_idx" ON "cost_types"("sort_order", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_types_code_key" ON "cost_types"("code");

-- CreateIndex
CREATE INDEX "equipment_name_idx" ON "equipment"("name");

-- CreateIndex
CREATE INDEX "equipment_is_active_idx" ON "equipment"("is_active");

-- CreateIndex
CREATE INDEX "job_costs_date_idx" ON "job_costs"("date");

-- CreateIndex
CREATE INDEX "job_costs_job_id_idx" ON "job_costs"("job_id");

-- CreateIndex
CREATE INDEX "job_costs_status_idx" ON "job_costs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "job_costs_number_key" ON "job_costs"("number");

-- CreateIndex
CREATE INDEX "job_cost_lines_job_cost_id_idx" ON "job_cost_lines"("job_cost_id");

-- CreateIndex
CREATE INDEX "job_cost_lines_job_id_idx" ON "job_cost_lines"("job_id");

-- CreateIndex
CREATE INDEX "job_cost_lines_cost_code_id_idx" ON "job_cost_lines"("cost_code_id");

-- CreateIndex
CREATE INDEX "job_cost_lines_time_entry_id_idx" ON "job_cost_lines"("time_entry_id");

-- CreateIndex
CREATE INDEX "job_budgets_job_id_idx" ON "job_budgets"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_budgets_job_id_cost_code_id_cost_type_key" ON "job_budgets"("job_id", "cost_code_id", "cost_type");

-- CreateIndex
CREATE INDEX "classes_is_archived_idx" ON "classes"("is_archived");

-- CreateIndex
CREATE INDEX "classes_restriction_idx" ON "classes"("restriction");

-- CreateIndex
CREATE UNIQUE INDEX "classes_name_key" ON "classes"("name");

-- CreateIndex
CREATE INDEX "restriction_releases_date_idx" ON "restriction_releases"("date");

-- CreateIndex
CREATE INDEX "restriction_releases_class_id_idx" ON "restriction_releases"("class_id");

-- CreateIndex
CREATE INDEX "restriction_releases_status_idx" ON "restriction_releases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "restriction_releases_number_key" ON "restriction_releases"("number");

-- CreateIndex
CREATE INDEX "allocation_rules_is_active_idx" ON "allocation_rules"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_rules_name_key" ON "allocation_rules"("name");

-- CreateIndex
CREATE INDEX "allocation_rule_targets_rule_id_idx" ON "allocation_rule_targets"("rule_id");

-- CreateIndex
CREATE INDEX "functional_allocations_date_idx" ON "functional_allocations"("date");

-- CreateIndex
CREATE INDEX "functional_allocations_rule_id_idx" ON "functional_allocations"("rule_id");

-- CreateIndex
CREATE INDEX "functional_allocations_status_idx" ON "functional_allocations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "functional_allocations_number_key" ON "functional_allocations"("number");

-- CreateIndex
CREATE INDEX "in_kind_gifts_date_idx" ON "in_kind_gifts"("date");

-- CreateIndex
CREATE INDEX "in_kind_gifts_customer_id_idx" ON "in_kind_gifts"("customer_id");

-- CreateIndex
CREATE INDEX "in_kind_gifts_status_idx" ON "in_kind_gifts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "in_kind_gifts_number_key" ON "in_kind_gifts"("number");

-- CreateIndex
CREATE INDEX "in_kind_gift_lines_in_kind_gift_id_idx" ON "in_kind_gift_lines"("in_kind_gift_id");

-- CreateIndex
CREATE INDEX "attachments_entity_type_entity_id_idx" ON "attachments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "attachments_employee_id_idx" ON "attachments"("employee_id");

-- CreateIndex
CREATE INDEX "attachments_uploaded_at_idx" ON "attachments"("uploaded_at");

-- CreateIndex
CREATE INDEX "backups_created_at_idx" ON "backups"("created_at");

-- CreateIndex
CREATE INDEX "ocr_templates_merchant_key_idx" ON "ocr_templates"("merchant_key");

-- CreateIndex
CREATE UNIQUE INDEX "ocr_templates_merchant_key_key" ON "ocr_templates"("merchant_key");

-- CreateIndex
CREATE INDEX "ocr_intakes_status_idx" ON "ocr_intakes"("status");

-- CreateIndex
CREATE INDEX "ocr_intakes_created_at_idx" ON "ocr_intakes"("created_at");

-- CreateIndex
CREATE INDEX "ocr_intakes_expires_at_idx" ON "ocr_intakes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ocr_intakes_intake_id_key" ON "ocr_intakes"("intake_id");

-- CreateIndex
CREATE INDEX "qbo_mappings_entity_type_idx" ON "qbo_mappings"("entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_mappings_entity_type_slowbooks_id_key" ON "qbo_mappings"("entity_type", "slowbooks_id");

-- CreateIndex
CREATE UNIQUE INDEX "qbo_mappings_entity_type_qbo_id_key" ON "qbo_mappings"("entity_type", "qbo_id");

-- CreateIndex
CREATE INDEX "ai_provider_configs_is_active_idx" ON "ai_provider_configs"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_configs_provider_key" ON "ai_provider_configs"("provider");

-- CreateIndex
CREATE INDEX "migration_runs_source_idx" ON "migration_runs"("source");

-- CreateIndex
CREATE INDEX "migration_runs_started_at_idx" ON "migration_runs"("started_at");

-- CreateIndex
CREATE INDEX "migration_runs_status_idx" ON "migration_runs"("status");

-- CreateIndex
CREATE INDEX "search_index_entries_entity_type_is_active_idx" ON "search_index_entries"("entity_type", "is_active");

-- CreateIndex
CREATE INDEX "search_index_entries_entity_type_entry_date_idx" ON "search_index_entries"("entity_type", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "search_index_entries_entity_type_entity_id_key" ON "search_index_entries"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_id_fkey" FOREIGN KEY ("reversal_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_billed_invoice_line_id_fkey" FOREIGN KEY ("billed_invoice_line_id") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_category_mappings" ADD CONSTRAINT "tax_category_mappings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_income_account_id_fkey" FOREIGN KEY ("income_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurring_invoice_id_fkey" FOREIGN KEY ("recurring_invoice_id") REFERENCES "recurring_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_converted_invoice_id_fkey" FOREIGN KEY ("converted_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_deposit_to_account_id_fkey" FOREIGN KEY ("deposit_to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_original_invoice_id_fkey" FOREIGN KEY ("original_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memos" ADD CONSTRAINT "credit_memos_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memo_lines" ADD CONSTRAINT "credit_memo_lines_credit_memo_id_fkey" FOREIGN KEY ("credit_memo_id") REFERENCES "credit_memos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_memo_lines" ADD CONSTRAINT "credit_memo_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_credit_memo_id_fkey" FOREIGN KEY ("credit_memo_id") REFERENCES "credit_memos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_lines" ADD CONSTRAINT "recurring_invoice_lines_recurring_invoice_id_fkey" FOREIGN KEY ("recurring_invoice_id") REFERENCES "recurring_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_lines" ADD CONSTRAINT "recurring_invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_accesses" ADD CONSTRAINT "portal_accesses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_default_expense_account_id_fkey" FOREIGN KEY ("default_expense_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_w9_document_id_fkey" FOREIGN KEY ("w9_document_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_billed_invoice_line_id_fkey" FOREIGN KEY ("billed_invoice_line_id") REFERENCES "invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_pay_from_account_id_fkey" FOREIGN KEY ("pay_from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment_allocations" ADD CONSTRAINT "bill_payment_allocations_bill_payment_id_fkey" FOREIGN KEY ("bill_payment_id") REFERENCES "bill_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment_allocations" ADD CONSTRAINT "bill_payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_original_bill_id_fkey" FOREIGN KEY ("original_bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credits" ADD CONSTRAINT "vendor_credits_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_lines" ADD CONSTRAINT "vendor_credit_lines_vendor_credit_id_fkey" FOREIGN KEY ("vendor_credit_id") REFERENCES "vendor_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_lines" ADD CONSTRAINT "vendor_credit_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_lines" ADD CONSTRAINT "vendor_credit_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_lines" ADD CONSTRAINT "vendor_credit_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_lines" ADD CONSTRAINT "vendor_credit_lines_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_lines" ADD CONSTRAINT "vendor_credit_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_applications" ADD CONSTRAINT "vendor_credit_applications_vendor_credit_id_fkey" FOREIGN KEY ("vendor_credit_id") REFERENCES "vendor_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_credit_applications" ADD CONSTRAINT "vendor_credit_applications_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_types" ADD CONSTRAINT "fixed_asset_types_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_types" ADD CONSTRAINT "fixed_asset_types_accumulated_depreciation_account_id_fkey" FOREIGN KEY ("accumulated_depreciation_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_types" ADD CONSTRAINT "fixed_asset_types_depreciation_expense_account_id_fkey" FOREIGN KEY ("depreciation_expense_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_asset_type_id_fkey" FOREIGN KEY ("asset_type_id") REFERENCES "fixed_asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_category_account_id_fkey" FOREIGN KEY ("category_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_transaction_line_id_fkey" FOREIGN KEY ("transaction_line_id") REFERENCES "transaction_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_rules" ADD CONSTRAINT "bank_rules_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_employee_group_id_fkey" FOREIGN KEY ("employee_group_id") REFERENCES "employee_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_burden_job_cost_id_fkey" FOREIGN KEY ("burden_job_cost_id") REFERENCES "job_costs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stubs" ADD CONSTRAINT "pay_stubs_pay_run_id_fkey" FOREIGN KEY ("pay_run_id") REFERENCES "pay_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stubs" ADD CONSTRAINT "pay_stubs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stub_lines" ADD CONSTRAINT "pay_stub_lines_pay_stub_id_fkey" FOREIGN KEY ("pay_stub_id") REFERENCES "pay_stubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stub_lines" ADD CONSTRAINT "pay_stub_lines_benefit_code_id_fkey" FOREIGN KEY ("benefit_code_id") REFERENCES "benefit_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stub_lines" ADD CONSTRAINT "pay_stub_lines_garnishment_order_id_fkey" FOREIGN KEY ("garnishment_order_id") REFERENCES "garnishment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_job_cost_id_fkey" FOREIGN KEY ("job_cost_id") REFERENCES "job_costs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_pay_run_id_fkey" FOREIGN KEY ("pay_run_id") REFERENCES "pay_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garnishment_orders" ADD CONSTRAINT "garnishment_orders_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_codes" ADD CONSTRAINT "benefit_codes_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_codes" ADD CONSTRAINT "benefit_codes_liability_account_id_fkey" FOREIGN KEY ("liability_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_codes" ADD CONSTRAINT "benefit_codes_remittance_vendor_id_fkey" FOREIGN KEY ("remittance_vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_rates" ADD CONSTRAINT "benefit_rates_benefit_code_id_fkey" FOREIGN KEY ("benefit_code_id") REFERENCES "benefit_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_benefits" ADD CONSTRAINT "employee_group_benefits_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "employee_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_benefits" ADD CONSTRAINT "employee_group_benefits_benefit_code_id_fkey" FOREIGN KEY ("benefit_code_id") REFERENCES "benefit_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_benefit_code_id_fkey" FOREIGN KEY ("benefit_code_id") REFERENCES "benefit_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_ytd" ADD CONSTRAINT "benefit_ytd_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_ytd" ADD CONSTRAINT "benefit_ytd_benefit_code_id_fkey" FOREIGN KEY ("benefit_code_id") REFERENCES "benefit_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stub_benefits" ADD CONSTRAINT "pay_stub_benefits_pay_stub_id_fkey" FOREIGN KEY ("pay_stub_id") REFERENCES "pay_stubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stub_benefits" ADD CONSTRAINT "pay_stub_benefits_benefit_code_id_fkey" FOREIGN KEY ("benefit_code_id") REFERENCES "benefit_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stub_benefits" ADD CONSTRAINT "pay_stub_benefits_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stub_benefits" ADD CONSTRAINT "pay_stub_benefits_liability_account_id_fkey" FOREIGN KEY ("liability_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_stub_benefits" ADD CONSTRAINT "pay_stub_benefits_remittance_vendor_id_fkey" FOREIGN KEY ("remittance_vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_policies" ADD CONSTRAINT "pto_policies_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_policies" ADD CONSTRAINT "pto_policies_liability_account_id_fkey" FOREIGN KEY ("liability_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_accruals" ADD CONSTRAINT "pto_accruals_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_accruals" ADD CONSTRAINT "pto_accruals_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "pto_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_accrual_entries" ADD CONSTRAINT "pto_accrual_entries_pto_balance_id_fkey" FOREIGN KEY ("pto_balance_id") REFERENCES "pto_accruals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_accrual_entries" ADD CONSTRAINT "pto_accrual_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_accrual_entries" ADD CONSTRAINT "pto_accrual_entries_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "pto_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_accrual_entries" ADD CONSTRAINT "pto_accrual_entries_pay_run_id_fkey" FOREIGN KEY ("pay_run_id") REFERENCES "pay_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_accrual_entries" ADD CONSTRAINT "pto_accrual_entries_pto_request_id_fkey" FOREIGN KEY ("pto_request_id") REFERENCES "pto_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_accrual_entries" ADD CONSTRAINT "pto_accrual_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_types" ADD CONSTRAINT "cost_types_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_types" ADD CONSTRAINT "cost_types_offset_account_id_fkey" FOREIGN KEY ("offset_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_types" ADD CONSTRAINT "cost_types_burden_offset_account_id_fkey" FOREIGN KEY ("burden_offset_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_recovery_account_id_fkey" FOREIGN KEY ("recovery_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_costs" ADD CONSTRAINT "job_costs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cost_lines" ADD CONSTRAINT "job_cost_lines_job_cost_id_fkey" FOREIGN KEY ("job_cost_id") REFERENCES "job_costs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cost_lines" ADD CONSTRAINT "job_cost_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cost_lines" ADD CONSTRAINT "job_cost_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cost_lines" ADD CONSTRAINT "job_cost_lines_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cost_lines" ADD CONSTRAINT "job_cost_lines_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cost_lines" ADD CONSTRAINT "job_cost_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cost_lines" ADD CONSTRAINT "job_cost_lines_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cost_lines" ADD CONSTRAINT "job_cost_lines_time_entry_id_fkey" FOREIGN KEY ("time_entry_id") REFERENCES "time_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_budgets" ADD CONSTRAINT "job_budgets_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_budgets" ADD CONSTRAINT "job_budgets_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_budgets" ADD CONSTRAINT "job_budgets_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restriction_releases" ADD CONSTRAINT "restriction_releases_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restriction_releases" ADD CONSTRAINT "restriction_releases_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_rules" ADD CONSTRAINT "allocation_rules_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_rules" ADD CONSTRAINT "allocation_rules_source_class_id_fkey" FOREIGN KEY ("source_class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_rule_targets" ADD CONSTRAINT "allocation_rule_targets_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "allocation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_rule_targets" ADD CONSTRAINT "allocation_rule_targets_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_rule_targets" ADD CONSTRAINT "allocation_rule_targets_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "functional_allocations" ADD CONSTRAINT "functional_allocations_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "allocation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "functional_allocations" ADD CONSTRAINT "functional_allocations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gifts" ADD CONSTRAINT "in_kind_gifts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gifts" ADD CONSTRAINT "in_kind_gifts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gifts" ADD CONSTRAINT "in_kind_gifts_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gifts" ADD CONSTRAINT "in_kind_gifts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gift_lines" ADD CONSTRAINT "in_kind_gift_lines_in_kind_gift_id_fkey" FOREIGN KEY ("in_kind_gift_id") REFERENCES "in_kind_gifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gift_lines" ADD CONSTRAINT "in_kind_gift_lines_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gift_lines" ADD CONSTRAINT "in_kind_gift_lines_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gift_lines" ADD CONSTRAINT "in_kind_gift_lines_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_kind_gift_lines" ADD CONSTRAINT "in_kind_gift_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_intakes" ADD CONSTRAINT "ocr_intakes_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "ocr_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_intakes" ADD CONSTRAINT "ocr_intakes_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Ledger invariants Prisma cannot express
-- ---------------------------------------------------------------------------
ALTER TABLE "transaction_lines"
  ADD CONSTRAINT "ck_debit_or_credit"
  CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0));

CREATE UNIQUE INDEX "uq_user_preference_operator"
  ON "user_preferences" ("key") WHERE "user_id" IS NULL;
