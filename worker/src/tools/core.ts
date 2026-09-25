import { tool } from '@anthropic-ai/claude-agent-sdk'
import type { ZodRawShape, z } from 'zod'
import { db, must } from '../lib/supabase.js'
import { resolveLimits, type RunRecord, type ToolLimits } from '../lib/types.js'

export type Stage = 'icp' | 'research' | 'regenerate'

/** Per-session state shared by every tool. The run id is bound here, never taken from the model. */
export interface RunContext {
  runId: string
  stage: Stage
  run: RunRecord
  limits: ToolLimits
  currentPhase: number
  toolCallsUsed: number
  abort: AbortController
  /** Lead ids the regenerate stage is allowed to touch. */
  scopeLeadIds?: string[]
  /** True only when the user asked for another search round (shortfall option 3 / re-approved ICP). */
  newRound: boolean
  /** Companies stored by each discovery call made in this session. */
  discoveryResults: number[]
}

export async function loadRun(runId: string): Promise<RunRecord> {
  return must(await db().from('runs').select('*').eq('id', runId).single(), 'load run') as RunRecord
}

export async function createContext(runId: string, stage: Stage, abort: AbortController, opts: { scopeLeadIds?: string[]; newRound?: boolean } = {}): Promise<RunContext> {
  const run = await loadRun(runId)
  const { count } = await db().from('tool_calls').select('id', { count: 'exact', head: true }).eq('run_id', runId)
  return { runId, stage, run, limits: resolveLimits(run), currentPhase: run.current_phase || 1, toolCallsUsed: count ?? 0, abort, scopeLeadIds: opts.scopeLeadIds, newRound: !!opts.newRound, discoveryResults: [] }
}

export interface ToolOutcome {
  /** Returned to the model as JSON (or as-is when a string). */
  data: unknown
  /** One-line result summary for tool_calls.output_summary. */
  summary: string
  /** Stored in tool_calls.output (defaults to data). */
  output?: unknown
  isError?: boolean
  costActual?: number
  costEstimate?: number
  phase?: number
}

export class ToolRefusal extends Error {}

interface ToolSpec<S extends ZodRawShape> {
  name: string
  description: string
  purpose: string
  schema: S
  /** Fixed phase for logging; defaults to the phase the agent last marked in_progress. */
  phase?: number
  summarizeInput?: (args: z.infer<z.ZodObject<S>>) => string
  handler: (args: z.infer<z.ZodObject<S>>, ctx: RunContext) => Promise<ToolOutcome>
}

const clip = (s: string, n = 480) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function defineTool<S extends ZodRawShape>(ctx: RunContext, spec: ToolSpec<S>) {
  return tool(spec.name, spec.description, spec.schema, async (args: any) => {
    const started = Date.now()
    const phase = spec.phase ?? ctx.currentPhase
    const inputSummary = clip(spec.summarizeInput ? spec.summarizeInput(args) : JSON.stringify(args))
    let outcome: ToolOutcome
    let status = 'success'
    let errorMessage: string | null = null

    try {
      const { data: live } = await db().from('runs').select('overall_status').eq('id', ctx.runId).single()
      if (live?.overall_status === 'cancelled') {
        ctx.abort.abort()
        throw new ToolRefusal('Run was cancelled by the user. Stop immediately.')
      }
      if (ctx.toolCallsUsed >= ctx.limits.max_tool_calls) {
        throw new ToolRefusal(`Tool-call limit reached (${ctx.limits.max_tool_calls}). Store phase state as paused and stop.`)
      }
      outcome = await spec.handler(args, ctx)
      if (outcome.isError) status = 'failed'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      status = e instanceof ToolRefusal ? 'refused' : 'failed'
      errorMessage = clip(msg, 500)
      outcome = { data: `${spec.name} ${status}: ${msg}`, summary: `${status}: ${clip(msg, 200)}`, isError: true }
    }

    ctx.toolCallsUsed++
    if (status !== 'success') console.warn(`[${ctx.runId.slice(0, 8)}] ${spec.name} ${status}: ${errorMessage ?? outcome.summary}`)
    const { error: logError } = await db().from('tool_calls').insert({
      run_id: ctx.runId,
      phase_number: outcome.phase ?? phase,
      tool_name: spec.name,
      purpose: spec.purpose,
      input_summary: inputSummary,
      output_summary: clip(outcome.summary),
      input: args,
      output: outcome.output ?? (typeof outcome.data === 'string' ? { text: clip(outcome.data, 2000) } : outcome.data),
      status,
      error_message: errorMessage,
      cost_estimate: outcome.costEstimate ?? null,
      cost_actual: outcome.costActual ?? null,
      duration_ms: Date.now() - started,
    })
    if (logError) console.error(`[${ctx.runId.slice(0, 8)}] failed to log ${spec.name} to tool_calls: ${logError.message}`)

    const text = typeof outcome.data === 'string' ? outcome.data : JSON.stringify(outcome.data)
    return { content: [{ type: 'text' as const, text }], ...(outcome.isError ? { isError: true } : {}) }
  })
}

/** Loads a lead and verifies it belongs to this run (the model can only pass ids it was given). */
export async function leadInRun(ctx: RunContext, leadId: string, columns = '*') {
  const { data, error } = await db().from('leads').select(columns).eq('id', leadId).eq('run_id', ctx.runId).maybeSingle()
  if (error) throw new Error(`load lead: ${error.message}`)
  if (!data) throw new ToolRefusal(`Lead ${leadId} does not belong to this run.`)
  if (ctx.scopeLeadIds && !ctx.scopeLeadIds.includes(leadId)) throw new ToolRefusal(`Lead ${leadId} is outside the leads the user asked to regenerate.`)
  return data as any
}

/** Merge keys into a phase's checkpoint_data without clobbering what the agent stored. */
export async function mergeCheckpoint(runId: string, phase: number, patch: Record<string, unknown>, status?: string) {
  const { data } = await db().from('phase_states').select('checkpoint_data').eq('run_id', runId).eq('phase_number', phase).maybeSingle()
  await db().from('phase_states').upsert(
    { run_id: runId, phase_number: phase, checkpoint_data: { ...(data?.checkpoint_data || {}), ...patch }, ...(status ? { status } : {}) },
    { onConflict: 'run_id,phase_number' },
  )
}

/** Top-N qualified leads (human decisions first, then confidence) are `selected`; N is the run's target_lead_count. */
export async function recomputeSelection(ctx: RunContext) {
  const rows = must(await db().rpc('recompute_selection', { p_run_id: ctx.runId }), 'recompute selection') as Array<{ qualified_count: number; selected_count: number }>
  return { qualified: rows[0]?.qualified_count ?? 0, selected: rows[0]?.selected_count ?? 0 }
}
