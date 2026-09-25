import { NextResponse } from 'next/server'
import { decisionSchema } from '@/lib/schemas'
import { jsonError, requireOwnedRun } from '@/lib/api'

/** Manual decision on a needs_review (or any) lead. Human decisions are final — the agent cannot override them. */
export async function POST(req: Request, { params }: { params: { id: string; leadId: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  const { run, admin } = r
  if (['researching', 'in_progress', 'approved', 'cancelled'].includes(run.overall_status)) {
    return jsonError('Leads can be reviewed once the agent has finished (and before final approval).', 409)
  }
  const parsed = decisionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('invalid decision')

  const { data: lead } = await admin.from('leads').select('id, notes').eq('id', params.leadId).eq('run_id', run.id).maybeSingle()
  if (!lead) return jsonError('Lead not found', 404)

  const note = parsed.data.note ? `[Reviewer] ${parsed.data.note}` : null
  await admin.from('leads').update({
    qualification_status: parsed.data.decision,
    manual_decision: true,
    notes: note ? [lead.notes, note].filter(Boolean).join('\n') : lead.notes,
  }).eq('id', lead.id)
  const { data: sel } = await admin.rpc('recompute_selection', { p_run_id: run.id })
  // Any change to the list invalidates a previous approval.
  await admin.from('runs').update({ final_approved_at: null }).eq('id', run.id)

  const { data: updated } = await admin.from('leads').select('id, selected, outreach_drafts').eq('id', lead.id).single()
  return NextResponse.json({ ok: true, selection: sel?.[0], needs_outreach: !!updated?.selected && !updated?.outreach_drafts })
}
