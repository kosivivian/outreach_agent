/** Mirrors worker/src/lib/types.ts (estimateLimits / resolveLimits) — keep them in sync. */
export const MIN_RUN_LIMIT = 200

export const candidatesPerRound = (target: number) => Math.ceil(target * 1.3)

export function estimateLimits(target: number, searchRounds: number): { max_agent_turns: number; max_tool_calls: number } {
  const companies = candidatesPerRound(target) * searchRounds
  return {
    max_agent_turns: Math.max(MIN_RUN_LIMIT, Math.round((companies * 12 + 20) * 1.1)),
    max_tool_calls: Math.max(MIN_RUN_LIMIT, Math.round((companies * 6 + 15) * 1.1)),
  }
}

export function maxWebsitesScraped(run: { target_lead_count: number; tool_limits: Record<string, number> | null }) {
  const l = run.tool_limits ?? {}
  return l.max_websites_scraped ?? candidatesPerRound(run.target_lead_count) * (l.max_search_rounds ?? 2)
}
