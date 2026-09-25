import { NextResponse } from 'next/server'
import { approvalSchema } from '@/lib/schemas'
import { jsonError, requireOwnedRun } from '@/lib/api'

/** Human gate #2: final approval. Only a signed-in owner can do this; the agent has no path to it. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  const { run, admin } = r
  if (!['validation_passed', 'validation_failed'].includes(run.overall_status)) return jsonError('The list must be validated (Phase 7) before approval.', 409)

  const parsed = approvalSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('Every item on the approval checklist must be confirmed.')

  const { data: validation } = await admin.from('validations').select('*').eq('run_id', run.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!validation) return jsonError('No validation report found.', 409)
  if (!validation.pass && !parsed.data.approve_anyway) return jsonError('Validation did not pass. Confirm "approve anyway" to continue.', 409)
  if (validation.shortfall && run.shortfall_choice !== 'submit_fewer') return jsonError('The list is short of the target. Choose a shortfall option first (option 2 to submit fewer).', 409)
  if (validation.safety_checks?.some((s: { pass: boolean }) => !s.pass)) return jsonError('Safety compliance checks failed — this list cannot be approved.', 409)

  const { data: selected } = await admin.from('leads').select('id, outreach_drafts').eq('run_id', run.id).eq('selected', true)
  if (!selected?.length) return jsonError('There are no qualified leads to approve.', 409)
  if (selected.some((l) => !l.outreach_drafts)) return jsonError('Some selected leads have no outreach drafts yet. Generate them first.', 409)

  const now = new Date().toISOString()
  await admin.from('leads').update({ final_approved: false }).eq('run_id', run.id)
  await admin.from('leads').update({ final_approved: true, outreach_status: 'approved' }).in('id', selected.map((l) => l.id))
  await admin.from('runs').update({
    overall_status: 'approved',
    final_approved_at: now,
    completed_at: now,
    final_approval_checklist: { ...parsed.data.checklist, approve_anyway: parsed.data.approve_anyway, validation_id: validation.id, approved_by: r.user.id },
  }).eq('id', run.id)
  return NextResponse.json({ approved: true, leads: selected.length })
}
