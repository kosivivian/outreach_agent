import Link from 'next/link'
import { AlertCircle, ArrowRight, Building2, CheckCircle2, CircleDollarSign, FolderKanban, Plus, Target } from 'lucide-react'
import type { DashboardData } from '@/lib/dashboard'
import { PageHeader } from '@/components/shell/app-shell'
import { RunStatusBadge } from '@/components/status-badge'
import { Button, Card, CardHeader, CardTitle, EmptyState, StatTile } from '@/components/ui'
import { cn, usd } from '@/lib/utils'

const TONE = { danger: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-sky-500' }

export function DashboardView({ d }: { d: DashboardData }) {
  const rate = d.leads.decided ? d.leads.qualified / d.leads.decided : null
  const breakdown = [
    { label: 'Claude', value: d.cost.claude, color: 'bg-violet-500' },
    { label: 'Apify', value: d.cost.apify, color: 'bg-brand' },
    { label: 'Firecrawl', value: d.cost.firecrawl, color: 'bg-orange-500' },
    { label: 'Other', value: d.cost.other, color: 'bg-slate-300' },
  ].filter((b) => b.value > 0)
  const peak = Math.max(...d.months.map((m) => m.cost), 0.01)

  return (
    <>
      <PageHeader title="Home" description="All-time overview of your lead research"
        actions={<Button asChild><Link href="/campaigns/new"><Plus />New campaign</Link></Button>} />

      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        {!d.campaigns.total ? (
          <Card>
            <EmptyState icon={<FolderKanban />} title="No campaigns yet" body="Describe who you want to reach. The agent drafts an ICP for you to review before any paid search runs."
              action={<Button asChild><Link href="/campaigns/new"><Plus />Start your first campaign</Link></Button>} />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Campaigns" icon={<FolderKanban />} value={d.campaigns.total} sub={`${d.campaigns.approved} approved · ${d.campaigns.active} running`} />
              <StatTile label="Qualified leads" icon={<Target />} value={d.leads.selected} sub={rate === null ? 'No decisions yet' : `${Math.round(rate * 100)}% qualification rate`} />
              <StatTile label="Companies researched" icon={<Building2 />} value={d.leads.companies} sub="Company data only, no contacts stored" />
              <StatTile label="Total spend" icon={<CircleDollarSign />} value={usd(d.cost.total)} sub={d.cost.perQualified === null ? `${usd(d.cost.thisMonth)} this month` : `${usd(d.cost.perQualified)} per qualified lead`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Needs attention</CardTitle>
                  {d.attention.length > 3 && <Link href="/campaigns?view=attention" className="text-xs text-muted-foreground hover:text-foreground">View all {d.attention.length}</Link>}
                </CardHeader>
                {d.attention.length ? (
                  <ul className="divide-y">
                    {d.attention.slice(0, 3).map((a) => (
                      <li key={a.id}>
                        <Link href={`/campaigns/${a.id}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE[a.tone])} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{a.name}</div>
                            <div className="text-xs text-muted-foreground">{a.reason}</div>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-foreground/70 group-hover:text-foreground">{a.action}<ArrowRight className="h-3.5 w-3.5" /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 px-4 pb-5 pt-1 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Nothing needs you right now.</div>
                )}
              </Card>

              <Card>
                <CardHeader><CardTitle>Cost breakdown</CardTitle></CardHeader>
                <div className="px-4 pb-4">
                  <div className="text-2xl font-semibold tabular">{usd(d.cost.total)}</div>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                    {breakdown.map((b) => <div key={b.label} className={b.color} style={{ width: `${(b.value / (d.cost.total || 1)) * 100}%` }} title={`${b.label} ${usd(b.value, 3)}`} />)}
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {breakdown.map((b) => (
                      <li key={b.label} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-sm', b.color)} />{b.label}</span>
                        <span className="tabular text-muted-foreground">{usd(b.value, 3)}</span>
                      </li>
                    ))}
                    {!breakdown.length && <li className="text-xs text-muted-foreground">No spend yet.</li>}
                  </ul>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Spend per month</CardTitle>
                  <span className="text-xs text-muted-foreground">{usd(d.cost.thisMonth)} this month</span>
                </CardHeader>
                <div className="flex h-40 items-end gap-2 px-4 pb-4 pt-2">
                  {d.months.map((m, i) => (
                    <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${m.label}: ${usd(m.cost, 3)} across ${m.runs} campaign(s)`}>
                      <span className="text-[10px] tabular text-muted-foreground">{m.cost > 0 ? usd(m.cost) : ''}</span>
                      <div className={cn('w-full max-w-[36px] rounded-t', i === 5 ? 'bg-primary' : 'bg-primary/20')} style={{ height: `${Math.max(m.cost > 0 ? 4 : 1, (m.cost / peak) * 100)}%` }} />
                      <span className="text-[11px] text-muted-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Recent campaigns</CardTitle>
                  <Link href="/campaigns" className="text-xs text-muted-foreground hover:text-foreground">All campaigns</Link>
                </CardHeader>
                <ul className="divide-y">
                  {d.recent.map((r) => (
                    <li key={r.id}>
                      <Link href={`/campaigns/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{r.campaign_name || 'Untitled campaign'}</div>
                          <div className="truncate text-xs text-muted-foreground">{r.original_objective}</div>
                        </div>
                        <span className="hidden text-xs tabular text-muted-foreground sm:block">{usd(r.total_cost_actual)}</span>
                        <RunStatusBadge status={r.overall_status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            {d.attention.some((a) => a.tone === 'danger') && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertCircle className="h-3.5 w-3.5" />Failed runs keep their checkpoints. Resuming continues where they stopped.</p>
            )}
          </>
        )}
      </div>
    </>
  )
}
