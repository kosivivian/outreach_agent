import { loadDashboard } from '@/lib/dashboard'
import { DashboardView } from '@/components/dashboard/dashboard-view'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  return <DashboardView d={await loadDashboard()} />
}
