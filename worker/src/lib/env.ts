import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const env = {
  get anthropicKey() { return required('ANTHROPIC_API_KEY') },
  get apifyToken() { return required('APIFY_API_KEY') },
  apifyActorId: process.env.APIFY_ACTOR_ID || 'code_crafter/leads-finder',
  apifyPersonalBudgetUsd: Number(process.env.APIFY_PERSONAL_BUDGET_USD || 5),
  apifyMaxChargePerRunUsd: Number(process.env.APIFY_MAX_CHARGE_PER_RUN_USD || 0.5),
  get firecrawlKey() { return required('FIRECRAWL_API_KEY') },
  /** Scrapes per minute to stay under the Firecrawl plan's rate limit (free plan: 10). */
  firecrawlRpm: Math.max(1, Number(process.env.FIRECRAWL_RPM || 10)),
  get supabaseUrl() { return required('SUPABASE_URL') },
  get supabaseServiceKey() { return required('SUPABASE_SERVICE_ROLE_KEY') },
  resendKey: process.env.RESEND_API_KEY,
  alertFrom: process.env.ALERT_FROM_EMAIL || 'notifications@mailer.kosinebolisa.com',
  opsAlertEmail: process.env.OPS_ALERT_EMAIL,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  get workerSecret() { return required('WORKER_SECRET') },
  model: process.env.AGENT_MODEL || 'claude-sonnet-4-6',
  screenModel: process.env.SCREEN_MODEL || 'claude-haiku-4-5-20251001',
  port: Number(process.env.PORT || 8080),
}
