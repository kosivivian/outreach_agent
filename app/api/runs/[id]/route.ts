import { NextResponse } from 'next/server'
import { requireOwnedRun } from '@/lib/api'

/** Full run state: run record, phases, leads, tool calls, errors and the latest validation. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  const { run, admin } = r
  const [phases, leads, toolCalls, errors, validation] = await Promise.all([
    admin.from('phase_states').select('*').eq('run_id', run.id).order('phase_number'),
    admin.from('leads').select('*').eq('run_id', run.id).order('confidence', { ascending: false, nullsFirst: false }),
    admin.from('tool_calls').select('*').eq('run_id', run.id).order('created_at'),
    admin.from('error_logs').select('*').eq('run_id', run.id).order('created_at'),
    admin.from('validations').select('*').eq('run_id', run.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  return NextResponse.json({
    run,
    phases: phases.data ?? [],
    leads: leads.data ?? [],
    tool_calls: toolCalls.data ?? [],
    error_logs: errors.data ?? [],
    validation: validation.data ?? null,
  })
}
