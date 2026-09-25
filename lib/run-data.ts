'use client'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabase/client'
import type { ICP } from '@/lib/schemas'

export interface Run {
  id: string; campaign_name: string | null; original_objective: string; target_lead_count: number; tool_limits: Record<string, number>
  refined_icp: ICP | null; icp_status: string; current_phase: number; overall_status: string; search_round: number
  shortfall_choice: string | null; final_approved_at: string | null; last_error: string | null
  total_cost_estimate: number | null; total_cost_actual: number | null; created_at: string
}
export interface PhaseState { phase_number: number; status: string; started_at: string | null; completed_at: string | null; updated_at: string; error_message: string | null; checkpoint_data: any; cost_actual: number | null }
export interface Email { subject: string; body: string; cta: string; personalization_note: string; source_url: string }
export interface Lead {
  id: string; company_name: string; company_domain: string; employee_count: number | null; industry: string | null; country: string | null; website_url: string | null
  discovery_data: any; scrape_status: string | null; scrape_error: string | null; source_urls: string[] | null; source_summary: string | null; extracted_fields: any; injection_warning: boolean
  qualification_status: string | null; confidence: number | null; fit_reasons: { reason: string; source_url?: string }[] | null; concerns: { concern: string; source_url?: string }[] | null
  hard_filter_check: Record<string, any> | null; needs_review_explanation: string | null; needs_review_meta: any; manual_decision: boolean; selected: boolean
  outreach_drafts: { email1: Email; email2: Email; email3: Email; linkedin: { message: string; source_url: string }; quality_check_results?: { question: string; passed: boolean }[]; lint_failures?: { check: string; detail?: string }[]; flagged_for_phase_seven_review?: boolean } | null
  outreach_quality_score: number | null; outreach_attempts: number | null; final_approved: boolean; notes: string | null
}
export interface ToolCall { id: string; phase_number: number | null; tool_name: string; purpose: string | null; input_summary: string | null; output_summary: string | null; status: string; error_message: string | null; cost_actual: number | null; duration_ms: number | null; created_at: string }
export interface ErrorLog { id: string; phase_number: number | null; error_type: string; error_message: string; severity: string; created_at: string }
export interface Validation {
  id: string; overall_score: number; pass: boolean; qualified_lead_count: number; needs_review_count: number
  dimensions: Record<string, { score: number; weight: number; checks: { question: string; result: boolean; lead_id?: string }[] }>
  safety_checks: { rule: string; pass: boolean }[]; flagged_leads: string[]; shortfall: boolean; shortfall_explanation: string | null; agent_notes: string | null; created_at: string
}
export interface ScreenVerdict { decision: 'keep' | 'drop' | 'unsure'; fit: number; reason: string; restored_at?: string | null }
/** Set aside by the pre-scrape screen: never scraped or qualified, shown only in the Screened out tab. */
export const isScreenedOut = (l: Pick<Lead, 'scrape_status'>) => l.scrape_status === 'screened_out'
export const screenVerdict = (l: Lead): ScreenVerdict | null => l.discovery_data?.screen ?? null

export interface RunData { run: Run; phases: PhaseState[]; leads: Lead[]; toolCalls: ToolCall[]; errors: ErrorLog[]; validation: Validation | null }

async function fetchRun(id: string): Promise<RunData> {
  const sb = supabaseBrowser()
  const [run, phases, leads, toolCalls, errors, validation] = await Promise.all([
    sb.from('runs').select('*').eq('id', id).single(),
    sb.from('phase_states').select('*').eq('run_id', id).order('phase_number'),
    sb.from('leads').select('id, company_name, company_domain, employee_count, industry, country, website_url, discovery_data, scrape_status, scrape_error, source_urls, source_summary, extracted_fields, injection_warning, qualification_status, confidence, fit_reasons, concerns, hard_filter_check, needs_review_explanation, needs_review_meta, manual_decision, selected, outreach_drafts, outreach_quality_score, outreach_attempts, final_approved, notes').eq('run_id', id).order('confidence', { ascending: false, nullsFirst: false }),
    sb.from('tool_calls').select('id, phase_number, tool_name, purpose, input_summary, output_summary, status, error_message, cost_actual, duration_ms, created_at').eq('run_id', id).order('created_at', { ascending: false }).limit(300),
    sb.from('error_logs').select('id, phase_number, error_type, error_message, severity, created_at').eq('run_id', id).order('created_at', { ascending: false }),
    sb.from('validations').select('*').eq('run_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (run.error) throw new Error(run.error.message)
  return { run: run.data, phases: phases.data ?? [], leads: leads.data ?? [], toolCalls: toolCalls.data ?? [], errors: errors.data ?? [], validation: validation.data ?? null }
}

/** Run data with Supabase Realtime: any change to this run's rows refetches (debounced). */
export function useRunData(id: string) {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['run', id], queryFn: () => fetchRun(id) })

  useEffect(() => {
    const sb = supabaseBrowser()
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => qc.invalidateQueries({ queryKey: ['run', id] }), 400)
    }
    const channel = sb.channel(`run-${id}`)
    for (const table of ['phase_states', 'leads', 'tool_calls', 'error_logs', 'validations']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `run_id=eq.${id}` }, refresh)
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'runs', filter: `id=eq.${id}` }, refresh)
    channel.subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      sb.removeChannel(channel)
    }
  }, [id, qc])

  return query
}

export async function postJson<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
