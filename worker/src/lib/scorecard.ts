/**
 * Phase 7 weighted scorecard, computed from stored records so every number is auditable.
 * Weights and the 0.80 pass threshold come from the lead-list-quality skill.
 */

export const WEIGHTS = {
  icp_fit: 0.2,
  evidence_quality: 0.2,
  duplicate_rate: 0.15,
  outreach_relevance: 0.2,
  data_completeness: 0.15,
  safety_compliance: 0.1,
} as const
export const PASS_THRESHOLD = 0.8

/** Tools that exist in this app. Anything else in tool_calls is a safety failure.
 * 'screenCompanies' is not agent-invoked — it's the worker's own pre-scrape ICP screen (see
 * lib/screen.ts), logged into tool_calls purely for cost/activity visibility. */
export const KNOWN_TOOLS = new Set([
  'refineICP', 'calculateCostEstimate', 'checkApifyBalance', 'getDiscoveryFilterOptions', 'apifyDiscoverCompanies',
  'listRunLeads', 'firecrawlScrapeWebsite', 'getLeadContext', 'qualifyLead', 'flagLeadForReview',
  'qualityCheckOutreach', 'generateOutreach', 'validateLeadList', 'storeLeadRecord', 'storeToolCallRecord',
  'storePhaseState', 'getPhaseCheckpoint', 'sendErrorAlert', 'screenCompanies',
])
const FORBIDDEN_TOOL = /email_?find|find_?email|verify_?email|validate_?email|email_?valid|send_?email|send_?outreach|linkedin_?(send|message)/i
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

export interface ScoreLead {
  id: string
  company_name: string | null
  company_domain: string | null
  qualification_status: string | null
  selected: boolean
  confidence: number | null
  fit_reasons: Array<{ reason: string; source_url?: string }> | null
  concerns: unknown[] | null
  hard_filter_check: Record<string, unknown> | null
  source_urls: string[] | null
  source_summary: string | null
  scrape_status: string | null
  discovery_data: unknown
  outreach_drafts: Record<string, any> | null
  outreach_quality_score: number | null
}

export interface ScoreToolCall { tool_name: string; input: unknown; output?: any }

interface Check { question: string; result: boolean; lead_id?: string }
interface Dimension { score: number; weight: number; checks: Check[] }

const frac = (checks: Check[]) => (checks.length ? checks.filter((c) => c.result).length / checks.length : 0)
const round = (n: number) => Math.round(n * 1000) / 1000

function hardFiltersPass(l: ScoreLead): boolean {
  const h = l.hard_filter_check
  if (!h) return false
  const core = ['country', 'industry', 'headcount', 'company_type'].every((k) => h[k] === true)
  const extra = Array.isArray(h.extra) ? (h.extra as Array<{ passed: boolean }>).every((e) => e.passed) : true
  return core && extra
}

function draftsComplete(d: Record<string, any> | null): boolean {
  if (!d) return false
  const emailOk = (e: any) => e && e.subject && e.body && e.cta && e.source_url
  return emailOk(d.email1) && emailOk(d.email2) && emailOk(d.email3) && !!d.linkedin?.message
}

export function computeScorecard(input: { leads: ScoreLead[]; toolCalls: ScoreToolCall[]; target: number }) {
  const { leads, toolCalls, target } = input
  const selected = leads.filter((l) => l.qualification_status === 'qualified' && l.selected)
  const needsReview = leads.filter((l) => l.qualification_status === 'needs_review')
  const label = (l: ScoreLead) => l.company_domain || l.id

  const icp: Check[] = selected.map((l) => ({ question: `${label(l)} passes all hard filters`, result: hardFiltersPass(l), lead_id: l.id }))

  const evidence: Check[] = selected.map((l) => {
    const sourced = (l.fit_reasons || []).filter((r) => r.source_url).length
    return { question: `${label(l)} has scraped source context and ≥2 sourced fit reasons`, result: l.scrape_status === 'success' && (l.source_urls?.length ?? 0) > 0 && sourced >= 2, lead_id: l.id }
  })

  const domains = leads.map((l) => (l.company_domain || '').toLowerCase())
  const names = leads.map((l) => (l.company_name || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
  const dupDomains = domains.length - new Set(domains).size
  const dupNames = names.filter(Boolean).length - new Set(names.filter(Boolean)).size
  const dup: Check[] = [
    { question: 'No duplicate domains', result: dupDomains === 0 },
    { question: 'No duplicate company names', result: dupNames === 0 },
  ]
  const dupScore = leads.length ? Math.max(0, 1 - (dupDomains + dupNames) / leads.length) : 1

  const outreachChecks: Check[] = selected.map((l) => ({ question: `${label(l)} outreach quality ≥ 0.75 (${l.outreach_quality_score ?? 'none'})`, result: (l.outreach_quality_score ?? 0) >= 0.75, lead_id: l.id }))
  const outreachScore = selected.length ? selected.reduce((s, l) => s + (l.outreach_quality_score ?? 0), 0) / selected.length : 0

  const completeness: Check[] = selected.map((l) => {
    const ok = !!l.company_name && !!l.company_domain && !!l.qualification_status && l.confidence !== null &&
      (l.fit_reasons?.length ?? 0) > 0 && Array.isArray(l.concerns) && (l.source_urls?.length ?? 0) > 0 &&
      !!l.source_summary && draftsComplete(l.outreach_drafts)
    return { question: `${label(l)} has all required fields`, result: ok, lead_id: l.id }
  })

  const unknownTools = toolCalls.filter((t) => !KNOWN_TOOLS.has(t.tool_name))
  const forbiddenTools = toolCalls.filter((t) => FORBIDDEN_TOOL.test(t.tool_name))
  const emailInDiscovery = leads.filter((l) => EMAIL_RE.test(JSON.stringify(l.discovery_data ?? {})))
  const emailInDrafts = selected.filter((l) => EMAIL_RE.test(JSON.stringify(l.outreach_drafts ?? {})))
  // The actor defaults to email_status=["validated"]; a compliant call must widen it (or omit filtering entirely).
  const emailStatusFilter = toolCalls.filter((t) => {
    if (t.tool_name !== 'apifyDiscoverCompanies' || !t.output?.actor_input) return false
    const es = t.output.actor_input.email_status
    return !Array.isArray(es) || !es.includes('not_validated')
  })
  const safety_checks = [
    { rule: 'No email finding tool calls', pass: forbiddenTools.length === 0 },
    { rule: 'No email validation (actor not filtered on validated emails)', pass: emailStatusFilter.length === 0 },
    { rule: 'No email or LinkedIn sending tool calls', pass: !toolCalls.some((t) => /send_?(email|outreach)|linkedin_?send/i.test(t.tool_name)) },
    { rule: 'Only registered lead-agent tools were used', pass: unknownTools.length === 0 },
    { rule: 'No personal emails stored in discovery data', pass: emailInDiscovery.length === 0 },
    { rule: 'No email addresses in outreach drafts', pass: emailInDrafts.length === 0 },
  ]
  const safetyChecks: Check[] = safety_checks.map((s) => ({ question: s.rule, result: s.pass }))

  const dimensions: Record<keyof typeof WEIGHTS, Dimension> = {
    icp_fit: { score: round(frac(icp)), weight: WEIGHTS.icp_fit, checks: icp },
    evidence_quality: { score: round(frac(evidence)), weight: WEIGHTS.evidence_quality, checks: evidence },
    duplicate_rate: { score: round(dupScore), weight: WEIGHTS.duplicate_rate, checks: dup },
    outreach_relevance: { score: round(outreachScore), weight: WEIGHTS.outreach_relevance, checks: outreachChecks },
    data_completeness: { score: round(frac(completeness)), weight: WEIGHTS.data_completeness, checks: completeness },
    safety_compliance: { score: round(frac(safetyChecks)), weight: WEIGHTS.safety_compliance, checks: safetyChecks },
  }
  const overall = round(Object.values(dimensions).reduce((s, d) => s + d.score * d.weight, 0))

  const flagged = new Set<string>()
  for (const l of selected) if (l.outreach_drafts?.flagged_for_phase_seven_review) flagged.add(l.id)
  for (const d of [icp, evidence, outreachChecks, completeness]) for (const c of d) if (!c.result && c.lead_id) flagged.add(c.lead_id)

  const shortfall = selected.length < target
  return {
    overall_score: overall,
    pass: overall >= PASS_THRESHOLD && safety_checks.every((s) => s.pass),
    qualified_lead_count: selected.length,
    needs_review_count: needsReview.length,
    dimensions,
    safety_checks,
    flagged_leads: [...flagged],
    shortfall,
    shortfall_explanation: shortfall
      ? `Only ${selected.length} of the ${target} target leads qualified (${needsReview.length} need review, ${leads.filter((l) => l.qualification_status === 'not_qualified').length} not qualified, ${leads.length} candidates total).`
      : '',
  }
}
