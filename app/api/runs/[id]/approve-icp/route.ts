import { NextResponse } from 'next/server'
import { icpSchema } from '@/lib/schemas'
import { callWorker, jsonError, requireOwnedRun } from '@/lib/api'

/** Human gate #1: the user reviewed (and possibly edited) the ICP + cost estimate and clicked Proceed. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  const { run, admin } = r
  if (run.icp_status !== 'pending_user_review' || run.overall_status !== 'awaiting_icp_approval') {
    return jsonError('This run is not waiting for ICP approval.', 409)
  }

  const body = await req.json().catch(() => null)
  const parsed = icpSchema.safeParse(body?.refined_icp)
  if (!parsed.success) return jsonError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))

  const edited = JSON.stringify(parsed.data) !== JSON.stringify(run.refined_icp)
  const now = new Date().toISOString()
  await admin.from('runs').update({ refined_icp: parsed.data, icp_status: 'approved', icp_approved_at: now, current_phase: 3 }).eq('id', run.id)
  await admin.from('phase_states').upsert(
    { run_id: run.id, phase_number: 2, status: 'complete', completed_at: now, checkpoint_data: { approved_at: now, user_edited_icp: edited } },
    { onConflict: 'run_id,phase_number' },
  )

  // A re-approval after a shortfall "adjust ICP" choice starts a new discovery round.
  const w = await callWorker(run.id, { stage: 'research', new_round: run.search_round > 0 })
  if (!w.ok) return jsonError(w.data.error ?? 'Worker failed to start', w.status)
  return NextResponse.json({ started: true, edited })
}
