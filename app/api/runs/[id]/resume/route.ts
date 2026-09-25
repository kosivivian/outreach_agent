import { NextResponse } from 'next/server'
import { callWorker, jsonError, requireOwnedRun } from '@/lib/api'

/** Retry after an error or pause. Every phase resumes from its checkpoint. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  const { run } = r
  if (!['error', 'paused'].includes(run.overall_status)) return jsonError('Only errored or paused runs can be resumed.', 409)
  const stage = run.icp_status === 'approved' ? 'research' : 'icp'
  // "Search for more" is cleared once its round runs; still set means that round never happened.
  const newRound = stage === 'research' && run.shortfall_choice === 'increase_budget'
  const w = await callWorker(run.id, { stage, resume: true, new_round: newRound })
  if (!w.ok) return jsonError(w.data.error ?? 'Worker failed to start', w.status)
  return NextResponse.json({ started: true, stage })
}
