import express from 'express'
import { timingSafeEqual } from 'node:crypto'
import { env } from './lib/env.js'
import { db } from './lib/supabase.js'
import { cancelRun, isActive, runStage } from './agent.js'
import type { Stage } from './tools/core.js'
import { checkObjective } from './lib/objectiveCheck.js'

const app = express()
app.use(express.json({ limit: '100kb' }))

app.get('/health', (_req, res) => { res.json({ ok: true }) })

// Only the Next.js app (holding WORKER_SECRET) may start agent sessions.
app.use((req, res, next) => {
  const given = Buffer.from((req.header('authorization') || '').replace(/^Bearer /, ''))
  const expected = Buffer.from(env.workerSecret)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(401).json({ error: 'unauthorized' })
  next()
})

const UUID = /^[0-9a-f-]{36}$/i

/** Server-side gate checks — the UI is not trusted to enforce the approval flow. */
function gateError(stage: Stage, run: any): string | null {
  if (run.overall_status === 'cancelled') return 'Run is cancelled.'
  if (run.overall_status === 'approved') return 'Run is already approved and locked.'
  if (stage === 'icp' && run.icp_status === 'approved') return 'ICP is already approved.'
  if (stage === 'research' && run.icp_status !== 'approved') return 'ICP must be approved by the user before research can start.'
  if (stage === 'regenerate' && !['validation_passed', 'validation_failed', 'paused'].includes(run.overall_status)) return 'Regeneration is only available after validation.'
  return null
}

app.post('/runs/:id/stage', async (req, res) => {
  const runId = req.params.id
  const stage = req.body?.stage as Stage
  const leadIds: string[] | undefined = req.body?.lead_ids
  if (!UUID.test(runId) || !['icp', 'research', 'regenerate'].includes(stage)) return res.status(400).json({ error: 'bad request' })
  if (stage === 'regenerate' && (!Array.isArray(leadIds) || !leadIds.length || !leadIds.every((l) => UUID.test(l)))) return res.status(400).json({ error: 'lead_ids required' })
  if (isActive(runId)) return res.status(409).json({ error: 'An agent session is already running for this run.' })

  const { data: run, error } = await db().from('runs').select('overall_status, icp_status').eq('id', runId).single()
  if (error || !run) return res.status(404).json({ error: 'run not found' })
  const gate = gateError(stage, run)
  if (gate) return res.status(409).json({ error: gate })

  // Fire and forget: the session can run for many minutes; progress streams via Supabase Realtime.
  runStage(runId, stage, { leadIds, resume: !!req.body?.resume, newRound: !!req.body?.new_round, restored: !!req.body?.restored }).catch((e) => console.error('runStage crashed', e))
  res.status(202).json({ started: true, stage })
})

/** Called before a run is created: rejects gibberish or objectives that aren't a lead search. */
app.post('/objective-check', async (req, res) => {
  const objective = req.body?.objective
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 2000) return res.status(400).json({ error: 'objective required' })
  res.json(await checkObjective(objective))
})

app.post('/runs/:id/cancel', (req, res) => {
  cancelRun(req.params.id)
  res.json({ cancelled: true })
})

/**
 * A restart kills any running agent session without it setting a final status, which would leave the run
 * "researching" forever. Sessions live only in this process, so at startup none can still be running:
 * mark them paused so the user can resume. (Assumes a single worker instance.)
 */
async function recoverInterruptedRuns() {
  const { data: stuck } = await db().from('runs').select('id, overall_status, current_phase').in('overall_status', ['in_progress', 'researching'])
  for (const run of stuck ?? []) {
    const message = 'The worker restarted while the agent was working. Nothing was lost — resume to continue from the last checkpoint.'
    await db().from('runs').update({ overall_status: 'paused', last_error: message, last_error_at: new Date().toISOString() }).eq('id', run.id)
    await db().from('error_logs').insert({ run_id: run.id, phase_number: run.current_phase, error_type: 'session_interrupted', severity: 'warning', error_message: message })
    console.warn(`[${run.id.slice(0, 8)}] recovered interrupted session (${run.overall_status} → paused)`)
  }
}

app.listen(env.port, () => {
  console.log(`lead-agent worker listening on :${env.port}`)
  recoverInterruptedRuns().catch((e) => console.error('interrupted-run recovery failed', e))
})
