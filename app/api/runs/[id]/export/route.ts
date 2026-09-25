import { jsonError, requireOwnedRun } from '@/lib/api'

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v)
  // Neutralise spreadsheet formula injection from scraped text.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

/** Export is only possible after human approval. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedRun(params.id)
  if ('error' in r) return r.error
  if (r.run.overall_status !== 'approved') return jsonError('Export is enabled after final approval.', 403)

  const { data: leads } = await r.admin.from('leads').select('*').eq('run_id', r.run.id).eq('final_approved', true).order('confidence', { ascending: false })
  const header = ['company_name', 'company_domain', 'employee_count', 'industry', 'country', 'confidence', 'fit_reasons', 'concerns', 'source_urls', 'source_summary',
    'email1_subject', 'email1_body', 'email2_subject', 'email2_body', 'email3_subject', 'email3_body', 'linkedin_message', 'outreach_quality_score']
  const rows = (leads ?? []).map((l) => {
    const d = l.outreach_drafts ?? {}
    return [l.company_name, l.company_domain, l.employee_count, l.industry, l.country, l.confidence,
      (l.fit_reasons ?? []).map((f: any) => `${f.reason} (${f.source_url ?? 'no source'})`).join(' | '),
      (l.concerns ?? []).map((c: any) => c.concern).join(' | '),
      (l.source_urls ?? []).join(' '), l.source_summary,
      d.email1?.subject, d.email1?.body, d.email2?.subject, d.email2?.body, d.email3?.subject, d.email3?.body, d.linkedin?.message, l.outreach_quality_score]
  })
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  const name = (r.run.campaign_name || 'leads').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}-approved-leads.csv"` } })
}
