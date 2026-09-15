import 'server-only'

export type DeploymentMode = 'cloud' | 'self-hosted'
export type IsolationTierName = 'schema' | 'database' | 'dedicated' | 'self_hosted'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name}`)
  return v
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

export const env = {
  mode: optional('DEPLOYMENT_MODE', 'self-hosted') as DeploymentMode,
  singleOrgSlug: optional('SINGLE_ORG_SLUG', 'main'),
  singleOrgName: optional('SINGLE_ORG_NAME', 'My Company'),

  controlDatabaseUrl: required('CONTROL_DATABASE_URL'),
  provisionerDatabaseUrl: optional('PROVISIONER_DATABASE_URL', ''),

  defaultTier: optional('DEFAULT_ISOLATION_TIER', 'database') as IsolationTierName,
  defaultDbHost: optional('DEFAULT_DB_HOST', 'localhost'),
  defaultDbPort: Number(optional('DEFAULT_DB_PORT', '5432')),
  sharedTenantDatabase: optional('SHARED_TENANT_DATABASE', 'aob_shared'),

  masterKey: optional('MASTER_KEY', ''),
  storageRoot: optional('STORAGE_ROOT', './data/storage'),

  sessionCookie: optional('SESSION_COOKIE', 'aob_session'),
  sessionIdleSeconds: Number(optional('SESSION_IDLE_TIMEOUT_SECONDS', '14400')),
  sessionMaxAgeSeconds: Number(optional('SESSION_MAX_AGE_SECONDS', '2592000')),

  brand: {
    productName: optional('BRAND_PRODUCT_NAME', 'Aetos One Books'),
    vendorName: optional('BRAND_VENDOR_NAME', 'Aetos Tech Labs'),
    colorPrimary: optional('BRAND_COLOR_PRIMARY', '#1f6feb'),
  },

  appUrl: optional('APP_URL', 'http://localhost:3000'),
} as const

export const isSelfHosted = env.mode === 'self-hosted'
