import { NextResponse } from 'next/server'
import { z } from 'zod'
import { callWorker, jsonError, requireOwnedRun } from '@/lib/api'
import { maxWebsitesScraped } from '@/lib/limits'

const schema = z.object({ lead_ids: z.array(z.string().uuid()).min(1).max(50) })

/** Put companies the pre-scrape screen set aside back into the pipeline: scrape, qualify, re-validate. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  const { run, admin } = r
  if (run.icp_status !== 'approved' || !['validation_passed', 'validation_failed', 'paused', 'error'].includes(run.overall_status)) {
    return jsonError('Screened-out companies can be restored once the agent has finished, and before final approval.', 409)
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('lead_ids must be a list of lead ids')

  const { data: leads } = await admin.from('leads').select('id, scrape_status, discovery_data').eq('run_id', run.id)
  const picked = (leads ?? []).filter((l) => parsed.data.lead_ids.includes(l.id) && l.scrape_status === 'screened_out')
  if (!picked.length) return jsonError('None of those companies are screened out.', 409)

  const used = (leads ?? []).filter((l) => ['success', 'failed', 'pending'].includes(l.scrape_status)).length
  const room = maxWebsitesScraped(run) - used
  if (picked.length > room) {
    return jsonError(room > 0
      ? `Only ${room} more website${room === 1 ? '' : 's'} can be scraped on this run. Restore fewer, or choose "Search for more" to add a round.`
      : 'This run has used its whole scrape budget. Choose "Search for more" to add a round.', 409)
  }

  const setStatus = (status: 'pending' | 'screened_out') => Promise.all(picked.map((l) => admin.from('leads').update({
    scrape_status: status,
    discovery_data: { ...l.discovery_data, screen: { ...l.discovery_data?.screen, restored_at: status === 'pending' ? new Date().toISOString() : null } },
  }).eq('id', l.id)))

  await setStatus('pending')
  const w = await callWorker(run.id, { stage: 'research', resume: true, restored: true })
  if (!w.ok) {
    await setStatus('screened_out')
    return jsonError(w.data.error ?? 'Worker failed to start', w.status)
  }
  // Any change to the list invalidates a previous approval.
  await admin.from('runs').update({ final_approved_at: null }).eq('id', run.id)
  return NextResponse.json({ ok: true, restored: picked.length })
}
