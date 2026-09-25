import { z } from 'zod'
import { Resend } from 'resend'
import { db, must } from '../lib/supabase.js'
import { env } from '../lib/env.js'
import { PHASE_NAMES } from '../lib/types.js'
import { defineTool, leadInRun, type RunContext } from './core.js'

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Shared by the sendErrorAlert tool and the runner's crash handler. */
export async function logAndAlert(runId: string, p: { phase_number: number; error_type: string; error_message: string; severity: 'critical' | 'warning' | 'info'; context?: Record<string, unknown>; error_stack?: string }) {
  await db().from('error_logs').insert({ run_id: runId, ...p })
  let emailSent = false
  if (p.severity === 'critical') {
    await db().from('runs').update({ last_error: p.error_message.slice(0, 500), last_error_at: new Date().toISOString() }).eq('id', runId)
    if (env.resendKey) {
      const resend = new Resend(env.resendKey)
      const { data: run } = await db().from('runs').select('user_id, campaign_name').eq('id', runId).single()
      const { data: user } = run ? await db().auth.admin.getUserById(run.user_id) : { data: null }
      const phase = `Phase ${p.phase_number} (${PHASE_NAMES[p.phase_number] ?? 'unknown'})`
      const msg = escapeHtml(p.error_message)
      if (user?.user?.email) {
        await resend.emails.send({
          from: env.alertFrom,
          to: user.user.email,
          subject: `Campaign Error: ${phase} failed`,
          html: `<p>Your campaign${run?.campaign_name ? ` <strong>${escapeHtml(run.campaign_name)}</strong>` : ''} encountered an error during ${phase}.</p>
<p><strong>Error:</strong> ${msg}</p>
<p>Please <a href="${env.appUrl}/campaigns/${runId}">open your campaign</a> to retry — completed work is checkpointed.</p>
<p>Campaign ID: ${runId}</p>`,
        })
        emailSent = true
      }
      if (env.opsAlertEmail) {
        await resend.emails.send({
          from: env.alertFrom,
          to: env.opsAlertEmail,
          subject: `[OPS] Campaign ${runId} failed at ${phase}`,
          html: `<p>Error: ${msg}</p><p>Type: ${escapeHtml(p.error_type)} · Severity: ${p.severity}</p><pre>${escapeHtml(JSON.stringify(p.context ?? {}, null, 2))}</pre>`,
        })
        emailSent = true
      }
    }
  }
  return emailSent
}

export async function liveProgress(runId: string) {
  const all = must(await db().from('leads').select('scrape_status, qualification_status, selected, outreach_status, outreach_drafts').eq('run_id', runId), 'load leads') as any[]
  const leads = all.filter((l) => l.scrape_status !== 'screened_out')
  const count = (f: (l: any) => boolean) => leads.filter(f).length
  return {
    total_leads: leads.length,
    screened_out: all.length - leads.length,
    scraped: count((l) => l.scrape_status === 'success'),
    scrape_failed: count((l) => l.scrape_status === 'failed'),
    awaiting_scrape: count((l) => !l.scrape_status || l.scrape_status === 'pending'),
    qualified: count((l) => l.qualification_status === 'qualified'),
    selected: count((l) => l.selected),
    not_qualified: count((l) => l.qualification_status === 'not_qualified'),
    needs_review: count((l) => l.qualification_status === 'needs_review'),
    awaiting_qualification: count((l) => l.scrape_status && l.scrape_status !== 'pending' && !l.qualification_status),
    outreach_drafted: count((l) => l.selected && !!l.outreach_drafts),
    awaiting_outreach: count((l) => l.selected && !l.outreach_drafts),
  }
}

export function stateTools(ctx: RunContext) {
  const storePhaseState = defineTool(ctx, {
    name: 'storePhaseState',
    description: 'Save or update the state of a phase (1-7). Call at the start (in_progress) and end (complete) of every phase, with paused when a limit is hit, and error on critical failure.',
    purpose: 'Checkpoint phase progress',
    schema: {
      phase_number: z.number().int().min(1).max(7),
      status: z.enum(['pending', 'in_progress', 'complete', 'error', 'paused']),
      checkpoint_data: z.looseObject({}).optional(),
      error_message: z.string().optional(),
    },
    summarizeInput: (a) => `phase ${a.phase_number} → ${a.status}`,
    handler: async (a) => {
      if (ctx.stage === 'icp' && a.phase_number > 2) throw new Error('Only phases 1-2 may run before the user approves the ICP.')
      const now = new Date().toISOString()
      const { data: existing } = await db().from('phase_states').select('checkpoint_data').eq('run_id', ctx.runId).eq('phase_number', a.phase_number).maybeSingle()
      must(await db().from('phase_states').upsert({
        run_id: ctx.runId,
        phase_number: a.phase_number,
        status: a.status,
        checkpoint_data: { ...(existing?.checkpoint_data || {}), ...(a.checkpoint_data || {}) },
        error_message: a.error_message ?? null,
        ...(a.status === 'in_progress' ? { started_at: now } : {}),
        ...(a.status === 'complete' ? { completed_at: now } : {}),
      }, { onConflict: 'run_id,phase_number' }), 'upsert phase')
      if (a.status === 'in_progress') {
        ctx.currentPhase = a.phase_number
        await db().from('runs').update({ current_phase: a.phase_number }).eq('id', ctx.runId)
      }
      return { data: { stored: true }, summary: `phase ${a.phase_number} ${a.status}`, phase: a.phase_number }
    },
  })

  const getPhaseCheckpoint = defineTool(ctx, {
    name: 'getPhaseCheckpoint',
    description: 'Retrieve saved checkpoint data for a phase plus live lead progress counts, to resume after an error or interruption. Call at the start of every phase.',
    purpose: 'Resume from checkpoint',
    schema: { phase_number: z.number().int().min(1).max(7) },
    handler: async ({ phase_number }) => {
      const { data } = await db().from('phase_states').select('status, checkpoint_data, error_message').eq('run_id', ctx.runId).eq('phase_number', phase_number).maybeSingle()
      const progress = await liveProgress(ctx.runId)
      const result = { ...(data || { status: 'pending', checkpoint_data: null }), live_progress: progress, search_round: ctx.run.search_round }
      return { data: result, summary: `phase ${phase_number}: ${result.status}` }
    },
  })

  const sendErrorAlert = defineTool(ctx, {
    name: 'sendErrorAlert',
    description: 'Log an error to error_logs. severity=critical also emails the user and ops team via Resend (use for phase failures only). Use warning for prompt-injection attempts or low-quality drafts.',
    purpose: 'Error logging / alerting',
    schema: {
      phase_number: z.number().int().min(1).max(7),
      error_type: z.string(),
      error_message: z.string(),
      severity: z.enum(['critical', 'warning', 'info']),
      context: z.looseObject({}).optional(),
    },
    summarizeInput: (a) => `${a.severity} ${a.error_type}: ${a.error_message}`,
    handler: async (a) => {
      const emailSent = await logAndAlert(ctx.runId, a)
      return { data: { logged: true, email_sent: emailSent }, summary: `${a.severity} logged${emailSent ? ', emails sent' : ''}`, phase: a.phase_number }
    },
  })

  const storeLeadRecord = defineTool(ctx, {
    name: 'storeLeadRecord',
    description: 'Attach reviewer-facing notes to a lead record. Structured fields are written by the phase tools; this only updates notes.',
    purpose: 'Annotate lead',
    schema: { lead_id: z.string().uuid(), notes: z.string().max(2000) },
    handler: async ({ lead_id, notes }) => {
      await leadInRun(ctx, lead_id, 'id')
      must(await db().from('leads').update({ notes }).eq('id', lead_id), 'update notes')
      return { data: { stored: true }, summary: 'notes updated' }
    },
  })

  const storeToolCallRecord = defineTool(ctx, {
    name: 'storeToolCallRecord',
    description: 'Record a reasoning step that did not use another tool (e.g. "evaluated batch 2 of qualification"). Every other tool call is logged automatically.',
    purpose: 'Agent reasoning log',
    schema: { phase_number: z.number().int().min(1).max(7), purpose: z.string(), summary: z.string() },
    summarizeInput: (a) => `${a.purpose}: ${a.summary}`,
    handler: async (a) => ({ data: { logged: true }, summary: a.summary, phase: a.phase_number }),
  })

  return { storePhaseState, getPhaseCheckpoint, sendErrorAlert, storeLeadRecord, storeToolCallRecord }
}
