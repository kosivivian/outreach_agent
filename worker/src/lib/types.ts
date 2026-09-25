export interface RefinedICP {
  target_company_type: string
  industries: string[]
  geography: string[]
  headcount_range: { min: number; max: number }
  buyer_persona: string
  business_problem: string
  hard_filters: string[]
  soft_preferences: string[]
  disqualifiers: string[]
  inferred_fields: string[]
}

export interface ToolLimits {
  target_lead_count: number
  max_companies_per_round: number   // ceil(target * 1.3)
  max_search_rounds: number
  max_websites_scraped: number
  max_agent_turns: number
  max_tool_calls: number
}

export interface CampaignSettings {
  tone: string | null
  offer: string | null
  target_persona: string | null
  additional_context: string | null
}

export interface RunRecord {
  id: string
  user_id: string
  original_objective: string
  target_lead_count: number
  tool_limits: Partial<ToolLimits>
  refined_icp: RefinedICP | null
  icp_status: string
  overall_status: string
  current_phase: number
  search_round: number
  campaign_settings_id: string | null
}

export const PHASE_NAMES: Record<number, string> = {
  1: 'ICP Refinement',
  2: 'ICP & Cost Review',
  3: 'Company Discovery',
  4: 'Website Scraping',
  5: 'Lead Qualification',
  6: 'Outreach Copywriting',
  7: 'Quality Validation',
}

/** Never size a run below this; small campaigns still need room for planning, retries and validation. */
export const MIN_RUN_LIMIT = 200

/**
 * Turn and tool-call budget for a campaign: ~12 turns and ~6 tool calls per candidate company per
 * search round, plus overhead, plus 10%. Mirrored in the web app's lib/limits.ts — keep them in sync.
 */
export function estimateLimits(target: number, searchRounds: number): { max_agent_turns: number; max_tool_calls: number } {
  const companies = Math.ceil(target * 1.3) * searchRounds
  return {
    max_agent_turns: Math.max(MIN_RUN_LIMIT, Math.round((companies * 12 + 20) * 1.1)),
    max_tool_calls: Math.max(MIN_RUN_LIMIT, Math.round((companies * 6 + 15) * 1.1)),
  }
}

export function resolveLimits(run: Pick<RunRecord, 'target_lead_count' | 'tool_limits'>): ToolLimits {
  const target = run.target_lead_count
  const perRound = Math.ceil(target * 1.3)
  const l = run.tool_limits || {}
  const searchRounds = l.max_search_rounds ?? 2
  const defaults = estimateLimits(target, searchRounds)
  return {
    target_lead_count: target,
    max_companies_per_round: perRound,
    max_search_rounds: searchRounds,
    max_websites_scraped: l.max_websites_scraped ?? perRound * searchRounds,
    // The higher of the saved limit and the size-based one, so runs saved with older, lower limits still grow.
    max_agent_turns: Math.max(l.max_agent_turns ?? 0, defaults.max_agent_turns),
    max_tool_calls: Math.max(l.max_tool_calls ?? 0, defaults.max_tool_calls),
  }
}
