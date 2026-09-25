/**
 * code_crafter/leads-finder returns one row per *contact* (with personal emails,
 * phones, names). The PRD forbids email finding, so we keep an ALLOWLIST of
 * company-level fields and drop everything else before it reaches the agent or
 * Supabase. Any stray email/phone inside an allowed field is redacted too.
 */

const COMPANY_KEY = /^(company|organization|org)[_ ]?/i
const EXTRA_ALLOWED = new Set(['industry', 'keywords', 'company', 'organization'])
const FORBIDDEN_KEY = /email|phone|mobile|first_?name|last_?name|full_?name|person|contact|headline|seniority|job_?title|functional|departments?|personal/i

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g

export interface CompanyCandidate {
  company_name: string
  company_domain: string
  website_url: string
  employee_count: number | null
  industry: string | null
  country: string | null
  discovery_data: Record<string, unknown>
}

export interface ExtractStats {
  rows_in: number
  dropped_no_website: number
  dropped_duplicate: number
  contact_fields_discarded: number
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(EMAIL_RE, '[redacted]').replace(PHONE_RE, '[redacted]')
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !FORBIDDEN_KEY.test(k)).map(([k, v]) => [k, redact(v)]))
  }
  return value
}

/** Keep only company-level keys. Nested `company`/`organization` objects are flattened with a company_ prefix. */
export function companyFields(row: Record<string, unknown>): { fields: Record<string, unknown>; discarded: number } {
  const fields: Record<string, unknown> = {}
  let discarded = 0
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined || value === '') continue
    if ((key === 'company' || key === 'organization') && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_KEY.test(k)) { discarded++; continue }
        fields[`company_${k.replace(COMPANY_KEY, '')}`] = redact(v)
      }
      continue
    }
    const allowed = (COMPANY_KEY.test(key) || EXTRA_ALLOWED.has(key)) && !FORBIDDEN_KEY.test(key)
    if (allowed) fields[key] = redact(value)
    else discarded++
  }
  return { fields, discarded }
}

function pick(f: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = f[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return null
}

export function normalizeDomain(input: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}

export function parseHeadcount(raw: string | null): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/,/g, '')
  if (/^\d+$/.test(cleaned)) return Number(cleaned)
  return null // ranges like "11-50" are kept raw in discovery_data.headcount_raw
}

export function toCandidate(row: Record<string, unknown>): { candidate: CompanyCandidate | null; discarded: number } {
  const { fields, discarded } = companyFields(row)
  const website = pick(fields, ['company_website', 'company_url', 'organization_website', 'company_domain', 'organization_domain'])
  const domain = website ? normalizeDomain(website) : null
  if (!domain) return { candidate: null, discarded }
  const headcountRaw = pick(fields, ['company_size', 'company_employees', 'company_employee_count', 'company_num_employees', 'company_estimated_num_employees', 'organization_size'])
  return {
    discarded,
    candidate: {
      company_name: pick(fields, ['company_name', 'organization_name', 'company']) || domain,
      company_domain: domain,
      website_url: `https://${domain}`,
      employee_count: parseHeadcount(headcountRaw),
      industry: pick(fields, ['company_industry', 'industry', 'organization_industry']),
      country: pick(fields, ['company_country', 'organization_country', 'company_location_country']),
      discovery_data: { ...fields, headcount_raw: headcountRaw },
    },
  }
}

/** Contact rows → unique company candidates, excluding domains already on the run. */
export function extractCompanies(rows: Record<string, unknown>[], existingDomains: Set<string>) {
  const stats: ExtractStats = { rows_in: rows.length, dropped_no_website: 0, dropped_duplicate: 0, contact_fields_discarded: 0 }
  const seen = new Set(existingDomains)
  const out: CompanyCandidate[] = []
  for (const row of rows) {
    const { candidate, discarded } = toCandidate(row)
    stats.contact_fields_discarded += discarded
    if (!candidate) { stats.dropped_no_website++; continue }
    if (seen.has(candidate.company_domain)) { stats.dropped_duplicate++; continue }
    seen.add(candidate.company_domain)
    out.push(candidate)
  }
  return { companies: out, stats }
}
