/** Cost model. Apify prices are from the leads-finder pay-per-event pricing; the rest follow the implementation plan. */
export const COST = {
  apifyActorStartUsd: 0.02,
  apifyPerRowUsd: 0.002,
  firecrawlPerScrapeUsd: 0.1,
  claudeQualifyPerLeadUsd: 0.12,
  claudeCopyPerLeadUsd: 0.25,
  // claude-sonnet-4-6 per-token pricing (USD per million tokens)
  claudeInputPerMTok: 3,
  claudeOutputPerMTok: 15,
  claudeCacheReadPerMTok: 0.3,
  claudeCacheWritePerMTok: 3.75,
  // claude-haiku-4-5 per-token pricing, used by the pre-scrape company screen
  haikuInputPerMTok: 1,
  haikuOutputPerMTok: 5,
  screenPerCompanyUsd: 0.001,
}

/** leads-finder returns one row per contact, but discovery only requests founder/owner/c_suite
 * contacts (see apifyDiscoverCompanies) — almost always one such person per company. Confirmed
 * empirically: a 78-row request returned 76 distinct companies. Revisit if that seniority filter changes. */
export const ROWS_PER_COMPANY = 1
export const MAX_ROWS_PER_RUN = 200
/** Fetch this many times the scrape cap, then screen down: Apify rows are cheap, scraping + qualifying is not. */
export const SCREEN_OVERFETCH = 2

export function apifyRowsFor(companies: number) {
  return Math.min(companies * ROWS_PER_COMPANY, MAX_ROWS_PER_RUN)
}

export function estimateRunCost(target: number) {
  const candidates = Math.ceil(target * 1.3)
  const fetched = candidates * SCREEN_OVERFETCH
  const rows = apifyRowsFor(fetched)
  const apify_discovery = COST.apifyActorStartUsd + rows * COST.apifyPerRowUsd
  const claude_screening = fetched * COST.screenPerCompanyUsd
  const firecrawl_scraping = candidates * COST.firecrawlPerScrapeUsd
  const claude_qualification = candidates * COST.claudeQualifyPerLeadUsd
  const claude_copywriting = target * COST.claudeCopyPerLeadUsd
  const r = (n: number) => Math.round(n * 100) / 100
  return {
    target_lead_count: target,
    candidate_companies: candidates,
    companies_fetched: fetched,
    apify_rows: rows,
    apify_discovery: r(apify_discovery),
    claude_screening: r(claude_screening),
    firecrawl_scraping: r(firecrawl_scraping),
    claude_qualification: r(claude_qualification),
    claude_copywriting: r(claude_copywriting),
    total: r(apify_discovery + claude_screening + firecrawl_scraping + claude_qualification + claude_copywriting),
  }
}

export function usageCost(u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  return (
    ((u.input_tokens ?? 0) * COST.claudeInputPerMTok +
      (u.output_tokens ?? 0) * COST.claudeOutputPerMTok +
      (u.cache_read_input_tokens ?? 0) * COST.claudeCacheReadPerMTok +
      (u.cache_creation_input_tokens ?? 0) * COST.claudeCacheWritePerMTok) / 1_000_000
  )
}
