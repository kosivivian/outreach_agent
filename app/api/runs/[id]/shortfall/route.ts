import { NextResponse } from 'next/server'
import { shortfallSchema } from '@/lib/schemas'
import { callWorker, jsonError, requireOwnedRun } from '@/lib/api'
import { estimateLimits } from '@/lib/limits'

const CHOICES = { 1: 'adjust_icp', 2: 'submit_fewer', 3: 'increase_budget', 4: 'manual_review' } as const

/** The user (never the agent) picks how to handle fewer qualified leads than the target. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  const { run, admin } = r
  if (!['validation_passed', 'validation_failed'].includes(run.overall_status)) return jsonError('Shortfall options are available after Phase 7 validation.', 409)
  const parsed = shortfallSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('option must be 1-4')
  const choice = CHOICES[parsed.data.option as keyof typeof CHOICES]
  const limits = run.tool_limits ?? {}
  const rounds = limits.max_search_rounds ?? 2

  if (choice === 'adjust_icp') {
    if (run.search_round >= rounds) return jsonError(`All ${rounds} search rounds are used. Choose option 3 to allow another round.`, 409)
    await admin.from('runs').update({ shortfall_choice: choice, icp_status: 'pending_user_review', overall_status: 'awaiting_icp_approval', current_phase: 2 }).eq('id', run.id)
    return NextResponse.json({ ok: true, next: 'review_icp' })
  }

  if (choice === 'increase_budget') {
    const newRounds = Math.max(rounds, run.search_round + 1)
    const sized = estimateLimits(run.target_lead_count, newRounds)
    await admin.from('runs').update({
      shortfall_choice: choice,
      tool_limits: {
        ...limits,
        max_search_rounds: newRounds,
        max_agent_turns: Math.max(limits.max_agent_turns ?? 0, sized.max_agent_turns),
        max_tool_calls: Math.max(limits.max_tool_calls ?? 0, sized.max_tool_calls),
      },
    }).eq('id', run.id)
    const w = await callWorker(run.id, { stage: 'research', new_round: true })
    if (!w.ok) return jsonError(w.data.error ?? 'Worker failed to start', w.status)
    return NextResponse.json({ ok: true, next: 'researching', max_search_rounds: newRounds })
  }

  await admin.from('runs').update({ shortfall_choice: choice }).eq('id', run.id)
  return NextResponse.json({ ok: true, next: choice === 'manual_review' ? 'review_leads' : 'approve' })
}
