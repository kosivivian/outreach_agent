import { z } from 'zod'
import { db, must } from '../lib/supabase.js'
import { lintOutreach, type OutreachDrafts } from '../lib/outreachLint.js'
import { computeScorecard } from '../lib/scorecard.js'
import { defineTool, leadInRun, ToolRefusal, type RunContext } from './core.js'

export const QUALITY_THRESHOLD = 0.75
export const MAX_ATTEMPTS = 3 // first draft + 2 regenerations

const emailSchema = z.object({
  subject: z.string(),
  body: z.string(),
  cta: z.string(),
  personalization_note: z.string(),
  source_url: z.string(),
})
const draftsShape = {
  email1: emailSchema,
  email2: emailSchema,
  email3: emailSchema,
  linkedin: z.object({ message: z.string(), source_url: z.string() }),
}

const SAFETY_LINT = /contains no email addresses or phone numbers/

export function outreachTools(ctx: RunContext) {
  async function outreachLead(leadId: string) {
    const lead = await leadInRun(ctx, leadId, 'id, company_domain, source_urls, qualification_status, selected, outreach_quality_score, outreach_drafts, outreach_attempts')
    if (lead.qualification_status !== 'qualified' || !lead.selected) {
      throw new ToolRefusal('Outreach is only generated for qualified leads selected within the target count.')
    }
    return lead
  }

  const qualityCheckOutreach = defineTool(ctx, {
    name: 'qualityCheckOutreach',
    description: 'Run deterministic checks on draft outreach for one lead (word limits, source URLs belong to the company, no hype, no generic praise, no contact details, CTA/subject/personalisation present). Use the results when answering the 5-point quality checklist.',
    purpose: 'Outreach quality lint',
    phase: 6,
    schema: { lead_id: z.string().uuid(), ...draftsShape },
    summarizeInput: (a) => `${a.lead_id.slice(0, 8)}: "${a.email1.subject}"`,
    handler: async ({ lead_id, ...drafts }) => {
      const lead = await outreachLead(lead_id)
      const lint = lintOutreach(drafts as OutreachDrafts, lead)
      const failed = lint.checks.filter((c) => !c.passed)
      return { data: { passed: lint.passed, total: lint.total, failed_checks: failed }, summary: `${lint.passed}/${lint.total} lint checks passed` }
    },
  })

  const generateOutreach = defineTool(ctx, {
    name: 'generateOutreach',
    description: `Store one attempt of the outreach drafts (3 emails + LinkedIn) for a selected qualified lead, with your 5-point quality_score. Keeps the best-scoring attempt. If quality_score < ${QUALITY_THRESHOLD} and attempt < ${MAX_ATTEMPTS}, you must regenerate; after attempt ${MAX_ATTEMPTS} it is flagged for Phase 7 review.`,
    purpose: 'Store outreach drafts',
    phase: 6,
    schema: {
      lead_id: z.string().uuid(),
      ...draftsShape,
      quality_score: z.number().min(0).max(1),
      quality_check_results: z.array(z.object({ question: z.string(), passed: z.boolean() })),
      attempt: z.number().int().min(1).max(MAX_ATTEMPTS),
    },
    summarizeInput: (a) => `${a.lead_id.slice(0, 8)} attempt ${a.attempt}, score ${a.quality_score}`,
    handler: async ({ lead_id, quality_score, quality_check_results, attempt, ...drafts }) => {
      const lead = await outreachLead(lead_id)
      const lint = lintOutreach(drafts as OutreachDrafts, lead)
      const safetyFail = lint.checks.find((c) => SAFETY_LINT.test(c.check) && !c.passed)
      if (safetyFail) throw new ToolRefusal(`Drafts contain an email address or phone number (${safetyFail.check}). Remove it and resubmit.`)

      const lintFailed = lint.checks.filter((c) => !c.passed)
      // A user-requested regeneration starts fresh: attempt 1 replaces the old drafts.
      const fresh = ctx.stage === 'regenerate' && attempt === 1
      const previousBest = lead.outreach_drafts && !fresh ? Number(lead.outreach_quality_score ?? 0) : -1
      const bestScore = Math.max(quality_score, previousBest)
      const flagged = attempt >= MAX_ATTEMPTS && bestScore < QUALITY_THRESHOLD
      const isBest = quality_score >= previousBest
      const attempts = fresh ? 1 : Math.max(Number(lead.outreach_attempts ?? 0), attempt)

      if (isBest) {
        must(await db().from('leads').update({
          outreach_drafts: { ...drafts, quality_check_results, lint_failures: lintFailed, flagged_for_phase_seven_review: flagged },
          outreach_quality_score: quality_score,
          outreach_status: 'draft',
          outreach_attempts: attempts,
          outreach_timestamp: new Date().toISOString(),
        }).eq('id', lead_id), 'store drafts')
      } else {
        must(await db().from('leads').update({
          outreach_attempts: attempts,
          outreach_drafts: { ...lead.outreach_drafts, flagged_for_phase_seven_review: flagged },
        }).eq('id', lead_id), 'update attempts')
      }
      if (flagged) {
        await db().from('error_logs').insert({ run_id: ctx.runId, phase_number: 6, error_type: 'low_quality_draft', severity: 'warning', error_message: `${lead.company_domain}: best outreach score ${bestScore} after ${attempt} attempts — flagged for Phase 7 review.`, context: { lead_id } })
      }

      const next = quality_score >= QUALITY_THRESHOLD ? 'done' : attempt < MAX_ATTEMPTS ? `regenerate (submit attempt ${attempt + 1})` : 'flagged_for_phase_seven_review'
      return {
        data: { stored: true, kept_as_best: isBest, quality_score, lint_failures: lintFailed.length, next },
        summary: `${lead.company_domain} attempt ${attempt}: ${quality_score} → ${next}`,
      }
    },
  })

  const validateLeadList = defineTool(ctx, {
    name: 'validateLeadList',
    description: 'Phase 7: compute the weighted quality scorecard and safety compliance checks from the stored records, store the validation report, and hand the list to the human approval gate. Pass agent_notes as 2-6 short labelled points (what drags the score down, shortfall, what to review first).',
    purpose: 'Lead list quality validation',
    phase: 7,
    schema: {
      agent_notes: z.array(z.object({
        topic: z.string().max(40).describe('2-4 word label, e.g. "Shortfall", "Review first", "Outreach quality"'),
        tone: z.enum(['good', 'warning', 'problem', 'info']),
        note: z.string().max(220).describe('One or two short sentences. Name specific companies.'),
        lead_ids: z.array(z.string().uuid()).max(10).optional().describe('Leads this point is about'),
      })).min(1).max(6),
    },
    handler: async ({ agent_notes: points }) => {
      // Stored as JSON text so the UI can render cards; older runs hold plain prose.
      const agent_notes = JSON.stringify(points)
      const leads = must(await db().from('leads').select('id, company_name, company_domain, qualification_status, selected, confidence, fit_reasons, concerns, hard_filter_check, source_urls, source_summary, scrape_status, discovery_data, outreach_drafts, outreach_quality_score').eq('run_id', ctx.runId).or('scrape_status.is.null,scrape_status.neq.screened_out'), 'load leads') as any[]
      const toolCalls = must(await db().from('tool_calls').select('tool_name, input, output').eq('run_id', ctx.runId), 'load tool calls') as any[]
      const report = computeScorecard({ leads, toolCalls, target: ctx.limits.target_lead_count })
      must(await db().from('validations').insert({ run_id: ctx.runId, ...report, agent_notes }), 'store validation')
      must(await db().from('runs').update({ overall_status: report.pass ? 'validation_passed' : 'validation_failed', current_phase: 7 }).eq('id', ctx.runId), 'update run')
      const dims = Object.fromEntries(Object.entries(report.dimensions).map(([k, d]) => [k, d.score]))
      return {
        data: { stored: true, overall_score: report.overall_score, pass: report.pass, qualified_lead_count: report.qualified_lead_count, needs_review_count: report.needs_review_count, dimensions: dims, safety_checks: report.safety_checks, flagged_leads: report.flagged_leads, shortfall: report.shortfall, shortfall_explanation: report.shortfall_explanation },
        summary: `score ${report.overall_score} (${report.pass ? 'pass' : 'fail'}), ${report.qualified_lead_count}/${ctx.limits.target_lead_count} qualified${report.shortfall ? ' — SHORTFALL' : ''}`,
      }
    },
  })

  return { qualityCheckOutreach, generateOutreach, validateLeadList }
}
