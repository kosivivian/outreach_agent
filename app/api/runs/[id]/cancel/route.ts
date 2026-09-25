import { NextResponse } from 'next/server'
import { cancelWorker, jsonError, requireOwnedRun } from '@/lib/api'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  if (r.run.overall_status === 'approved') return jsonError('Approved runs cannot be cancelled.', 409)
  await r.admin.from('runs').update({ overall_status: 'cancelled' }).eq('id', r.run.id)
  await cancelWorker(r.run.id)
  return NextResponse.json({ cancelled: true })
}
