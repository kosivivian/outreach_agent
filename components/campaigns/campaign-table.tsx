'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FolderKanban, Plus, RotateCcw, Search } from 'lucide-react'
import { RunStatusBadge } from '@/components/status-badge'
import { Button, Card, EmptyState, Input, Progress, Tabs } from '@/components/ui'
import { usd } from '@/lib/utils'

export interface CampaignRow {
  id: string; campaign_name: string | null; original_objective: string; overall_status: string
  target_lead_count: number; total_cost_actual: number | null; created_at: string; current_phase: number; qualified: number
}

type View = 'all' | 'attention' | 'running' | 'approved' | 'failed'
const GROUPS: Record<Exclude<View, 'all'>, string[]> = {
  attention: ['awaiting_icp_approval', 'validation_passed', 'validation_failed', 'paused', 'error'],
  running: ['in_progress', 'researching'],
  approved: ['approved'],
  failed: ['error', 'cancelled'],
}

export function CampaignTable({ rows, initialView }: { rows: CampaignRow[]; initialView: View }) {
  const router = useRouter()
  const [view, setView] = useState<View>(initialView)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) =>
      (view === 'all' || GROUPS[view].includes(r.overall_status)) &&
      (!needle || `${r.campaign_name ?? ''} ${r.original_objective}`.toLowerCase().includes(needle)))
  }, [rows, view, q])
  const count = (v: View) => (v === 'all' ? rows.length : rows.filter((r) => GROUPS[v].includes(r.overall_status)).length)

  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon={<FolderKanban />} title="No campaigns yet" body="Start one to research and qualify leads."
          action={<Button asChild><Link href="/campaigns/new"><Plus />New campaign</Link></Button>} />
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2">
        <Tabs value={view} onChange={setView} className="border-b-0"
          items={[
            { value: 'all', label: 'All', count: count('all') },
            { value: 'attention', label: 'Needs attention', count: count('attention'), tone: 'warning' },
            { value: 'running', label: 'Running', count: count('running') },
            { value: 'approved', label: 'Approved', count: count('approved') },
            { value: 'failed', label: 'Failed / cancelled', count: count('failed') },
          ]} />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" className="pl-8" />
        </div>
      </div>

      <div className="max-h-[calc(100vh-220px)] overflow-auto border-t scrollbar-thin">
        <table className="w-full min-w-[760px] text-left">
          <thead className="sticky top-0 z-10 bg-muted/80 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Qualified</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/campaigns/${r.id}`)} className="cursor-pointer hover:bg-muted/40">
                <td className="max-w-[420px] px-4 py-2.5">
                  <div className="truncate font-medium">{r.campaign_name || 'Untitled campaign'}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.original_objective}</div>
                </td>
                <td className="px-3 py-2.5"><RunStatusBadge status={r.overall_status} /></td>
                <td className="w-40 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Progress value={r.qualified / r.target_lead_count} tone={r.qualified >= r.target_lead_count ? 'success' : 'default'} className="w-16" />
                    <span className="text-xs tabular text-muted-foreground">{r.qualified}/{r.target_lead_count}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right text-xs tabular">{usd(r.total_cost_actual)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="ghost" title="Start a new campaign with the same objective and settings"
                    onClick={(e) => { e.stopPropagation(); router.push(`/campaigns/new?from=${r.id}`) }}>
                    <RotateCcw className="!h-3.5 !w-3.5" />Run again
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <EmptyState title="No campaigns match" body="Try another filter or search term." />}
      </div>
    </Card>
  )
}
