import { normalizeDomain } from './companyExtract.js'

export interface EmailDraft { subject: string; body: string; cta: string; personalization_note: string; source_url: string }
export interface OutreachDrafts { email1: EmailDraft; email2: EmailDraft; email3: EmailDraft; linkedin: { message: string; source_url: string } }
export interface LintCheck { check: string; passed: boolean; detail?: string }

export const WORD_LIMITS = { email1: 100, email2: 80, email3: 50, linkedin: 60 } as const

const HYPE = /!!|\bAMAZING\b|LIMITED TIME|\bact now\b|\bguarantee(d)?\b|\burgent(ly)?\b|don'?t miss|last chance|\brevolutionary\b|\bgame[- ]changer\b/i
const GENERIC_PRAISE = /loved what you('| a)re building|looks impressive|i saw your website|impressive company|big fan of your/i
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

function sourceOk(url: string, leadDomain: string, sourceUrls: string[]): boolean {
  if (!url) return false
  if (sourceUrls.includes(url)) return true
  const d = normalizeDomain(url)
  return !!d && (d === leadDomain || d.endsWith(`.${leadDomain}`))
}

/** Deterministic checks that back the model's 5-question self-evaluation. */
export function lintOutreach(drafts: OutreachDrafts, lead: { company_domain: string; source_urls: string[] }): { checks: LintCheck[]; passed: number; total: number } {
  const checks: LintCheck[] = []
  const pieces: Array<[keyof typeof WORD_LIMITS, string, string]> = [
    ['email1', drafts.email1.body, drafts.email1.source_url],
    ['email2', drafts.email2.body, drafts.email2.source_url],
    ['email3', drafts.email3.body, drafts.email3.source_url],
    ['linkedin', drafts.linkedin.message, drafts.linkedin.source_url],
  ]

  for (const [key, text, url] of pieces) {
    const words = wordCount(text)
    checks.push({ check: `${key}: under ${WORD_LIMITS[key]} words`, passed: words <= WORD_LIMITS[key], detail: `${words} words` })
    checks.push({ check: `${key}: source_url belongs to this company's scraped sources`, passed: sourceOk(url, lead.company_domain, lead.source_urls), detail: url || 'missing' })
    const hype = text.match(HYPE)
    checks.push({ check: `${key}: no hype / fake urgency`, passed: !hype, detail: hype?.[0] })
    const praise = text.match(GENERIC_PRAISE)
    checks.push({ check: `${key}: no generic praise`, passed: !praise, detail: praise?.[0] })
    checks.push({ check: `${key}: contains no email addresses or phone numbers`, passed: !EMAIL_RE.test(text) && !PHONE_RE.test(text) })
  }

  for (const k of ['email1', 'email2', 'email3'] as const) {
    const e = drafts[k]
    checks.push({ check: `${k}: subject present and under 60 chars`, passed: !!e.subject.trim() && e.subject.length <= 60 })
    checks.push({ check: `${k}: CTA present`, passed: !!e.cta.trim() })
    checks.push({ check: `${k}: personalization note present`, passed: e.personalization_note.trim().length >= 10 })
  }
  checks.push({ check: 'email1: CTA is a question', passed: drafts.email1.body.includes('?') || drafts.email1.cta.includes('?') })

  const passed = checks.filter((c) => c.passed).length
  return { checks, passed, total: checks.length }
}
