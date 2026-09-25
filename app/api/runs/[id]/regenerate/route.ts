import { NextResponse } from 'next/server'
import { z } from 'zod'
import { callWorker, jsonError, requireOwnedRun } from '@/lib/api'

/** Phase 7 "Regenerate" (or "Generate outreach" for manually qualified leads). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  const parsed = z.object({ lead_ids: z.array(z.string().uuid()).min(1).max(25) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('lead_ids required')

  const { data: leads } = await r.admin.from('leads').select('id').eq('run_id', r.run.id).eq('selected', true).in('id', parsed.data.lead_ids)
  if ((leads?.length ?? 0) !== parsed.data.lead_ids.length) return jsonError('Only selected qualified leads can get outreach.', 409)

  const w = await callWorker(r.run.id, { stage: 'regenerate', lead_ids: parsed.data.lead_ids })
  if (!w.ok) return jsonError(w.data.error ?? 'Worker failed to start', w.status)
  await r.admin.from('runs').update({ final_approved_at: null }).eq('id', r.run.id)
  return NextResponse.json({ started: true })
}
