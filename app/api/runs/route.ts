import { NextResponse } from 'next/server'
import { createRunSchema, normalizeObjective } from '@/lib/schemas'
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server'
import { callWorker, checkObjective, jsonError } from '@/lib/api'
import { estimateLimits } from '@/lib/limits'

/** List the signed-in user's runs. */
export async function GET() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return jsonError('Not signed in', 401)
  const { data, error } = await sb.from('runs')
    .select('id, campaign_name, original_objective, target_lead_count, icp_status, overall_status, current_phase, total_cost_actual, created_at')
    .order('created_at', { ascending: false })
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ runs: data })
}

/** Create a campaign run (lead count is fixed here, on the run record) and start Phase 1. */
export async function POST(req: Request) {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return jsonError('Not signed in', 401)

  const parsed = createRunSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  const { campaign_name, objective, target_lead_count, settings, confirm_duplicate, rerun_of } = parsed.data

  // Same objective as an earlier campaign? Point the user at it first (a "Run again" of that campaign is expected).
  if (!confirm_duplicate) {
    const { data: previous } = await sb.from('runs').select('id, campaign_name, original_objective, overall_status, created_at').order('created_at', { ascending: false })
    const key = normalizeObjective(objective)
    const same = (previous ?? []).filter((r) => normalizeObjective(r.original_objective) === key)
    if (same.length && !same.some((r) => r.id === rerun_of)) {
      const { original_objective: _o, ...latest } = same[0]
      return NextResponse.json({ error: 'You already ran a campaign with this exact objective.', code: 'duplicate_objective', duplicate: latest, count: same.length }, { status: 409 })
    }
  }

  // No ICP (and no run) for gibberish or requests that aren't about finding companies.
  const verdict = await checkObjective(objective)
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason, code: 'objective_rejected', category: verdict.category, suggestion: verdict.suggestion }, { status: 422 })
  }

  const { data: cs, error: csErr } = await sb.from('campaign_settings').insert({ user_id: user.id, ...settings }).select('id').single()
  if (csErr) return jsonError(csErr.message, 500)

  const limits = { max_search_rounds: 2, ...estimateLimits(target_lead_count, 2) }
  const { data: run, error: runErr } = await sb.from('runs').insert({
    user_id: user.id,
    campaign_name,
    original_objective: objective,
    campaign_settings_id: cs.id,
    target_lead_count,
    tool_limits: limits,
    overall_status: 'in_progress',
  }).select('id').single()
  if (runErr) return jsonError(runErr.message, 500)

  await supabaseAdmin().from('phase_states').insert([1, 2, 3, 4, 5, 6, 7].map((n) => ({ run_id: run.id, phase_number: n, status: 'pending' })))

  const w = await callWorker(run.id, { stage: 'icp' })
  if (!w.ok) {
    await supabaseAdmin().from('runs').update({ overall_status: 'error', last_error: w.data.error ?? 'Worker failed to start' }).eq('id', run.id)
    return NextResponse.json({ id: run.id, warning: w.data.error }, { status: 202 })
  }
  return NextResponse.json({ id: run.id })
}
