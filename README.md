# Koya Lead Agent

AI lead research & outreach drafting for Koya Talent, built on the **Claude Agent SDK**.
A user enters a qualification objective; one agent runs a 7-phase pipeline (ICP → Apify discovery →
Firecrawl scraping → qualification → copywriting → quality validation) and stores everything in Supabase.
Nothing is ever sent — the output is a human-approved lead list with drafts.

Source of truth for behaviour: [LEAD_AGENT_IMPLEMENTATION.md](LEAD_AGENT_IMPLEMENTATION.md). Brief: [PRD](aat-c3-week-5-lead-agent-main/aat-c3-week-5-lead-agent-main/PRD.md).

## Layout

```
app/, components/, lib/     Next.js 14 web app (Vercel) — auth, review screens, gates, export
worker/                     Agent worker (Railway) — Claude Agent SDK runtime
  .claude/skills/*/SKILL.md 5 model-invoked skills (built from the PRD asset guides)
  src/agent.ts              session runner: system prompt, stages, cost tracking, crash alerts
  src/tools/                18 leadAgent MCP tools (all logged to tool_calls automatically)
  src/lib/                  PII stripping, injection detection, outreach lint, scorecard, cost model
supabase/migrations/        schema, RLS, realtime, selection function
```

## How a run flows

| Session | Trigger | Phases | Ends with |
|---|---|---|---|
| `icp` | user creates campaign | 1–2 | ICP + cost + Apify balance stored → **gate 1** (user edits/approves) |
| `research` | user clicks **Proceed** | 3–7 | validation report stored → **gate 2** (checklist approval) |
| `regenerate` | user clicks **Regenerate** / **Generate outreach** | 6–7 for chosen leads | new validation report |

Each session is a fresh `query()`; the approval gates live between sessions and are enforced
server-side (web API routes **and** the worker), so the agent cannot skip them. Tools are also
scoped per session — discovery/scraping tools do not exist before the ICP is approved.

## Guard-rails (where they are enforced)

- **Lead count** – set by the user on `runs.target_lead_count`. `apifyDiscoverCompanies` has no count
  parameter; it reads the run record and caps candidates at `ceil(target × 1.3)` per round. Qualified
  leads beyond the target are never `selected` (`recompute_selection`).
- **No email finding / validation / sending** – leads-finder returns contacts, so
  [`companyExtract.ts`](worker/src/lib/companyExtract.ts) keeps an *allowlist* of company fields and
  redacts any stray email/phone; the actor is called with `email_status` widened to all values (no
  validated-email filtering). No send tools exist. Phase 7 re-checks all of this from `tool_calls`.
- **Untrusted web content** – scraped text is wrapped in `<untrusted_website_content>`, injection
  patterns are detected and logged to `error_logs` (warning), and the page is still used only as data.
- **Built-in tools off** – the SDK session has only the `Skill` tool plus `mcp__leadAgent__*`
  (`tools: ['Skill']`, `permissionMode: 'dontAsk'`), so no Bash/WebFetch/file access.
- **Limits** – 200 tool calls / 200 agent turns per run, 2 search rounds, scrape cap, personal Apify
  budget (`APIFY_PERSONAL_BUDGET_USD`) and a hard `maxTotalChargeUsd` on every actor run.
- **Qualification rules** – `qualifyLead` downgrades anything that fails a hard filter, has confidence
  < 0.75, < 2 sourced fit reasons, or a failed scrape. Human decisions cannot be overridden by the agent.
- **Copy quality** – deterministic lint (word limits, hype, generic praise, sources, contact details)
  backs the model's 5-point score; < 0.75 regenerates up to 2 times, then flags for Phase 7.

## Setup

1. **Supabase** – create a project, run `supabase/migrations/0001_init.sql` in the SQL editor
   (enables RLS + Realtime). Enable email auth.
2. **Worker** – `cd worker && cp .env.example .env` and fill it in (Apify **team** token, service-role key,
   Resend key, a random `WORKER_SECRET`). Then:
   ```bash
   npm install
   npm test                 # unit tests (PII stripping, lint, scorecard, limits)
   npx tsx scripts/check-skills.ts   # confirms the 5 skills load and only Skill + leadAgent tools exist
   npm run test:apify       # 2-row leads-finder smoke test (~$0.02) — check the cost in the Apify Console
   npm run dev              # :8080
   ```
3. **Web app** – from the repo root, `cp .env.local.example .env.local`, fill it in, `npm install`, `npm run dev`.

### Deploy

- **Railway**: new service from this repo with root directory `worker/` (uses `worker/railway.json`,
  health check `/health`). Set the worker env vars. Copy the public URL.
- **Vercel**: import the repo root; set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_URL` (Railway URL), `WORKER_SECRET`. Set the worker's `APP_URL`
  to the Vercel URL (used in alert emails).
- **Resend**: verify `mailer.kosinebolisa.com` so `notifications@mailer.kosinebolisa.com` can send.

## PRD test scenarios → evidence

| # | Scenario | Where to look |
|---|---|---|
| 1 | Vague objective ("Find some good leads") | `runs.refined_icp` with `inferred_fields`; ICP review screen highlights inferred fields |
| 2 | Specific objective | `runs.refined_icp.hard_filters`, `leads.hard_filter_check` |
| 3 | Company discovery + lead-count limit | `tool_calls` where `tool_name='apifyDiscoverCompanies'` → `output.candidate_cap`, `actor_input.fetch_count` |
| 4 | Website scraping | `tool_calls` `firecrawlScrapeWebsite`; `leads.source_urls`, `leads.source_summary` |
| 5 | Qualification | `leads.qualification_status, confidence, fit_reasons, concerns` |
| 6 | Outreach drafting | `leads.outreach_drafts` (each piece has `source_url`), lint results |
| 7 | Supabase logging | `runs`, `leads`, `tool_calls` (purpose / input summary / result summary), `phase_states`, `validations` |

Plan tests: phase resume = click **Resume from checkpoint** after an error (scraped leads are skipped);
injection = a page containing "Ignore previous instructions…" shows the *injection ignored* badge and a
`prompt_injection_detected` warning.
