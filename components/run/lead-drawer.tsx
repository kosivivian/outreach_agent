'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, ExternalLink, Filter, RefreshCw, RotateCcw, X } from 'lucide-react'
import { isScreenedOut, postJson, screenVerdict, type Email, type Lead } from '@/lib/run-data'
import { useRunView } from '@/lib/store'
import { LeadStatusBadge } from '@/components/status-badge'
import { Badge, Button, Drawer, EmptyState, Meta, Tabs } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { leadSize, useRestore } from './lead-table'

const SourceLink = ({ url }: { url?: string }) =>
  url ? (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-sky-700 hover:underline">
      <ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
    </a>
  ) : <span className="text-xs text-red-700">no source</span>

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}>
      {done ? <Check className="!h-3.5 !w-3.5" /> : <Copy className="!h-3.5 !w-3.5" />}{done ? 'Copied' : 'Copy'}
    </Button>
  )
}

type Draft = 'email1' | 'email2' | 'email3' | 'linkedin'
const DRAFT_LABEL: Record<Draft, string> = { email1: 'Email 1', email2: 'Email 2', email3: 'Follow-up', linkedin: 'LinkedIn' }

function Outreach({ lead, locked, runId }: { lead: Lead; locked: boolean; runId: string }) {
  const qc = useQueryClient()
  const [which, setWhich] = useState<Draft>('email1')
  const regenerate = useMutation({
    mutationFn: () => postJson(`/api/runs/${runId}/regenerate`, { lead_ids: [lead.id] }),
    onSuccess: () => { toast.success('Regenerating outreach', lead.company_name); qc.invalidateQueries({ queryKey: ['run', runId] }) },
    onError: (e) => toast.error('Could not regenerate', (e as Error).message),
  })
  const d = lead.outreach_drafts
  if (!lead.selected) return <EmptyState title="No outreach for this lead" body="Outreach is drafted only for leads in the qualified list." />
  const action = !locked && (
    <Button size="sm" variant={d ? 'outline' : 'default'} disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
      <RefreshCw className="!h-3.5 !w-3.5" />{regenerate.isPending ? 'Starting…' : d ? 'Regenerate' : 'Generate'}
    </Button>
  )
  if (!d) return <EmptyState title="No drafts yet" action={action || undefined} />

  const email = which === 'linkedin' ? null : (d[which] as Email)
  const text = email ? `Subject: ${email.subject}\n\n${email.body}` : d.linkedin.message
  const failed = [...(d.quality_check_results ?? []).filter((q) => !q.passed).map((q) => q.question), ...(d.lint_failures ?? []).map((l) => l.check)]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border bg-muted/50 p-0.5">
          {(Object.keys(DRAFT_LABEL) as Draft[]).map((k) => (
            <button key={k} onClick={() => setWhich(k)} className={cn('h-7 rounded px-2.5 text-xs', which === k ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{DRAFT_LABEL[k]}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Quality <b className="tabular text-foreground">{lead.outreach_quality_score?.toFixed(2) ?? '—'}</b> · {lead.outreach_attempts ?? 0} attempt(s)</span>
          {action}
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
          <SourceLink url={email ? email.source_url : d.linkedin.source_url} />
          <CopyButton text={text} />
        </div>
        <div className="space-y-2 p-3">
          {email && <div className="font-medium">{email.subject}</div>}
          <p className="whitespace-pre-wrap leading-relaxed">{email ? email.body : d.linkedin.message}</p>
          {email && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant="secondary">CTA: {email.cta}</Badge>
              <Badge variant="secondary" className="max-w-full truncate" title={email.personalization_note}>Hook: {email.personalization_note}</Badge>
            </div>
          )}
        </div>
      </div>

      {failed.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5">
          <div className="mb-1 text-xs font-medium text-amber-900">{failed.length} quality issue{failed.length > 1 ? 's' : ''}</div>
          <ul className="space-y-0.5 text-xs text-amber-900/90">{failed.map((f, i) => <li key={i}>• {f}</li>)}</ul>
        </div>
      ) : <div className="flex items-center gap-1.5 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" />All quality checks passed</div>}
    </div>
  )
}

function ScreenedLeadDrawer({ lead, runId, locked, onClose }: { lead: Lead; runId: string; locked: boolean; onClose: () => void }) {
  const restore = useRestore(runId)
  const d = lead.discovery_data ?? {}
  return (
    <Drawer open onClose={onClose}
      title={<span className="flex items-center gap-2">{lead.company_name}<Badge variant="secondary">Screened out</Badge></span>}
      subtitle={<a href={lead.website_url ?? `https://${lead.company_domain}`} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:underline">{lead.company_domain}<ExternalLink className="h-3 w-3" /></a>}
      actions={!locked && (
        <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => restore.mutate([lead.id], { onSuccess: onClose })}>
          <RotateCcw />{restore.isPending ? 'Restoring…' : 'Restore & research'}
        </Button>
      )}>
      <div className="space-y-4 px-5 py-4">
        <div className="rounded-md border bg-muted/40 p-3 text-xs">
          <div className="mb-0.5 flex items-center gap-1.5 font-medium"><Filter className="h-3.5 w-3.5" />Why it was screened out</div>
          <p className="text-foreground/80">{screenVerdict(lead)?.reason ?? 'No reason recorded.'}</p>
          <p className="mt-1.5 text-muted-foreground">Judged from the discovery data below, before any scraping. It was never scraped or qualified.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-3">
          <Meta label="Industry"><span className="capitalize">{lead.industry ?? '—'}</span></Meta>
          <Meta label="Size">{leadSize(lead) ?? '—'}</Meta>
          <Meta label="Location">{lead.country ?? '—'}</Meta>
        </div>
        {d.company_description && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Description</div>
            <p className="whitespace-pre-line text-xs leading-relaxed text-foreground/80">{d.company_description}</p>
          </div>
        )}
      </div>
    </Drawer>
  )
}

type Tab = 'qualification' | 'outreach' | 'sources'

export function LeadDrawer({ leads, runId, locked }: { leads: Lead[]; runId: string; locked: boolean }) {
  const qc = useQueryClient()
  const { openLeadId, openLead } = useRunView()
  const [tab, setTab] = useState<Tab>('qualification')
  const lead = leads.find((l) => l.id === openLeadId) ?? null
  const decide = useMutation({
    mutationFn: (decision: 'qualified' | 'not_qualified' | 'needs_review') => postJson(`/api/runs/${runId}/leads/${lead!.id}`, { decision }),
    onSuccess: (_r, decision) => { toast.success('Decision saved', `${lead?.company_name} → ${decision.replace('_', ' ')}`); qc.invalidateQueries({ queryKey: ['run', runId] }) },
    onError: (e) => toast.error('Could not save decision', (e as Error).message),
  })
  if (!lead) return null
  if (isScreenedOut(lead)) return <ScreenedLeadDrawer lead={lead} runId={runId} locked={locked} onClose={() => openLead(null)} />
  const hf = lead.hard_filter_check
  const filters = hf ? [
    ...['country', 'industry', 'headcount', 'company_type'].map((k) => ({ name: k.replace('_', ' '), passed: !!hf[k], evidence: undefined as string | undefined })),
    ...((hf.extra ?? []) as any[]).map((x) => ({ name: x.filter, passed: !!x.passed, evidence: x.evidence })),
  ] : []

  return (
    <Drawer open onClose={() => openLead(null)}
      title={<span className="flex items-center gap-2">{lead.company_name}<LeadStatusBadge status={lead.qualification_status} /></span>}
      subtitle={<a href={lead.website_url ?? `https://${lead.company_domain}`} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:underline">{lead.company_domain}<ExternalLink className="h-3 w-3" /></a>}
      actions={!locked && (
        <div className="hidden items-center rounded-md border p-0.5 sm:flex" role="group" aria-label="Manual decision">
          {([['qualified', 'Qualify'], ['needs_review', 'Review'], ['not_qualified', 'Reject']] as const).map(([k, label]) => (
            <button key={k} disabled={decide.isPending} onClick={() => decide.mutate(k)}
              className={cn('h-7 rounded px-2.5 text-xs disabled:opacity-50', lead.qualification_status === k ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{label}</button>
          ))}
        </div>
      )}>
      <div className="space-y-4 px-5 py-4">
        {lead.needs_review_explanation && (
          <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
            <div className="mb-0.5 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" />Why this needs review</div>
            <p>{lead.needs_review_explanation}</p>
            {lead.needs_review_meta?.suggested_reviewer_action && <p className="mt-1"><b>Suggested:</b> {lead.needs_review_meta.suggested_reviewer_action}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-4">
          <Meta label="Industry"><span className="capitalize">{lead.industry ?? '—'}</span></Meta>
          <Meta label="Size">{leadSize(lead) ?? '—'}</Meta>
          <Meta label="Location">{lead.country ?? '—'}</Meta>
          <Meta label="Fit confidence"><span className="tabular">{lead.confidence?.toFixed(2) ?? '—'}</span></Meta>
        </div>

        <Tabs<Tab> value={tab} onChange={setTab}
          items={[
            { value: 'qualification', label: 'Qualification' },
            { value: 'outreach', label: 'Outreach', count: lead.outreach_drafts?.flagged_for_phase_seven_review ? 1 : undefined, tone: 'warning' },
            { value: 'sources', label: 'Sources', count: lead.source_urls?.length ?? 0 },
          ]} />

        {tab === 'qualification' && (
          <div className="space-y-4">
            {filters.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hard filters</div>
                <div className="flex flex-wrap gap-1.5">
                  {filters.map((f) => (
                    <Badge key={f.name} variant={f.passed ? 'success' : 'destructive'} title={f.evidence} className="capitalize">
                      {f.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{f.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Why it fits</div>
              {lead.fit_reasons?.length ? (
                <ul className="space-y-2">
                  {lead.fit_reasons.map((f, i) => (
                    <li key={i} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /><div className="min-w-0"><div>{f.reason}</div><SourceLink url={f.source_url} /></div></li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">Not qualified yet.</p>}
            </div>
            {!!lead.concerns?.length && (
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Concerns</div>
                <ul className="space-y-2">
                  {lead.concerns.map((c, i) => (
                    <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /><div className="min-w-0"><div>{c.concern}</div>{c.source_url && <SourceLink url={c.source_url} />}</div></li>
                  ))}
                </ul>
              </div>
            )}
            {lead.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">{lead.notes}</p>}
          </div>
        )}

        {tab === 'outreach' && <Outreach lead={lead} locked={locked} runId={runId} />}

        {tab === 'sources' && (
          <div className="space-y-3">
            {lead.scrape_status === 'failed'
              ? <div className="rounded-md border border-red-200 bg-red-50/60 p-2.5 text-xs text-red-800">Scrape failed: {lead.scrape_error}</div>
              : lead.source_summary && <p className="text-foreground/80">{lead.source_summary}</p>}
            {lead.injection_warning && <Badge variant="destructive">Instruction-like text on this site was ignored</Badge>}
            <ul className="space-y-1.5">{(lead.source_urls ?? []).map((u) => <li key={u}><SourceLink url={u} /></li>)}</ul>
          </div>
        )}
      </div>

      {!locked && (
        <div className="sticky bottom-0 flex gap-1.5 border-t bg-background p-3 sm:hidden">
          {([['qualified', 'Qualify'], ['needs_review', 'Review'], ['not_qualified', 'Reject']] as const).map(([k, label]) => (
            <Button key={k} size="sm" variant={lead.qualification_status === k ? 'default' : 'outline'} className="flex-1" disabled={decide.isPending} onClick={() => decide.mutate(k)}>{label}</Button>
          ))}
        </div>
      )}
    </Drawer>
  )
}
