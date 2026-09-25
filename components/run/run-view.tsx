'use client'
import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, Download, Loader2, Play, Wrench, XCircle } from 'lucide-react'
import { isScreenedOut, postJson, useRunData, type RunData } from '@/lib/run-data'
import { useRunView } from '@/lib/store'
import { PageHeader } from '@/components/shell/app-shell'
import { RunStatusBadge } from '@/components/status-badge'
import { Button, Card, CountBadge, Progress, Skeleton } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { PHASE_NAMES, usd } from '@/lib/utils'
import { ActivityDrawer, activityCounts } from './activity-drawer'
import { FinalReport } from './final-report'
import { IcpReview } from './icp-review'
import { LeadDrawer } from './lead-drawer'
import { LeadTable } from './lead-table'
import { PhaseStepper } from './phase-stepper'

function LiveProgress({ data }: { data: RunData }) {
  const { run, leads } = data
  const n = (f: (l: (typeof leads)[number]) => boolean) => leads.filter(f).length
  const selected = n((l) => l.selected)
  const steps = [
    { label: 'Found', value: leads.length, of: Math.ceil(run.target_lead_count * 1.3) },
    { label: 'Scraped', value: n((l) => !!l.scrape_status && l.scrape_status !== 'pending'), of: leads.length },
    { label: 'Qualified', value: n((l) => l.qualification_status === 'qualified'), of: run.target_lead_count },
    { label: 'Drafted', value: n((l) => l.selected && !!l.outreach_drafts), of: selected || run.target_lead_count },
  ]
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium">
        <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
        {run.overall_status === 'in_progress' ? 'Drafting your ICP…' : `${PHASE_NAMES[run.current_phase]}…`}
        <span className="text-xs font-normal text-muted-foreground">Updates live</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {steps.map((s) => (
          <div key={s.label}>
            <div className="flex items-baseline justify-between text-xs"><span className="text-muted-foreground">{s.label}</span><span className="font-medium tabular">{s.value}<span className="text-muted-foreground">/{s.of || '—'}</span></span></div>
            <Progress value={s.of ? s.value / s.of : 0} className="mt-1.5" />
          </div>
        ))}
      </div>
    </Card>
  )
}

function RunSkeleton() {
  return (
    <div>
      <div className="border-b bg-background px-6 py-4"><Skeleton className="h-5 w-64" /><Skeleton className="mt-2 h-3 w-96" /></div>
      <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-5"><Skeleton className="h-40 w-full" /><Skeleton className="h-72 w-full" /></div>
    </div>
  )
}

export function RunView({ runId }: { runId: string }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useRunData(runId)
  const openActivity = useRunView((s) => s.openActivity)
  const refresh = () => qc.invalidateQueries({ queryKey: ['run', runId] })
  useEffect(() => { useRunView.setState({ openLeadId: null, activity: null, tab: 'selected' }) }, [runId])

  const cancel = useMutation({ mutationFn: () => postJson(`/api/runs/${runId}/cancel`), onSuccess: () => { refresh(); toast.info('Run cancelled') }, onError: (e) => toast.error('Could not cancel', (e as Error).message) })
  const resume = useMutation({ mutationFn: () => postJson(`/api/runs/${runId}/resume`), onSuccess: () => { refresh(); toast.success('Resuming from checkpoint') }, onError: (e) => toast.error('Could not resume', (e as Error).message) })

  if (isLoading) return <RunSkeleton />
  if (error || !data) return <div className="flex items-center gap-2 p-10 text-destructive"><XCircle className="h-4 w-4" />{(error as Error)?.message ?? 'Campaign not found'}</div>

  const { run, validation } = data
  // Screened-out companies stay out of every count and report; only the lead table and drawer show them.
  const leads = data.leads.filter((l) => !isScreenedOut(l))
  const active: RunData = { ...data, leads }
  const agentRunning = ['in_progress', 'researching'].includes(run.overall_status)
  const locked = agentRunning || ['approved', 'cancelled', 'awaiting_icp_approval'].includes(run.overall_status)
  const approved = run.overall_status === 'approved'
  const c = activityCounts(data)
  const selected = leads.filter((l) => l.selected).length

  return (
    <>
      <PageHeader
        title={<><h1 className="truncate">{run.campaign_name || 'Campaign'}</h1><RunStatusBadge status={run.overall_status} /></>}
        description={<span className="block max-w-3xl truncate" title={run.original_objective}>{run.original_objective}</span>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => openActivity('errors')} title="Warnings & errors">
              <AlertTriangle />Issues<CountBadge count={c.errors} tone={c.critical ? 'danger' : 'warning'} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => openActivity('tools')} title="Tool calls">
              <Wrench />Tool calls<CountBadge count={c.tools} tone={c.failedTools ? 'warning' : 'neutral'} />
            </Button>
            {['error', 'paused'].includes(run.overall_status) && <Button size="sm" onClick={() => resume.mutate()} disabled={resume.isPending}><Play />{resume.isPending ? 'Resuming…' : 'Resume'}</Button>}
            {!approved && run.overall_status !== 'cancelled' && <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}><Ban />Cancel</Button>}
            {approved
              ? <Button size="sm" asChild><a href={`/api/runs/${run.id}/export`}><Download />Export CSV</a></Button>
              : <Button size="sm" variant="outline" disabled title="Export unlocks after you approve the list"><Download />Export CSV</Button>}
          </>
        }>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2 overflow-x-auto px-4 pb-3 sm:px-6 scrollbar-thin">
          <PhaseStepper data={data} />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Qualified <b className="tabular text-foreground">{selected}/{run.target_lead_count}</b></span>
            <span>Candidates <b className="tabular text-foreground">{leads.length}</b></span>
            <span>Spend <b className="tabular text-foreground">{usd(run.total_cost_actual)}</b>{run.total_cost_estimate ? ` / ~${usd(run.total_cost_estimate)}` : ''}</span>
          </div>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        {run.overall_status === 'error' && run.last_error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
            <span className="flex min-w-0 items-center gap-2"><XCircle className="h-4 w-4 shrink-0" /><span className="truncate" title={run.last_error}>{run.last_error}</span></span>
            <Button size="sm" variant="outline" onClick={() => openActivity('errors')}>Details</Button>
          </div>
        )}

        {run.overall_status === 'awaiting_icp_approval' && run.refined_icp && <IcpReview key={run.icp_status + run.search_round} data={data} />}
        {agentRunning && <LiveProgress data={active} />}
        {validation && !agentRunning && run.overall_status !== 'awaiting_icp_approval' && <FinalReport data={active} />}
        {data.leads.length > 0 && run.overall_status !== 'awaiting_icp_approval' && <LeadTable leads={data.leads} runId={run.id} locked={locked} />}
      </div>

      <LeadDrawer leads={data.leads} runId={run.id} locked={locked} />
      <ActivityDrawer data={data} />
    </>
  )
}
