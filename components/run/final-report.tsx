'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Download, Info, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { postJson, type RunData, type Validation } from '@/lib/run-data'
import { useRunView } from '@/lib/store'
import { Badge, Button, Card, EmptyState, Tabs } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const DIM_LABELS: Record<string, string> = {
  icp_fit: 'ICP fit', evidence_quality: 'Evidence quality', duplicate_rate: 'Duplicates',
  outreach_relevance: 'Outreach relevance', data_completeness: 'Data completeness', safety_compliance: 'Safety',
}
const SHORTFALL_OPTIONS = [
  { option: 1, key: 'adjust_icp', title: 'Adjust ICP', detail: 'Edit the ICP, then run another search round. Uses more Apify budget.' },
  { option: 2, key: 'submit_fewer', title: 'Submit fewer', detail: 'Approve the shorter list. The shortfall explanation stays on the record.' },
  { option: 3, key: 'increase_budget', title: 'Search for more', detail: 'Run one more search round with the same ICP.' },
  { option: 4, key: 'manual_review', title: 'Review manually', detail: 'Qualify some needs-review leads yourself, then draft their outreach.' },
] as const
const CHECKLIST = [
  ['qualification_reviewed', 'Qualifications', "I reviewed each lead's qualification decision and reasoning"],
  ['sources_reviewed', 'Sources', 'I checked the source context (scraped URLs) behind the claims'],
  ['drafts_reviewed', 'Drafts', 'I reviewed all outreach drafts (3 emails + LinkedIn per lead)'],
  ['needs_review_handled', 'Needs review', 'I reviewed every lead marked needs_review'],
  ['no_sending_acknowledged', 'Nothing sent', 'I understand nothing has been sent. Outreach stays as drafts only'],
] as const

const ACRONYMS = new Set(['ICP', 'CTA', 'URL', 'US', 'UK', 'AI', 'CRM', 'CSV', 'B2B', 'SAAS'])

interface NotePoint { topic: string; note: string; tone: 'good' | 'warning' | 'problem' | 'info'; lead_ids?: string[] }

/** agent_notes is JSON points for new runs, plain prose for older ones. */
export function parseNotes(raw: string | null): NotePoint[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((p) => p?.topic && p?.note)
  } catch {}
  const clean = (s: string) => s.replace(/\*\*/g, '').trim()
  const topic = (s: string) => {
    const t = clean(s).replace(/[:\s]+$/, '')
    const lowered = t.replace(/\b[A-Z]{2,}\b/g, (w) => (ACRONYMS.has(w) ? w : w.toLowerCase()))
    return lowered.charAt(0).toUpperCase() + lowered.slice(1)
  }
  const points: NotePoint[] = []
  for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const heading = line.match(/^#{1,6}\s*(.+)$/) ?? line.match(/^(?:\*\*)?([A-Z][^:]{1,60}?)(?:\*\*)?:\s*(?:\*\*)?$/)
    const labelled = line.match(/^(?:[-*•]\s*)?(?:\*\*)?([A-Z][A-Za-z0-9 /&'()-]{1,40}?)(?:\*\*)?\s*[:—–]\s*(?:\*\*)?\s*(.+)$/)
    if (heading) points.push({ topic: topic(heading[1]), note: '', tone: 'info' })
    else if (labelled) points.push({ topic: topic(labelled[1]), note: clean(labelled[2]), tone: 'info' })
    else if (points.length) {
      const last = points[points.length - 1]
      last.note += `${last.note ? ' ' : ''}${clean(line.replace(/^[-*•]\s*/, ''))}`
    } else points.push({ topic: 'Notes', note: clean(line), tone: 'info' })
  }
  for (const p of points) if (/shortfall|short of|problem|fail|risk/i.test(p.topic)) p.tone = 'warning'
  return points.filter((p) => p.note)
}

const NOTE_STYLE: Record<NotePoint['tone'], { icon: React.ReactNode; ring: string }> = {
  good: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />, ring: 'border-l-emerald-500' },
  warning: { icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />, ring: 'border-l-amber-500' },
  problem: { icon: <XCircle className="h-3.5 w-3.5 text-red-600" />, ring: 'border-l-red-500' },
  info: { icon: <Info className="h-3.5 w-3.5 text-sky-600" />, ring: 'border-l-sky-500' },
}

/** Splits "1. … 2. … 3. …" prose into items; only when it starts at 1 and counts up, so "target of 5. All" isn't split. */
function numberedItems(text: string): string[] {
  if (!/^1\.\s/.test(text)) return [text]
  const items: string[] = []
  let rest = text.slice(3)
  for (let n = 2; ; n++) {
    const at = rest.search(new RegExp(`\\s${n}\\.\\s`))
    if (at < 0) { items.push(rest.trim()); break }
    items.push(rest.slice(0, at).trim())
    rest = rest.slice(at + String(n).length + 3)
  }
  return items.filter(Boolean)
}

/** Clamped note text; numbered "1. … 2. …" prose becomes a list. */
function NoteText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const items = numberedItems(text)
  const long = text.length > 220
  return (
    <div>
      <div className={cn('text-xs leading-relaxed text-foreground/80', long && !open && 'line-clamp-3')}>
        {items.length > 1 ? <ol className="list-decimal space-y-0.5 pl-4">{items.map((it, i) => <li key={i}>{it}</li>)}</ol> : text}
      </div>
      {long && <button onClick={() => setOpen(!open)} className="mt-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">{open ? 'Show less' : 'Show more'}</button>}
    </div>
  )
}

function ScoreRing({ score, pass }: { score: number; pass: boolean }) {
  const r = 22, c = 2 * Math.PI * r
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 52 52" className="h-14 w-14 -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score)} className={pass ? 'stroke-emerald-500' : 'stroke-amber-500'} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular">{Math.round(score * 100)}</span>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="min-w-[92px] rounded-md border bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-base font-semibold tabular', tone === 'good' && 'text-emerald-700', tone === 'warn' && 'text-amber-700', tone === 'bad' && 'text-red-700')}>{value}</div>
    </div>
  )
}

function Scorecard({ v }: { v: Validation }) {
  const focusLead = useRunView((s) => s.focusLead)
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="divide-y rounded-md border">
      {Object.entries(v.dimensions).map(([k, d]) => {
        const failing = d.checks.filter((c) => !c.result)
        const expanded = open === k
        return (
          <li key={k}>
            <button disabled={!failing.length} onClick={() => setOpen(expanded ? null : k)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left enabled:hover:bg-muted/40">
              {failing.length ? (expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : <Check className="h-3.5 w-3.5 text-emerald-600" />}
              <span className="w-36 shrink-0 font-medium">{DIM_LABELS[k] ?? k}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={cn('block h-full rounded-full', d.score >= 0.8 ? 'bg-emerald-500' : d.score >= 0.5 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${d.score * 100}%` }} />
              </span>
              <span className="w-10 text-right text-xs font-medium tabular">{d.score.toFixed(2)}</span>
              <span className="hidden w-16 text-right text-[11px] text-muted-foreground sm:block">×{d.weight.toFixed(2)}</span>
              {failing.length > 0 && <Badge variant="destructive">{failing.length}</Badge>}
            </button>
            {expanded && (
              <ul className="space-y-1 bg-muted/30 px-10 py-2">
                {failing.map((c, i) => (
                  <li key={i} className="text-xs text-red-800">
                    {c.lead_id ? <button className="text-left hover:underline" onClick={() => focusLead(c.lead_id!, 'all')}>✗ {c.question}</button> : `✗ ${c.question}`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

type Tab = 'summary' | 'scorecard' | 'safety' | 'flagged'

export function FinalReport({ data }: { data: RunData }) {
  const qc = useQueryClient()
  const focusLead = useRunView((s) => s.focusLead)
  const { run, validation: v, leads } = data
  const [tab, setTab] = useState<Tab>('summary')
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [approveAnyway, setApproveAnyway] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['run', run.id] })

  const shortfall = useMutation({
    mutationFn: (option: number) => postJson(`/api/runs/${run.id}/shortfall`, { option }),
    onSuccess: (r: any) => { refresh(); toast.success('Choice saved'); if (r.next === 'review_leads') useRunView.getState().setTab('needs_review') },
    onError: (e) => toast.error('Could not save choice', (e as Error).message),
  })
  const regenerate = useMutation({
    mutationFn: (ids: string[]) => postJson(`/api/runs/${run.id}/regenerate`, { lead_ids: ids }),
    onSuccess: () => { refresh(); toast.success('Regenerating flagged drafts') },
    onError: (e) => toast.error('Could not regenerate', (e as Error).message),
  })
  const approve = useMutation({
    mutationFn: () => postJson(`/api/runs/${run.id}/approve`, { checklist: checks, approve_anyway: approveAnyway }),
    onSuccess: () => { refresh(); toast.success('Lead list approved', 'Export is now unlocked.') },
    onError: (e) => toast.error('Could not approve', (e as Error).message),
  })

  if (!v) return null
  const approved = run.overall_status === 'approved'
  const byId = new Map(leads.map((l) => [l.id, l]))
  const flagged = v.flagged_leads.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l)
  const regenerable = flagged.filter((l) => l.selected).map((l) => l.id)
  const safetyFails = v.safety_checks.filter((s) => !s.pass).length
  const dimIssues = Object.values(v.dimensions).reduce((s, d) => s + d.checks.filter((c) => !c.result).length, 0)
  const notes = parseNotes(v.agent_notes)
  const done = CHECKLIST.filter(([k]) => checks[k]).length
  const blockers = [
    safetyFails > 0 && 'Safety checks failed',
    v.shortfall && run.shortfall_choice !== 'submit_fewer' && 'Pick a shortfall option',
    !v.pass && !approveAnyway && 'Score below 0.80',
    done < CHECKLIST.length && `Checklist ${done}/${CHECKLIST.length}`,
  ].filter(Boolean) as string[]
  const qualifiedTone = v.qualified_lead_count >= run.target_lead_count ? 'good' : 'warn'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b px-4 py-3">
        <ScoreRing score={v.overall_score} pass={v.pass} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Lead list quality</span>
            <Badge variant={v.pass ? 'success' : 'warning'}>{v.pass ? 'Passed' : 'Below 0.80'}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">Validated {new Date(v.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Kpi label="Qualified" value={`${v.qualified_lead_count}/${run.target_lead_count}`} tone={qualifiedTone} />
          <Kpi label="Needs review" value={v.needs_review_count} tone={v.needs_review_count ? 'warn' : undefined} />
          <Kpi label="Flagged drafts" value={flagged.length} tone={flagged.length ? 'warn' : undefined} />
          <Kpi label="Safety" value={safetyFails ? `${safetyFails} failed` : 'Clean'} tone={safetyFails ? 'bad' : 'good'} />
        </div>
      </div>

      {v.shortfall && !approved && (
        <div className="border-b bg-amber-50/60 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" />Found {v.qualified_lead_count} of {run.target_lead_count}. How do you want to continue?
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {SHORTFALL_OPTIONS.map((o) => (
              <button key={o.option} title={o.detail} disabled={shortfall.isPending} onClick={() => shortfall.mutate(o.option)}
                className={cn('rounded-md border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-foreground/40 disabled:opacity-60', run.shortfall_choice === o.key && 'border-foreground ring-1 ring-foreground')}>
                <div className="font-medium">{o.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{o.detail}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-4">
        <Tabs<Tab> value={tab} onChange={setTab}
          items={[
            { value: 'summary', label: 'Summary', count: notes.length || undefined },
            { value: 'scorecard', label: 'Scorecard', count: dimIssues, tone: 'danger' },
            { value: 'safety', label: 'Safety', count: safetyFails, tone: 'danger' },
            { value: 'flagged', label: 'Flagged leads', count: flagged.length, tone: 'warning' },
          ]} />
      </div>

      <div className="max-h-[380px] min-h-[180px] overflow-y-auto px-4 py-3 scrollbar-thin">
        {tab === 'summary' && (
          notes.length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {notes.map((n, i) => (
                <div key={i} className={cn('rounded-md border border-l-[3px] p-3', NOTE_STYLE[n.tone]?.ring ?? NOTE_STYLE.info.ring)}>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">{(NOTE_STYLE[n.tone] ?? NOTE_STYLE.info).icon}{n.topic}</div>
                  <NoteText text={n.note} />
                  {!!n.lead_ids?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {n.lead_ids.map((id) => byId.get(id)).filter(Boolean).map((l) => (
                        <button key={l!.id} onClick={() => focusLead(l!.id, 'all')} className="rounded border bg-muted/50 px-1.5 py-0.5 text-[11px] hover:bg-muted">{l!.company_name}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <EmptyState title="No agent notes" body="See the scorecard for details." />
        )}

        {tab === 'scorecard' && <Scorecard v={v} />}

        {tab === 'safety' && (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {v.safety_checks.map((s) => (
              <li key={s.rule} className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', !s.pass && 'border-red-200 bg-red-50/60')}>
                {s.pass ? <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-red-600" />}
                <span className={cn(!s.pass && 'font-medium text-red-800')}>{s.rule}</span>
              </li>
            ))}
          </ul>
        )}

        {tab === 'flagged' && (
          flagged.length ? (
            <div className="space-y-3">
              {!approved && regenerable.length > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                  <span>{regenerable.length} draft{regenerable.length > 1 ? 's' : ''} scored below 0.75 after 3 attempts</span>
                  <Button size="sm" variant="outline" disabled={regenerate.isPending} onClick={() => regenerate.mutate(regenerable)}><RefreshCw className="!h-3.5 !w-3.5" />Regenerate all</Button>
                </div>
              )}
              <ul className="divide-y rounded-md border">
                {flagged.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => focusLead(l.id, 'all')} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40">
                      <span className="min-w-0"><span className="font-medium">{l.company_name}</span> <span className="text-xs text-muted-foreground">{l.company_domain}</span></span>
                      <span className="text-xs tabular text-muted-foreground">copy {l.outreach_quality_score?.toFixed(2) ?? '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : <EmptyState icon={<CheckCircle2 />} title="No flagged leads" />
        )}
      </div>

      <div className="border-t bg-muted/30 px-4 py-3">
        {approved ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Approved {run.final_approved_at ? new Date(run.final_approved_at).toLocaleDateString('en-US') : ''}. Nothing has been sent.</span>
            <Button asChild><a href={`/api/runs/${run.id}/export`}><Download />Export CSV</a></Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">I reviewed:</span>
              {CHECKLIST.map(([k, short, full]) => (
                <button key={k} title={full} aria-pressed={!!checks[k]} onClick={() => setChecks({ ...checks, [k]: !checks[k] })}
                  className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors', checks[k] ? 'border-foreground bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground')}>
                  {checks[k] && <Check className="h-3 w-3" />}{short}
                </button>
              ))}
              {!v.pass && (
                <button title="I accept the list scored below 0.80" aria-pressed={approveAnyway} onClick={() => setApproveAnyway(!approveAnyway)}
                  className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs', approveAnyway ? 'border-amber-600 bg-amber-500 text-white' : 'border-amber-300 bg-background text-amber-800 hover:bg-amber-50')}>
                  {approveAnyway && <Check className="h-3 w-3" />}Accept low score
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {blockers.length > 0 && <span className="text-[11px] text-muted-foreground" title={blockers.join(' · ')}>{blockers[0]}{blockers.length > 1 ? ` +${blockers.length - 1}` : ''}</span>}
              <Button disabled={blockers.length > 0 || approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? 'Approving…' : 'Approve list'}</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
