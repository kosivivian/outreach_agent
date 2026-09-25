import { z } from 'zod'
import { ApifyClient } from 'apify-client'
import { db, must } from '../lib/supabase.js'
import { env } from '../lib/env.js'
import { apifyRowsFor, COST, estimateRunCost, SCREEN_OVERFETCH } from '../lib/cost.js'
import { extractCompanies } from '../lib/companyExtract.js'
import { pickForScraping, screenCompanies } from '../lib/screen.js'
import enums from '../lib/leadsFinderEnums.json' with { type: 'json' }
import { defineTool, mergeCheckpoint, ToolRefusal, type RunContext } from './core.js'

const INDUSTRIES = new Set(enums.industries)
const LOCATIONS = new Set(enums.locations)

let apifyClient: ApifyClient | null = null
const apify = () => (apifyClient ??= new ApifyClient({ token: env.apifyToken }))

/** Map a headcount range onto the actor's size buckets (any overlapping bucket). */
export function sizeBuckets(min: number, max: number): string[] {
  return enums.sizes.filter((b) => {
    const [lo, hi] = b.endsWith('+') ? [Number(b.slice(0, -1)), Infinity] : b.split('-').map(Number)
    return lo <= max && hi >= min
  })
}

/**
 * What Apify actually charged for a pay-per-event run: each charged event × its price.
 * The run object returned by .call() only reflects the start fee, so read the run again after it finishes.
 */
export function apifyChargeUsd(run: any): number | null {
  const counts = run?.chargedEventCounts as Record<string, number> | undefined
  const prices = run?.pricingInfo?.pricingPerEvent?.actorChargeEvents as Record<string, { eventPriceUsd?: number }> | undefined
  if (counts && prices) {
    let total = 0
    for (const [event, n] of Object.entries(counts)) {
      const price = prices[event]?.eventPriceUsd
      if (typeof price !== 'number') return null
      total += n * price
    }
    return Math.round(total * 10000) / 10000
  }
  const usage = Number(run?.usageTotalUsd)
  return Number.isFinite(usage) && usage > 0 ? usage : null
}

/** Apify spend attributed to this user across all their runs (their share of the shared team budget). */
async function personalApifySpend(userId: string): Promise<number> {
  const runs = must(await db().from('runs').select('id').eq('user_id', userId), 'load user runs') as Array<{ id: string }>
  if (!runs.length) return 0
  const calls = must(await db().from('tool_calls').select('cost_actual').eq('tool_name', 'apifyDiscoverCompanies').in('run_id', runs.map((r) => r.id)), 'load apify spend') as Array<{ cost_actual: number | null }>
  return calls.reduce((s, c) => s + Number(c.cost_actual ?? 0), 0)
}

export function icpAndDiscoveryTools(ctx: RunContext) {
  const refineICP = defineTool(ctx, {
    name: 'refineICP',
    description: 'Store the structured ICP criteria generated from the user objective, marking inferred fields. Sets the run to pending_user_review. Only available before the user approves the ICP.',
    purpose: 'Store refined ICP for user review',
    phase: 1,
    schema: {
      refined_icp: z.object({
        target_company_type: z.string(),
        industries: z.array(z.string()).min(1),
        geography: z.array(z.string()).min(1),
        headcount_range: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
        buyer_persona: z.string(),
        business_problem: z.string(),
        hard_filters: z.array(z.string()),
        soft_preferences: z.array(z.string()),
        disqualifiers: z.array(z.string()),
        inferred_fields: z.array(z.string()),
      }),
    },
    summarizeInput: ({ refined_icp: i }) => `${i.target_company_type} · ${i.industries.join(', ')} · ${i.geography.join(', ')} · ${i.headcount_range.min}-${i.headcount_range.max} · inferred: ${i.inferred_fields.join(', ') || 'none'}`,
    handler: async ({ refined_icp }) => {
      if (ctx.run.icp_status === 'approved') throw new ToolRefusal('The ICP has already been approved by the user and cannot be changed by the agent.')
      if (refined_icp.headcount_range.min > refined_icp.headcount_range.max) throw new Error('headcount_range.min must be <= max')
      must(await db().from('runs').update({ refined_icp, icp_status: 'pending_user_review', current_phase: 2 }).eq('id', ctx.runId), 'store icp')
      ctx.run.refined_icp = refined_icp
      return { data: { stored: true, status: 'pending_user_review' }, summary: `ICP stored (${refined_icp.hard_filters.length} hard filters, ${refined_icp.inferred_fields.length} inferred fields)` }
    },
  })

  const calculateCostEstimate = defineTool(ctx, {
    name: 'calculateCostEstimate',
    description: "Calculate the itemised estimated cost for the full run from the run record's target lead count (+30% candidate buffer). Stored for the user's review screen.",
    purpose: 'Cost preview before user commits',
    phase: 2,
    schema: {},
    handler: async () => {
      const estimate = estimateRunCost(ctx.limits.target_lead_count)
      await db().from('runs').update({ total_cost_estimate: estimate.total }).eq('id', ctx.runId)
      await mergeCheckpoint(ctx.runId, 2, { cost_estimate: estimate })
      return { data: estimate, summary: `estimated $${estimate.total} for ${estimate.target_lead_count} leads (${estimate.candidate_companies} candidates)`, costEstimate: estimate.total }
    },
  })

  const checkApifyBalance = defineTool(ctx, {
    name: 'checkApifyBalance',
    description: "Fetch the Apify team account's remaining monthly usage and this user's remaining share of the cohort budget.",
    purpose: 'Verify Apify funds before discovery',
    phase: 2,
    schema: {},
    handler: async () => {
      const limits = await apify().user().limits()
      const teamRemaining = limits ? limits.limits.maxMonthlyUsageUsd - limits.current.monthlyUsageUsd : null
      const spent = await personalApifySpend(ctx.run.user_id)
      const personalRemaining = Math.max(0, env.apifyPersonalBudgetUsd - spent)
      const needed = estimateRunCost(ctx.limits.target_lead_count).apify_discovery
      const balance = {
        team_remaining_usd: teamRemaining === null ? null : Math.round(teamRemaining * 100) / 100,
        personal_budget_usd: env.apifyPersonalBudgetUsd,
        personal_spent_usd: Math.round(spent * 1000) / 1000,
        personal_remaining_usd: Math.round(personalRemaining * 1000) / 1000,
        discovery_estimate_usd: needed,
        sufficient: personalRemaining >= needed && (teamRemaining === null || teamRemaining >= needed),
        currency: 'USD',
      }
      await mergeCheckpoint(ctx.runId, 2, { apify_balance: balance })
      return { data: balance, summary: `personal remaining $${balance.personal_remaining_usd}, team remaining $${balance.team_remaining_usd} → ${balance.sufficient ? 'sufficient' : 'INSUFFICIENT'}` }
    },
  })

  const getDiscoveryFilterOptions = defineTool(ctx, {
    name: 'getDiscoveryFilterOptions',
    description: 'List the exact industry and company-size values the discovery actor accepts. Call before apifyDiscoverCompanies to map the ICP onto valid filters. Locations are lowercase country/state names, e.g. "united states", "california".',
    purpose: 'Map ICP to discovery filters',
    phase: 3,
    schema: {},
    handler: async () => ({ data: { industries: enums.industries, sizes: enums.sizes, location_examples: ['united states', 'united kingdom', 'canada', 'california', 'new york, us'] }, summary: `${enums.industries.length} industries, ${enums.sizes.length} sizes` }),
  })

  const apifyDiscoverCompanies = defineTool(ctx, {
    name: 'apifyDiscoverCompanies',
    description: "Discover companies matching the approved ICP via Apify (code_crafter/leads-finder). The number of companies comes from the run record (target × 1.3 buffer) — you cannot set it. Only companies with a website are kept, contact-level data is stripped, and duplicates are removed. The tool fetches extra companies and screens out clear ICP mismatches before storing leads for scraping (screened-out companies are recorded but never scraped). Returns the new lead ids.",
    purpose: 'Company discovery (Apify)',
    phase: 3,
    schema: {
      company_industry: z.array(z.string()).max(10).describe('Exact values from getDiscoveryFilterOptions.industries'),
      company_keywords: z.array(z.string()).max(10).describe('Free-text keywords, e.g. "saas", "b2b software"'),
      locations: z.array(z.string()).min(1).max(10).describe('Lowercase country/state names, e.g. "united states"'),
      headcount_min: z.number().int().min(1),
      headcount_max: z.number().int().min(1),
      exclude_industries: z.array(z.string()).max(10).optional(),
    },
    summarizeInput: (a) => `industries=[${a.company_industry.join(', ')}] keywords=[${a.company_keywords.join(', ')}] loc=[${a.locations.join(', ')}] headcount=${a.headcount_min}-${a.headcount_max}`,
    handler: async (a) => {
      // Gate: human approval of the ICP + cost is required before any paid discovery.
      const run = must(await db().from('runs').select('icp_status, search_round, user_id').eq('id', ctx.runId).single(), 'load run') as any
      if (run.icp_status !== 'approved') throw new ToolRefusal('The user has not approved the ICP and cost estimate. Discovery is blocked.')
      if (run.search_round >= ctx.limits.max_search_rounds) throw new ToolRefusal(`Search-round limit reached (${ctx.limits.max_search_rounds}). Store phase state as paused and stop.`)

      // Retry gate: one discovery per session; a second only if the first stored zero companies.
      // Starting a session with search rounds already done needs the user's explicit "search more" choice.
      const prior = ctx.discoveryResults
      if (prior.length >= 2 || (prior.length === 1 && prior[0] > 0)) {
        throw new ToolRefusal('Discovery already ran in this session and returned companies. Do not search again — continue with Phases 4-7; the user decides on more searching from the Phase 7 shortfall options.')
      }
      if (!prior.length && run.search_round > 0 && !ctx.newRound) {
        throw new ToolRefusal(`Discovery already completed (search round ${run.search_round}). Skip Phase 3 and continue with the existing leads.`)
      }

      const invalidIndustries = [...a.company_industry, ...(a.exclude_industries ?? [])].filter((i) => !INDUSTRIES.has(i))
      const locations = a.locations.map((l) => l.toLowerCase().trim())
      const invalidLocations = locations.filter((l) => !LOCATIONS.has(l))
      if (invalidIndustries.length || invalidLocations.length) {
        return { data: { error: 'invalid filters — nothing was run, no cost incurred', invalid_industries: invalidIndustries, invalid_locations: invalidLocations, hint: 'Call getDiscoveryFilterOptions and use exact values.' }, summary: 'rejected: invalid filter values', isError: true }
      }
      if (!a.company_industry.length && !a.company_keywords.length) throw new ToolRefusal('Provide at least one industry or keyword so the search is scoped.')

      // Lead count comes from the run record, never from the model.
      const existing = must(await db().from('leads').select('company_domain, scrape_status').eq('run_id', ctx.runId), 'load existing leads') as Array<{ company_domain: string; scrape_status: string | null }>
      // Screened-out companies were never scraped, so they don't use scrape budget.
      const remainingScrapeBudget = ctx.limits.max_websites_scraped - existing.filter((e) => e.scrape_status !== 'screened_out').length
      const needed = Math.min(ctx.limits.max_companies_per_round, remainingScrapeBudget)
      if (needed <= 0) throw new ToolRefusal('Candidate/scrape limit for this run is exhausted.')

      // Over-fetch, then screen down to `needed` before anything is scraped.
      const rows = apifyRowsFor(needed * SCREEN_OVERFETCH)
      const estimated = COST.apifyActorStartUsd + rows * COST.apifyPerRowUsd
      const spent = await personalApifySpend(run.user_id)
      if (spent + estimated > env.apifyPersonalBudgetUsd) {
        throw new ToolRefusal(`Personal Apify budget would be exceeded ($${spent.toFixed(3)} spent + $${estimated.toFixed(3)} > $${env.apifyPersonalBudgetUsd}).`)
      }

      const actorInput = {
        fetch_count: rows,
        file_name: `run-${ctx.runId.slice(0, 8)}-r${run.search_round + 1}`,
        company_industry: a.company_industry.length ? a.company_industry : undefined,
        company_not_industry: a.exclude_industries?.length ? a.exclude_industries : undefined,
        company_keywords: a.company_keywords.length ? a.company_keywords : undefined,
        contact_location: locations,
        size: sizeBuckets(a.headcount_min, a.headcount_max),
        // Decision-maker rows only → fewer rows per company. Emails are never used.
        seniority_level: ['founder', 'owner', 'c_suite'],
        // Do not filter on validated emails (the actor defaults to ["validated"]); we never use emails.
        email_status: ['validated', 'not_validated', 'unknown'],
      }

      const actorRun = await apify().actor(env.apifyActorId).call(actorInput, {
        maxItems: rows,
        maxTotalChargeUsd: env.apifyMaxChargePerRunUsd,
        timeout: 300,
        memory: 1024,
      })
      const { items } = await apify().dataset(actorRun.defaultDatasetId).listItems({ limit: rows })
      const finalRun = await apify().run(actorRun.id).get().catch(() => null)
      // Billed per returned row, so that is a floor even if Apify's event count is still catching up.
      const billedFromRows = COST.apifyActorStartUsd + items.length * COST.apifyPerRowUsd
      const costActual = Math.max(apifyChargeUsd(finalRun) ?? 0, billedFromRows)
      if (actorRun.status !== 'SUCCEEDED' && !items.length) {
        throw new Error(`Apify run ${actorRun.id} ended with status ${actorRun.status} and returned no rows (cost ~$${costActual.toFixed(3)}). Check it in the Apify Console before retrying.`)
      }

      const { companies, stats } = extractCompanies(items as Record<string, unknown>[], new Set(existing.map((e) => e.company_domain)))
      const round = run.search_round + 1

      const icp = ctx.run.refined_icp
      const screenStarted = Date.now()
      const screen = icp ? await screenCompanies(companies, icp) : { verdicts: companies.map(() => ({ decision: 'unsure' as const, fit: 0.5, reason: 'Not screened (no ICP)' })), costUsd: 0, error: 'no approved ICP on the run' }
      const { chosen, dropped, overflow } = pickForScraping(companies, screen.verdicts, needed)
      const toRow = (c: (typeof companies)[number], verdict: (typeof screen.verdicts)[number], status: string) =>
        ({ ...c, discovery_data: { ...c.discovery_data, screen: verdict }, run_id: ctx.runId, scrape_status: status, search_round: round })

      let stored: Array<{ id: string; company_name: string; company_domain: string; scrape_status: string }> = []
      const toStore = [...chosen.map((x) => toRow(x.item, x.verdict, 'pending')), ...dropped.map((x) => toRow(x.item, x.verdict, 'screened_out'))]
      if (toStore.length) {
        stored = must(await db().from('leads').upsert(toStore, { onConflict: 'run_id,company_domain', ignoreDuplicates: true })
          .select('id, company_name, company_domain, scrape_status'), 'insert leads') as any
      }
      const inserted = stored.filter((l) => l.scrape_status === 'pending').map(({ scrape_status: _s, ...l }) => l)
      const screenedOut = stored.filter((l) => l.scrape_status === 'screened_out').length

      // The screen is logged as its own tool call so its verdicts and cost show in the activity log.
      await db().from('tool_calls').insert({
        run_id: ctx.runId,
        phase_number: 3,
        tool_name: 'screenCompanies',
        purpose: 'Pre-scrape ICP screen (Haiku)',
        input_summary: `${companies.length} discovered companies vs approved ICP`,
        output_summary: screen.error
          ? `screen unavailable — all ${companies.length} kept: ${screen.error.slice(0, 200)}`
          : `${chosen.length} sent to scraping, ${dropped.length} screened out, ${overflow} extra plausible fits not needed`,
        output: { verdicts: companies.map((c, i) => ({ domain: c.company_domain, ...screen.verdicts[i] })), error: screen.error ?? null },
        status: screen.error ? 'failed' : 'success',
        error_message: screen.error?.slice(0, 500) ?? null,
        cost_actual: screen.costUsd,
        duration_ms: Date.now() - screenStarted,
      })
      if (screen.error) {
        await db().from('error_logs').insert({ run_id: ctx.runId, phase_number: 3, error_type: 'screen_unavailable', severity: 'warning', error_message: `Company screen failed; every company went to scraping unscreened: ${screen.error.slice(0, 300)}` })
      }

      // A "Search for more" request is fulfilled once its round has run; clearing it stops a later resume repeating it.
      await db().from('runs').update({ search_round: round, current_phase: 3, ...(ctx.newRound ? { shortfall_choice: null } : {}) }).eq('id', ctx.runId)
      ctx.run.search_round = round
      ctx.discoveryResults.push(inserted.length)
      await mergeCheckpoint(ctx.runId, 3, { [`round_${round}`]: { apify_run_id: actorRun.id, rows_returned: items.length, companies_found: companies.length, companies_stored: inserted.length, screened_out: screenedOut, cost_usd: costActual } })

      return {
        data: {
          leads_found: inserted.length,
          candidate_cap: needed,
          target_lead_count: ctx.limits.target_lead_count,
          search_round: round,
          screening: { companies_found: companies.length, screened_out: screenedOut, sent_to_scraping: inserted.length, unused_plausible_fits: overflow, screen_error: screen.error ?? null },
          stats: { ...stats, companies_after_dedupe: companies.length },
          leads: inserted,
        },
        output: {
          apify_run_id: actorRun.id,
          actor_input: actorInput,
          rows_returned: items.length,
          companies_found: companies.length,
          companies_stored: inserted.length,
          screened_out: screenedOut,
          candidate_cap: needed,
          pii: `${stats.contact_fields_discarded} contact-level fields discarded before storage`,
        },
        summary: `${inserted.length} companies stored for scraping, ${screenedOut} screened out (cap ${needed}, ${companies.length} found, ${items.length} rows, ${stats.dropped_duplicate} dupes, ${stats.dropped_no_website} no website) · $${costActual.toFixed(3)}`,
        costActual,
        costEstimate: estimated,
      }
    },
  })

  return { refineICP, calculateCostEstimate, checkApifyBalance, getDiscoveryFilterOptions, apifyDiscoverCompanies }
}
