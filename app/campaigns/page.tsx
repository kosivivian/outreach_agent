import Link from 'next/link'
import { Plus } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/app-shell'
import { Button } from '@/components/ui'
import { CampaignTable, type CampaignRow } from '@/components/campaigns/campaign-table'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage({ searchParams }: { searchParams: { view?: string } }) {
  const sb = supabaseServer()
  const [{ data: runs }, { data: selected }] = await Promise.all([
    sb.from('runs').select('id, campaign_name, original_objective, overall_status, target_lead_count, total_cost_actual, created_at, current_phase').order('created_at', { ascending: false }),
    sb.from('leads').select('run_id').eq('selected', true),
  ])
  const counts = new Map<string, number>()
  for (const l of selected ?? []) counts.set(l.run_id, (counts.get(l.run_id) ?? 0) + 1)
  const rows: CampaignRow[] = (runs ?? []).map((r) => ({ ...r, qualified: counts.get(r.id) ?? 0 }))

  return (
    <>
      <PageHeader title="Campaigns" description={`${rows.length} campaign${rows.length === 1 ? '' : 's'}`}
        actions={<Button asChild><Link href="/campaigns/new"><Plus />New campaign</Link></Button>} />
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <CampaignTable rows={rows} initialView={searchParams.view === 'attention' ? 'attention' : 'all'} />
      </div>
    </>
  )
}
