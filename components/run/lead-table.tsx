'use client'
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Filter, Flag, RotateCcw, Search, ShieldAlert, UserCheck } from 'lucide-react'
import { isScreenedOut, postJson, screenVerdict, type Lead } from '@/lib/run-data'
import { useRunView, type LeadTab } from '@/lib/store'
import { LeadStatusBadge } from '@/components/status-badge'
import { Button, Card, EmptyState, Input, Tabs } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export const leadSize = (l: Lead) => (l.employee_count ? `${l.employee_count}` : l.discovery_data?.headcount_raw ?? null)

function Score({ value, good = 0.75 }: { value: number | null; good?: number }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-full rounded-full', value >= good ? 'bg-emerald-500' : value >= 0.5 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${value * 100}%` }} />
      </span>
      <span className="text-xs tabular">{value.toFixed(2)}</span>
    </span>
  )
}

export function useRestore(runId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (leadIds: string[]) => postJson<{ restored: number }>(`/api/runs/${runId}/restore`, { lead_ids: leadIds }),
    onSuccess: (r) => { toast.success(`Restored ${r.restored} compan${r.restored === 1 ? 'y' : 'ies'}`, 'The agent is scraping and qualifying them now.'); qc.invalidateQueries({ queryKey: ['run', runId] }) },
    onError: (e) => toast.error('Could not restore', (e as Error).message),
  })
}

export function LeadTable({ leads: allLeads, runId, locked }: { leads: Lead[]; runId: string; locked: boolean }) {
  const { tab, setTab, openLead } = useRunView()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const restore = useRestore(runId)
  const lists: Record<LeadTab, Lead[]> = useMemo(() => {
    const leads = allLeads.filter((l) => !isScreenedOut(l))
    return {
      selected: leads.filter((l) => l.selected),
      needs_review: leads.filter((l) => l.qualification_status === 'needs_review'),
      not_qualified: leads.filter((l) => l.qualification_status === 'not_qualified'),
      all: leads,
      screened_out: allLeads.filter(isScreenedOut),
    }
  }, [allLeads])
  const needle = q.trim().toLowerCase()
  const rows = lists[tab].filter((l) => !needle || `${l.company_name} ${l.company_domain} ${l.industry ?? ''}`.toLowerCase().includes(needle))
  const screened = tab === 'screened_out'
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pickedIds = lists.screened_out.filter((l) => picked.has(l.id)).map((l) => l.id)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2">
        <Tabs<LeadTab> value={tab} onChange={setTab} className="border-b-0"
          items={[
            { value: 'selected', label: 'Qualified list', count: lists.selected.length },
            { value: 'needs_review', label: 'Needs review', count: lists.needs_review.length, tone: 'warning' },
            { value: 'not_qualified', label: 'Not qualified', count: lists.not_qualified.length },
            { value: 'all', label: 'All candidates', count: lists.all.length },
            ...(lists.screened_out.length ? [{ value: 'screened_out' as const, label: 'Screened out', count: lists.screened_out.length }] : []),
          ]} />
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies" className="pl-8" />
        </div>
      </div>

      {screened && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" />Set aside before scraping as clear ICP mismatches. They were never scraped or qualified.</span>
          {!locked && (
            <Button size="sm" variant="outline" disabled={!pickedIds.length || restore.isPending}
              onClick={() => restore.mutate(pickedIds, { onSuccess: () => setPicked(new Set()) })}>
              <RotateCcw />{restore.isPending ? 'Restoring…' : `Restore & research${pickedIds.length ? ` (${pickedIds.length})` : ''}`}
            </Button>
          )}
        </div>
      )}

      <div className="max-h-[520px] overflow-auto border-t scrollbar-thin">
        {screened ? (
          <table className="w-full min-w-[720px] text-left">
            <thead className="sticky top-0 z-10 bg-muted/80 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                {!locked && <th className="w-8 py-2 pl-4" />}
                <th className={cn('py-2 font-medium', locked ? 'px-4' : 'px-3')}>Company</th>
                <th className="px-3 py-2 font-medium">Industry</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Why it was screened out</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((l) => (
                <tr key={l.id} onClick={() => openLead(l.id)} className="cursor-pointer hover:bg-muted/40">
                  {!locked && (
                    <td className="py-2 pl-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.company_name}`} className="h-3.5 w-3.5 accent-foreground" />
                    </td>
                  )}
                  <td className={cn('max-w-[240px] py-2', locked ? 'px-4' : 'px-3')}>
                    <div className="truncate font-medium">{l.company_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{l.company_domain}</div>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-xs capitalize text-foreground/80">{l.industry ?? '—'}</td>
                  <td className="px-3 py-2 text-xs tabular text-foreground/80">{leadSize(l) ?? '—'}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-xs text-foreground/80">{l.country ?? '—'}</td>
                  <td className="max-w-[380px] px-4 py-2 text-xs text-foreground/80"><span className="line-clamp-2">{screenVerdict(l)?.reason ?? '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
        <table className="w-full min-w-[820px] text-left">
          <thead className="sticky top-0 z-10 bg-muted/80 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Industry</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Fit</th>
              <th className="px-3 py-2 font-medium">Outreach</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((l) => (
              <tr key={l.id} onClick={() => openLead(l.id)} className="cursor-pointer hover:bg-muted/40">
                <td className="max-w-[260px] px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold uppercase text-muted-foreground">{l.company_name.slice(0, 2)}</span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{l.company_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{l.company_domain}</div>
                    </div>
                  </div>
                </td>
                <td className="max-w-[160px] truncate px-3 py-2 text-xs capitalize text-foreground/80">{l.industry ?? '—'}</td>
                <td className="px-3 py-2 text-xs tabular text-foreground/80">{leadSize(l) ?? '—'}</td>
                <td className="max-w-[140px] truncate px-3 py-2 text-xs text-foreground/80">{l.country ?? '—'}</td>
                <td className="px-3 py-2"><Score value={l.confidence} /></td>
                <td className="px-3 py-2">{l.selected ? <Score value={l.outreach_quality_score} /> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    <LeadStatusBadge status={l.qualification_status} />
                    {l.manual_decision && <span title="You decided this lead"><UserCheck className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                    {l.outreach_drafts?.flagged_for_phase_seven_review && <span title="Outreach draft flagged"><Flag className="h-3.5 w-3.5 text-amber-600" /></span>}
                    {l.injection_warning && <span title="Instruction-like text on this site was ignored"><ShieldAlert className="h-3.5 w-3.5 text-red-600" /></span>}
                    {l.scrape_status === 'failed' && <span title="Website could not be scraped"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /></span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
        {!rows.length && <EmptyState title={needle ? 'No companies match' : 'No leads here yet'} />}
      </div>
    </Card>
  )
}
