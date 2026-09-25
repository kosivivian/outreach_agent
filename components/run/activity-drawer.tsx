'use client'
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, Loader2, PauseCircle, XCircle } from 'lucide-react'
import type { RunData } from '@/lib/run-data'
import { useRunView, type ActivityTab } from '@/lib/store'
import { Badge, Drawer, EmptyState, Tabs } from '@/components/ui'
import { cn, PHASE_NAMES, usd } from '@/lib/utils'

const PHASE_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground/60" />,
  in_progress: <Loader2 className="h-4 w-4 animate-spin text-sky-600" />,
  complete: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  error: <XCircle className="h-4 w-4 text-red-600" />,
  paused: <PauseCircle className="h-4 w-4 text-amber-600" />,
}
const time = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

export function activityCounts(data: RunData) {
  const critical = data.errors.filter((e) => e.severity === 'critical').length
  const failedTools = data.toolCalls.filter((t) => t.status !== 'success').length
  return { critical, warnings: data.errors.length - critical, errors: data.errors.length, tools: data.toolCalls.length, failedTools }
}

export function ActivityDrawer({ data }: { data: RunData }) {
  const { activity, openActivity } = useRunView()
  const [failedOnly, setFailedOnly] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { phases, toolCalls, errors } = data
  const c = activityCounts(data)
  const toolCost = (n: number) => toolCalls.filter((t) => t.phase_number === n).reduce((s, t) => s + Number(t.cost_actual ?? 0), 0)
  const calls = failedOnly ? toolCalls.filter((t) => t.status !== 'success') : toolCalls

  return (
    <Drawer open={!!activity} onClose={() => openActivity(null)} title="Run activity" subtitle="Everything the agent did, for debugging and audit" width="max-w-xl">
      <div className="sticky top-0 z-10 bg-background px-5">
        <Tabs<ActivityTab> value={activity ?? 'errors'} onChange={openActivity}
          items={[
            { value: 'errors', label: 'Warnings & errors', count: c.errors, tone: c.critical ? 'danger' : 'warning' },
            { value: 'tools', label: 'Tool calls', count: c.tools },
            { value: 'phases', label: 'Phases & cost' },
          ]} />
      </div>

      <div className="px-5 py-4">
        {activity === 'errors' && (
          errors.length ? (
            <ul className="space-y-2">
              {errors.map((e) => (
                <li key={e.id} className={cn('rounded-md border p-3', e.severity === 'critical' ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium"><AlertTriangle className={cn('h-3.5 w-3.5', e.severity === 'critical' ? 'text-red-600' : 'text-amber-600')} />{e.error_type.replace(/_/g, ' ')}</span>
                    <span className="text-[11px] text-muted-foreground">{e.phase_number ? `Phase ${e.phase_number} · ` : ''}{time(e.created_at)}</span>
                  </div>
                  <p className="mt-1 break-words text-xs text-foreground/80">{e.error_message}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<CheckCircle2 />} title="No warnings or errors" />
        )}

        {activity === 'tools' && (
          <>
            <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} className="accent-primary" />
              Failed or refused only ({c.failedTools})
            </label>
            {calls.length ? (
              <ul className="divide-y rounded-md border">
                {calls.map((t) => {
                  const open = expanded === t.id
                  return (
                    <li key={t.id}>
                      <button onClick={() => setExpanded(open ? null : t.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
                        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        <span className={cn('font-mono text-xs font-medium', t.status !== 'success' && 'text-red-700')}>{t.tool_name}</span>
                        {t.status !== 'success' && <Badge variant="destructive">{t.status}</Badge>}
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{t.output_summary}</span>
                        <span className="shrink-0 text-[11px] tabular text-muted-foreground">{t.cost_actual ? usd(t.cost_actual, 3) : ''}</span>
                      </button>
                      {open && (
                        <div className="space-y-1.5 bg-muted/30 px-9 py-2 text-xs">
                          <div><span className="text-muted-foreground">Phase:</span> {t.phase_number ?? '—'} · <span className="text-muted-foreground">at</span> {time(t.created_at)}{t.duration_ms ? ` · ${(t.duration_ms / 1000).toFixed(1)}s` : ''}</div>
                          {t.input_summary && <div className="break-words"><span className="text-muted-foreground">Input:</span> {t.input_summary}</div>}
                          {t.output_summary && <div className="break-words"><span className="text-muted-foreground">Result:</span> {t.output_summary}</div>}
                          {t.error_message && <div className="break-words text-red-700">{t.error_message}</div>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : <EmptyState title={failedOnly ? 'No failed tool calls' : 'No tool calls yet'} />}
          </>
        )}

        {activity === 'phases' && (
          <ol className="space-y-1">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => {
              const p = phases.find((x) => x.phase_number === n)
              const status = p?.status ?? 'pending'
              const cost = Number(p?.cost_actual ?? 0) + toolCost(n)
              return (
                <li key={n} className={cn('flex items-start gap-2.5 rounded-md px-2 py-2', status === 'in_progress' && 'bg-sky-50')}>
                  <span className="mt-0.5">{PHASE_ICON[status] ?? PHASE_ICON.pending}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{n}. {PHASE_NAMES[n]}</span>
                      <span className="text-xs tabular text-muted-foreground">{cost > 0 ? usd(cost, 3) : ''}</span>
                    </div>
                    <div className="text-xs capitalize text-muted-foreground">{status.replace('_', ' ')}{(p?.completed_at || p?.started_at) && ` · ${time(p.completed_at ?? p.started_at)}`}</div>
                    {p?.error_message && <div className="mt-1 break-words text-xs text-red-700">{p.error_message}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Drawer>
  )
}
