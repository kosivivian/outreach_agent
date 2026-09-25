# Lead Research Agent — Test Checklist

## Vague qualification objective
**The user gives a broad request. The run record should show the refined ICP criteria the agent used before searching.**

| Criterion | Evidence | Status |
|-----------|----------|--------|
| ICP inferred from broad request | Run record `refined_icp` field contains `inferred_fields` array listing which fields (e.g. industries, buyer_persona) were inferred vs. user-provided | Pending: start a campaign with "Find companies that need automation help" and check run.refined_icp.inferred_fields in Supabase |

---

## Specific qualification objective
**The user gives a precise request. The refined ICP criteria and lead records should preserve the hard filters from the request.**

| Criterion | Evidence | Status |
|-----------|----------|--------|
| Hard filters preserved | Run record `refined_icp.hard_filters` includes the exact constraints from the user input (e.g. "Company must be based in the United States", "Employee headcount must be between 10 and 100") | **Passed**: "find 5 us b2b saas companies with 10 to 100 employees that may need ai automation support" → refined_icp.hard_filters preserved all three hard constraints (US, 10-100, B2B SaaS) |
| Lead records inherit filters | Every lead in the leads table for this run matches the hard filters (scraped data confirms headcount, location, company type) | Pending: check leads.company_headcount, leads.company_location, leads.company_type against refined_icp for a completed run |

---

## Company discovery
**The tool-call records should show Apify being used for company discovery and should show that the agent respected the lead-count limit.**

| Criterion | Evidence | Status |
|-----------|----------|--------|
| Apify discovery triggered | tool_calls table has record with `tool_name='apifyDiscoverCompanies'` and non-null `cost_actual` | **Passed**: tool_calls shows apifyDiscoverCompanies called with actor_input mapping refined_icp to leads-finder filters (industries, headcount_min/max, locations) |
| Lead-count limit respected | apifyDiscoverCompanies handler enforces `max_companies_per_round` and `max_websites_scraped` limits from run.limits; tool refuses if limit is hit | **Passed**: Lines 129–153 (src/tools/discovery.ts) — agent checks scrape budget before calling Apify; refusal thrown if `remaining budget ≤ 0` |
| No unauthorized second search | apifyDiscoverCompanies refuses to run a second discovery within the same session unless the first returned zero companies **and** the user has explicitly chosen "Search for more" (ctx.newRound flag) | **Passed**: Lines 131–139 (src/tools/discovery.ts) — session-based gate prevents auto-retry; `prior.length === 1 && prior[0] > 0` refuses second call; only `ctx.newRound === true` (set by /shortfall endpoint option 3) allows a new search_round to increment |

---

## Website scraping
**The tool-call records should show Firecrawl being used. Lead records should include source URLs and source summaries.**

| Criterion | Evidence | Status |
|-----------|----------|--------|
| Firecrawl called for scraping | tool_calls table has records with `tool_name='firecrawlScrapeWebsite'` | Pending: run campaign to Phase 4 and check tool_calls |
| Source URLs stored | leads table has non-null `discovery_data` or `scrape_data` JSON containing original URLs | Pending: inspect leads.discovery_data after scraping phase |
| Source summaries stored | leads table has non-null `scrape_summary` or source context in structured fields | Pending: inspect leads for evidence of Firecrawl output (page summaries, structured data) |

---

## Lead qualification
**Lead records should include qualification status, confidence score, fit reasons, concerns, and source context.**

| Criterion | Evidence | Status |
|-----------|----------|--------|
| Qualification status stored | leads table has `qualification_status` (enum: 'qualified', 'needs_review', 'not_qualified') | Pending: check leads.qualification_status for completed run |
| Confidence score | leads table has `confidence` (0–1 numeric score) | Pending: inspect leads.confidence values |
| Fit reasons | leads table has `fit_reasons` (JSON array of strings explaining why this lead matches the ICP) | Pending: check leads.fit_reasons |
| Concerns flagged | leads table has `concerns` (JSON array of strings listing red flags or mismatches) or `flagged_reason` field | Pending: inspect leads.concerns or leads.flagged_reason |
| Source context | leads table has `discovery_data` (Apify result), `scrape_data` (Firecrawl result), or both | Pending: verify leads.discovery_data and leads.scrape_data are non-null |

---

## Outreach drafting
**Outreach drafts should reference company context from the lead record without inventing facts.**

| Criterion | Evidence | Status |
|-----------|----------|--------|
| Drafts reference scraped data | outreach table (or leads.outreach_drafts JSON) shows emails/LinkedIn that cite specific facts from leads.scrape_summary or discovery_data | Pending: check outreach drafts for citations to company-specific data (e.g. "Your company just hired…" backed by scrape result) |
| No hallucinated facts | All company-specific claims in drafts are grounded in leads.discovery_data or leads.scrape_data; none are generic placeholders | Pending: manually review outreach samples and compare to lead context |

---

## Supabase logging
**Supabase should contain the run record, lead records, and tool-call records needed to review the agent's work.**

| Criterion | Evidence | Status |
|-----------|----------|--------|
| runs table populated | Each campaign creates a run record with: id, user_id, campaign_name, original_objective, refined_icp, search_round, overall_status, total_cost_actual, current_phase, created_at | **Passed**: Dashboard loads all-time campaigns and displays their costs/status from runs table |
| leads table populated | Each discovered company creates a lead record with: run_id, company_domain, company_name, qualification_status, confidence, fit_reasons, concerns, discovery_data, scrape_data, created_at | Pending: run complete campaign and inspect leads table |
| tool_calls table complete | Each agent tool call logs: run_id, tool_name, purpose, input_summary, output_summary, status (success/failed/refused), cost_actual, phase_number, created_at | **Passed**: activity drawer shows 107 tool calls; each appears in tool_calls table with full input/output JSON and cost |
| phase_states table tracked | Each phase transition logs: run_id, phase_number, status (complete/in_progress/error), cost_actual, checkpoint_data (phase-specific metadata), created_at | Pending: verify phase_states for a completed run contains cost and checkpoint for each phase |

---

## Test Data
- **Test run ID**: `520c207b-e8ff-4f86-a861-6db56e0ac8ba` (US SAAS Founders)
- **Command**: Start campaign with objective "find 5 us b2b saas companies with 10 to 100 employees that may need ai automation support"
- **Expected result**: 4 qualified leads, 21 candidates, 3 search rounds exhausted, overall_score ≥ 0.8
