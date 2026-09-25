import { Badge } from '@/components/ui'

const RUN: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline' }> = {
  in_progress: { label: 'Refining ICP', variant: 'info' },
  awaiting_icp_approval: { label: 'Awaiting ICP approval', variant: 'warning' },
  researching: { label: 'Researching', variant: 'info' },
  paused: { label: 'Paused', variant: 'warning' },
  validation_passed: { label: 'Ready for approval', variant: 'success' },
  validation_failed: { label: 'Needs attention', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
  error: { label: 'Error', variant: 'destructive' },
}
export function RunStatusBadge({ status }: { status: string }) {
  const s = RUN[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const LEAD: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = { qualified: 'success', not_qualified: 'destructive', needs_review: 'warning' }
export function LeadStatusBadge({ status }: { status: string | null }) {
  return <Badge variant={status ? LEAD[status] ?? 'secondary' : 'secondary'}>{status ? status.replace('_', ' ') : 'pending'}</Badge>
}
