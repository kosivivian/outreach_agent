import 'server-only'
import { NextResponse } from 'next/server'
import { supabaseAdmin, supabaseServer } from './supabase/server'

export const jsonError = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** Resolve the signed-in user and a run they own (RLS-checked). */
export async function requireOwnedRun(runId: string) {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: jsonError('Not signed in', 401) } as const
  const { data: run } = await sb.from('runs').select('*').eq('id', runId).maybeSingle()
  if (!run) return { error: jsonError('Run not found', 404) } as const
  return { user, run, admin: supabaseAdmin() } as const
}

/** Ask the Railway worker to start an agent session. */
export async function callWorker(runId: string, body: Record<string, unknown>) {
  const res = await fetch(`${process.env.WORKER_URL}/runs/${runId}/stage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.WORKER_SECRET}` },
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch((e: Error) => ({ ok: false, status: 502, json: async () => ({ error: `Worker unreachable: ${e.message}` }) }) as const)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data: data as { error?: string } }
}

export interface ObjectiveVerdict { ok: boolean; category: 'lead_search' | 'gibberish' | 'unrelated'; reason: string; suggestion: string | null; checked: boolean }

/** Ask the worker whether an objective is a lead search. Fails open so an outage never blocks a campaign. */
export async function checkObjective(objective: string): Promise<ObjectiveVerdict> {
  try {
    const res = await fetch(`${process.env.WORKER_URL}/objective-check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.WORKER_SECRET}` },
      body: JSON.stringify({ objective }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(String(res.status))
    return await res.json()
  } catch {
    return { ok: true, category: 'lead_search', reason: 'Not checked (check unavailable).', suggestion: null, checked: false }
  }
}

export async function cancelWorker(runId: string) {
  await fetch(`${process.env.WORKER_URL}/runs/${runId}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` },
  }).catch(() => {})
}
