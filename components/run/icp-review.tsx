'use client'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Sparkles, Wallet, X } from 'lucide-react'
import { postJson, type RunData } from '@/lib/run-data'
import type { ICP } from '@/lib/schemas'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn, usd } from '@/lib/utils'

function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-background p-1 shadow-sm focus-within:border-foreground/40">
      {values.map((v) => (
        <span key={v} className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
          <span className="truncate">{v}</span>
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${v}`}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add} placeholder={values.length ? '' : placeholder ?? 'Type and press Enter'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
          if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1))
        }}
        className="min-w-[120px] flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground" />
    </div>
  )
}

const LIST_FIELDS: Array<[keyof ICP, string, string]> = [
  ['industries', 'Industries', 'Add industry'],
  ['geography', 'Geography', 'Add location'],
  ['hard_filters', 'Must have', 'All must be true'],
  ['soft_preferences', 'Nice to have', 'Never disqualifies'],
  ['disqualifiers', 'Disqualifiers', 'Rules a company out'],
]

export function IcpReview({ data }: { data: RunData }) {
  const qc = useQueryClient()
  const { run, phases } = data
  const [icp, setIcp] = useState<ICP>(run.refined_icp!)
  const inferred = new Set(run.refined_icp?.inferred_fields ?? [])
  const checkpoint = phases.find((p) => p.phase_number === 2)?.checkpoint_data ?? {}
  const cost = checkpoint.cost_estimate
  const balance = checkpoint.apify_balance

  const proceed = useMutation({
    mutationFn: () => postJson(`/api/runs/${run.id}/approve-icp`, { refined_icp: icp }),
    onSuccess: () => { toast.success('ICP approved', 'Company discovery is starting.'); qc.invalidateQueries({ queryKey: ['run', run.id] }) },
    onError: (e) => toast.error('Could not approve ICP', (e as Error).message),
  })
  const cancel = useMutation({
    mutationFn: () => postJson(`/api/runs/${run.id}/cancel`),
    onSuccess: () => { toast.info('Campaign cancelled'); qc.invalidateQueries({ queryKey: ['run', run.id] }) },
  })

  const field = (key: keyof ICP, label: string, control: React.ReactNode, wide = false) => (
    <div key={key} className={cn('space-y-1', wide && 'sm:col-span-2')}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
        {label}
        {inferred.has(key) && <Badge variant="brand" title="The agent inferred this. It wasn't in your objective"><Sparkles className="h-2.5 w-2.5" />inferred</Badge>}
      </div>
      <div className={cn(inferred.has(key) && 'rounded-md ring-2 ring-brand/40')}>{control}</div>
    </div>
  )
  const rows = [
    ['Apify discovery', cost?.apify_discovery],
    ['Claude screening', cost?.claude_screening],
    ['Firecrawl scraping', cost?.firecrawl_scraping],
    ['Claude qualification', cost?.claude_qualification],
    ['Claude copywriting', cost?.claude_copywriting],
  ] as const

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Review the ICP</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Nothing has been searched yet. Fields marked <span className="font-medium text-foreground">inferred</span> weren't in your objective.</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {field('target_company_type', 'Company type', <Input value={icp.target_company_type} onChange={(e) => setIcp({ ...icp, target_company_type: e.target.value })} />)}
          {field('headcount_range', 'Headcount', (
            <div className="flex items-center gap-2">
              <Input type="number" min={1} value={icp.headcount_range.min} onChange={(e) => setIcp({ ...icp, headcount_range: { ...icp.headcount_range, min: Number(e.target.value) } })} aria-label="Minimum headcount" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="number" min={1} value={icp.headcount_range.max} onChange={(e) => setIcp({ ...icp, headcount_range: { ...icp.headcount_range, max: Number(e.target.value) } })} aria-label="Maximum headcount" />
            </div>
          ))}
          {LIST_FIELDS.map(([k, label, ph]) => field(k, label, <TagInput values={icp[k] as string[]} onChange={(v) => setIcp({ ...icp, [k]: v })} placeholder={ph} />, k === 'hard_filters' || k === 'disqualifiers' || k === 'soft_preferences'))}
          {field('buyer_persona', 'Buyer persona', <Textarea rows={2} value={icp.buyer_persona} onChange={(e) => setIcp({ ...icp, buyer_persona: e.target.value })} />)}
          {field('business_problem', 'Business problem', <Textarea rows={2} value={icp.business_problem} onChange={(e) => setIcp({ ...icp, business_problem: e.target.value })} />)}
        </CardContent>
      </Card>

      <div className="lg:sticky lg:top-5 lg:self-start">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Estimated cost</div>
          <div className="mt-1 text-2xl font-semibold tabular">{usd(cost?.total ?? run.total_cost_estimate)}</div>
          <div className="text-xs text-muted-foreground">{run.target_lead_count} leads · {cost?.companies_fetched ? `${cost.companies_fetched} companies screened, ` : ''}{cost?.candidate_companies ?? Math.ceil(run.target_lead_count * 1.3)} scraped</div>
          <ul className="mt-3 space-y-1 border-t pt-3 text-xs">
            {rows.map(([label, value]) => (
              <li key={label} className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="tabular">{usd(value)}</span></li>
            ))}
          </ul>
          <div className={cn('mt-3 flex items-start gap-2 rounded-md p-2 text-xs', balance && !balance.sufficient ? 'bg-red-50 text-red-800' : 'bg-muted/60')}>
            <Wallet className="mt-px h-3.5 w-3.5 shrink-0" />
            {balance
              ? <span><b className="tabular">{usd(balance.personal_remaining_usd)}</b> of {usd(balance.personal_budget_usd)} Apify budget left{balance.sufficient ? '' : '. Not enough for this run'}</span>
              : 'Apify balance not checked'}
          </div>
          <Button className="mt-4 w-full" onClick={() => proceed.mutate()} disabled={proceed.isPending || (balance && !balance.sufficient)}>
            {proceed.isPending ? 'Starting…' : <>Approve & search<ArrowRight /></>}
          </Button>
          <Button variant="ghost" className="mt-1 w-full" onClick={() => cancel.mutate()} disabled={cancel.isPending || proceed.isPending}>Cancel campaign</Button>
        </Card>
      </div>
    </div>
  )
}
