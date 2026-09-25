import { RunView } from '@/components/run/run-view'

export default function CampaignPage({ params }: { params: { id: string } }) {
  return <RunView key={params.id} runId={params.id} />
}
