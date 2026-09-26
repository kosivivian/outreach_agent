import { z } from 'zod'

export const TONES = ['professional', 'direct', 'friendly'] as const
export const PERSONAS = ['Founder / CEO', 'Operations lead', 'Agency owner', 'Head of Growth', 'CTO / Technical founder'] as const

export const createRunSchema = z.object({
  campaign_name: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(5).max(2000),
  target_lead_count: z.number().int().min(1).max(25),
  settings: z.object({
    tone: z.enum(TONES),
    offer: z.string().trim().max(2000),
    target_persona: z.string().trim().max(255),
    additional_context: z.string().trim().max(2000).default(''),
  }),
  /** Start even though an earlier campaign used exactly this objective. */
  confirm_duplicate: z.boolean().optional(),
  /** The campaign this one was pre-filled from ("Run again"); matching its objective is expected. */
  rerun_of: z.string().uuid().optional(),
})

/** Case, spacing and trailing punctuation don't make an objective different. */
export const normalizeObjective = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?,;:\s]+$/, '')

export const icpSchema = z.object({
  target_company_type: z.string().min(1),
  industries: z.array(z.string().min(1)).min(1),
  geography: z.array(z.string().min(1)).min(1),
  headcount_range: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).refine((h) => h.min <= h.max, 'min must be ≤ max'),
  buyer_persona: z.string(),
  business_problem: z.string(),
  hard_filters: z.array(z.string()),
  soft_preferences: z.array(z.string()),
  disqualifiers: z.array(z.string()),
  inferred_fields: z.array(z.string()),
})
export type ICP = z.infer<typeof icpSchema>

export const decisionSchema = z.object({
  decision: z.enum(['qualified', 'not_qualified', 'needs_review']),
  note: z.string().max(2000).optional(),
})

export const approvalSchema = z.object({
  checklist: z.object({
    qualification_reviewed: z.literal(true),
    sources_reviewed: z.literal(true),
    drafts_reviewed: z.literal(true),
    needs_review_handled: z.literal(true),
    no_sending_acknowledged: z.literal(true),
  }),
  approve_anyway: z.boolean().default(false),
})

export const shortfallSchema = z.object({ option: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) })
