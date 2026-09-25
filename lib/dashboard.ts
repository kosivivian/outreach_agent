import 'server-only'
import { supabaseServer } from './supabase/server'

export interface AttentionItem { id: string; name: string; reason: string; action: string; tone: 'danger' | 'warning' | 'info'; at: string }

const ATTENTION: Record<string, { rank: number; reason: string; action: string; tone: AttentionItem['tone'] }> = {
  error: { rank: 1, reason: 'Run failed', action: 'Resume', tone: 'danger' },
  awaiting_icp_approval: { rank: 2, reason: 'ICP waiting for your review', action: 'Review ICP', tone: 'warning' },
  validation_failed: { rank: 3, reason: 'List scored below 0.80', action: 'Review list', tone: 'warning' },
  validation_passed: { rank: 3, reason: 'List ready for approval', action: 'Approve', tone: 'info' },
  paused: { rank: 4, reason: 'Run paused at a limit', action: 'Resume', tone: 'warning' },
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>

export async function loadDashboard(sb: ReturnType<typeof supabaseServer> = supabaseServer()) {
  const leadCount = (f?: (q: any) => any) => {
    let q = sb.from('leads').select('id', { count: 'exact', head: true }).or('scrape_status.is.null,scrape_status.neq.screened_out')
    if (f) q = f(q)
    return q
  }
  const [runsRes, companies, selected, qualified, decided, toolRes, phaseRes] = await Promise.all([
    sb.from('runs').select('id, campaign_name, original_objective, overall_status, target_lead_count, total_cost_actual, created_at, updated_at').order('created_at', { ascending: false }),
    leadCount(),
    leadCount((q) => q.eq('selected', true)),
    leadCount((q) => q.eq('qualification_status', 'qualified')),
    leadCount((q) => q.not('qualification_status', 'is', null)),
    sb.from('tool_calls').select('tool_name, cost_actual').in('tool_name', ['apifyDiscoverCompanies', 'firecrawlScrapeWebsite', 'screenCompanies']).not('cost_actual', 'is', null),
    sb.from('phase_states').select('cost_actual').not('cost_actual', 'is', null),
  ])
  const runs = runsRes.data ?? []
  const sum = (rows: Array<{ cost_actual?: unknown; total_cost_actual?: unknown }>, k: 'cost_actual' | 'total_cost_actual') => rows.reduce((s, r) => s + Number((r as any)[k] ?? 0), 0)

  const total = sum(runs, 'total_cost_actual')
  const apify = sum((toolRes.data ?? []).filter((t) => t.tool_name === 'apifyDiscoverCompanies'), 'cost_actual')
  const firecrawl = sum((toolRes.data ?? []).filter((t) => t.tool_name === 'firecrawlScrapeWebsite'), 'cost_actual')
  const claude = sum(phaseRes.data ?? [], 'cost_actual') + sum((toolRes.data ?? []).filter((t) => t.tool_name === 'screenCompanies'), 'cost_actual')
  const other = Math.max(0, total - apify - firecrawl - claude)

  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en-US', { month: 'short' }), cost: 0, runs: 0 }
  })
  for (const r of runs) {
    const d = new Date(r.created_at)
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`)
    if (m) { m.cost += Number(r.total_cost_actual ?? 0); m.runs++ }
  }

  const attention: AttentionItem[] = runs
    .filter((r) => ATTENTION[r.overall_status])
    .sort((a, b) => ATTENTION[a.overall_status].rank - ATTENTION[b.overall_status].rank || +new Date(b.updated_at ?? b.created_at) - +new Date(a.updated_at ?? a.created_at))
    .map((r) => ({ id: r.id, name: r.campaign_name || 'Untitled campaign', at: r.updated_at ?? r.created_at, ...ATTENTION[r.overall_status] }))

  const status = (s: string[]) => runs.filter((r) => s.includes(r.overall_status)).length
  return {
    campaigns: { total: runs.length, approved: status(['approved']), active: status(['in_progress', 'researching']), needsAction: attention.length },
    leads: { companies: companies.count ?? 0, selected: selected.count ?? 0, qualified: qualified.count ?? 0, decided: decided.count ?? 0 },
    cost: { total, apify, firecrawl, claude, other, thisMonth: months[5].cost, perQualified: (selected.count ?? 0) ? total / (selected.count ?? 1) : null },
    months,
    attention,
    recent: runs.slice(0, 5),
  }
}
