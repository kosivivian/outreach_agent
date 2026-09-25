'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, ExternalLink, Info, RotateCcw, ShieldCheck } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shell/app-shell'
import { RunStatusBadge } from '@/components/status-badge'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { PERSONAS, TONES } from '@/lib/schemas'
import { cn } from '@/lib/utils'

const EXAMPLES = [
  'Find 10 US B2B SaaS companies with 10 to 100 employees that may need AI automation support.',
  'UK marketing agencies, 20-200 staff, doing a lot of manual client reporting',
]
interface DuplicateRun { id: string; campaign_name: string | null; overall_status: string; created_at: string }
class CreateError extends Error {
  constructor(message: string, public code?: string, public duplicate?: DuplicateRun, public suggestion?: string | null) { super(message) }
}

const DEFAULT_OFFER = 'A trained AI automation assistant who joins your team to automate repetitive workflows and build AI-enabled internal systems.'

function NewCampaignForm() {
  const router = useRouter()
  const from = useSearchParams().get('from')
  const [form, setForm] = useState({
    campaign_name: '',
    objective: '',
    target_lead_count: 10,
    tone: 'professional' as (typeof TONES)[number],
    offer: DEFAULT_OFFER,
    target_persona: PERSONAS[0] as string,
    additional_context: '',
  })
  const [clonedFrom, setClonedFrom] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateRun | null>(null)
  const [rejected, setRejected] = useState<{ reason: string; suggestion?: string | null } | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    if (k === 'objective') { setDuplicate(null); setRejected(null) }
    setForm((f) => ({ ...f, [k]: v }))
  }

  useEffect(() => {
    if (!from) return
    const sb = supabaseBrowser()
    sb.from('runs').select('campaign_name, original_objective, target_lead_count, campaign_settings_id').eq('id', from).maybeSingle().then(async ({ data: run }: { data: { campaign_name: string | null; original_objective: string; target_lead_count: number; campaign_settings_id: string | null } | null }) => {
      if (!run) return
      const { data: s } = run.campaign_settings_id
        ? await sb.from('campaign_settings').select('tone, offer, target_persona, additional_context').eq('id', run.campaign_settings_id).maybeSingle()
        : { data: null }
      setClonedFrom(run.campaign_name || 'a previous campaign')
      setForm((f) => ({
        ...f,
        campaign_name: `${run.campaign_name || 'Campaign'} (rerun)`,
        objective: run.original_objective,
        target_lead_count: run.target_lead_count,
        ...(s ? { tone: (TONES as readonly string[]).includes(s.tone) ? s.tone : f.tone, offer: s.offer || f.offer, target_persona: s.target_persona || f.target_persona, additional_context: s.additional_context || '' } : {}),
      }))
    })
  }, [from])

  const create = useMutation({
    mutationFn: async (opts: { confirmDuplicate?: boolean } = {}) => {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          campaign_name: form.campaign_name,
          objective: form.objective,
          target_lead_count: form.target_lead_count,
          settings: { tone: form.tone, offer: form.offer, target_persona: form.target_persona, additional_context: form.additional_context },
          confirm_duplicate: opts.confirmDuplicate || undefined,
          rerun_of: from || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new CreateError(data.error || 'Failed to create campaign', data.code, data.duplicate, data.suggestion)
      return data as { id: string }
    },
    onSuccess: ({ id }) => { toast.success('Campaign started', 'The agent is drafting your ICP.'); router.push(`/campaigns/${id}`) },
    onError: (e) => {
      const err = e as CreateError
      const reveal = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      if (err.code === 'duplicate_objective' && err.duplicate) { setDuplicate(err.duplicate); return reveal('duplicate-warning') }
      if (err.code === 'objective_rejected') { setRejected({ reason: err.message, suggestion: err.suggestion }); return reveal('objective') }
      toast.error('Could not start campaign', err.message)
    },
  })

  const candidates = Math.ceil(form.target_lead_count * 1.3)

  return (
    <>
      <PageHeader title="New campaign" description={clonedFrom ? <span className="inline-flex items-center gap-1"><RotateCcw className="h-3 w-3" />Pre-filled from {clonedFrom}</span> : 'Describe who you want to reach'} />
      <form className="mx-auto grid max-w-[1100px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_300px]" onSubmit={(e) => { e.preventDefault(); create.mutate({}) }}>
        <div className="space-y-4">
          {duplicate && (
            <div id="duplicate-warning" className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900" role="alert">
              <div className="flex items-center gap-1.5 text-[13px] font-medium"><AlertTriangle className="h-4 w-4" />You already ran this exact objective</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-background px-3 py-2 text-foreground">
                <span className="font-medium">{duplicate.campaign_name || 'Untitled campaign'}</span>
                <RunStatusBadge status={duplicate.overall_status} />
                <span className="text-muted-foreground">{new Date(duplicate.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <p className="mt-2">Check its leads first. A new campaign with the same objective will likely find many of the same companies and cost the same again.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" asChild><Link href={`/campaigns/${duplicate.id}`}><ExternalLink />Open that campaign</Link></Button>
                <Button type="button" size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate({ confirmDuplicate: true })}>{create.isPending ? 'Starting…' : 'Start a new one anyway'}</Button>
              </div>
            </div>
          )}
          <Card>
            <CardHeader><CardTitle>Who are you looking for?</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Campaign name</Label>
                <Input id="name" required value={form.campaign_name} onChange={(e) => set('campaign_name', e.target.value)} placeholder="Q4 US SaaS founders" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="objective">Objective</Label>
                <Textarea id="objective" required rows={4} value={form.objective} onChange={(e) => set('objective', e.target.value)} placeholder={EXAMPLES[0]}
                  aria-invalid={!!rejected} aria-describedby={rejected ? 'objective-error' : undefined} className={cn(rejected && 'border-red-400 focus-visible:ring-red-300')} />
                {rejected && (
                  <div id="objective-error" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                    <div className="font-medium">No ICP was drafted: {rejected.reason}</div>
                    {rejected.suggestion && <div className="mt-0.5 text-red-800/80">{rejected.suggestion}</div>}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" onClick={() => set('objective', ex)}
                      className="max-w-full truncate rounded-full border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">{ex}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="count">Qualified leads wanted</Label>
                <div className="flex items-center gap-1.5">
                  {[5, 10, 15, 25].map((n) => (
                    <button key={n} type="button" onClick={() => set('target_lead_count', n)}
                      className={cn('h-8 rounded-md border px-3 text-[13px] tabular', form.target_lead_count === n ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted')}>{n}</button>
                  ))}
                  <Input id="count" type="number" min={1} max={25} className="w-20" value={form.target_lead_count} onChange={(e) => set('target_lead_count', Number(e.target.value))} aria-label="Custom lead count" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Outreach style</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tone</Label>
                <div className="flex rounded-md border bg-muted/50 p-0.5">
                  {TONES.map((t) => (
                    <button key={t} type="button" onClick={() => set('tone', t)}
                      className={cn('h-7 flex-1 rounded text-xs capitalize', form.tone === t ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="persona">Target persona</Label>
                <Select id="persona" value={form.target_persona} onChange={(e) => set('target_persona', e.target.value)}>
                  {PERSONAS.map((p) => <option key={p}>{p}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="offer">Offer</Label>
                <Textarea id="offer" required rows={2} value={form.offer} onChange={(e) => set('offer', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ctx">Extra context <span className="font-normal text-muted-foreground">· optional</span></Label>
                <Textarea id="ctx" rows={2} value={form.additional_context} onChange={(e) => set('additional_context', e.target.value)} placeholder="Proof points you can mention, things to avoid…" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-5 lg:self-start">
          <Card className="p-4">
            <div className="text-xs font-medium text-muted-foreground">What happens next</div>
            <ol className="mt-3 space-y-2.5 text-xs">
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-brand-foreground">1</span>The agent drafts an ICP. This step is free.</li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">2</span>You review the ICP and its cost estimate.</li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">3</span>It searches <b className="tabular">{candidates}</b> companies, qualifies them and drafts outreach.</li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">4</span>You approve the list and export it.</li>
            </ol>
            <div className="mt-4 flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />Nothing is ever sent. Outreach stays as drafts.
            </div>
            <Button type="submit" className="mt-4 w-full" disabled={create.isPending}>{create.isPending ? 'Starting…' : <>Draft ICP<ArrowRight /></>}</Button>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Info className="h-3 w-3" />Lead count is locked once started.</p>
          </Card>
        </div>
      </form>
    </>
  )
}

export default function NewCampaignPage() {
  return <Suspense><NewCampaignForm /></Suspense>
}
