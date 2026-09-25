/**
 * "Test small, then scale": run leads-finder for 2 rows (≈ $0.024) and show what the
 * company extractor keeps. Prints field NAMES for discarded contact data, never values.
 * Usage: npm run test:apify
 */
import { ApifyClient } from 'apify-client'
import { env } from '../src/lib/env.js'
import { extractCompanies } from '../src/lib/companyExtract.js'

const apify = new ApifyClient({ token: env.apifyToken })
const input = {
  fetch_count: 2,
  file_name: 'smoke-test',
  company_industry: ['computer software'],
  contact_location: ['united states'],
  size: ['11-20', '21-50', '51-100'],
  seniority_level: ['founder', 'owner', 'c_suite'],
  email_status: ['validated', 'not_validated', 'unknown'],
}

const run = await apify.actor(env.apifyActorId).call(input, { maxItems: 2, maxTotalChargeUsd: env.apifyMaxChargePerRunUsd, timeout: 180, memory: 1024 })
console.log(`run ${run.id}: ${run.status} · cost $${(run as any).usageTotalUsd ?? '?'}`)
const { items } = await apify.dataset(run.defaultDatasetId).listItems({ limit: 2 })
console.log('raw keys (values hidden):', [...new Set(items.flatMap((i) => Object.keys(i)))].sort().join(', '))
const { companies, stats } = extractCompanies(items as Record<string, unknown>[], new Set())
console.log('stats:', stats)
console.log('kept company records:', JSON.stringify(companies, null, 2))
