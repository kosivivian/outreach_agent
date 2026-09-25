'use client'
import { Check, Loader2, Pause, X } from 'lucide-react'
import type { RunData } from '@/lib/run-data'
import { cn } from '@/lib/utils'

const SHORT: Record<number, string> = { 1: 'ICP', 2: 'Review', 3: 'Discover', 4: 'Scrape', 5: 'Qualify', 6: 'Outreach', 7: 'Validate' }

export function PhaseStepper({ data }: { data: RunData }) {
  const { phases, run } = data
  return (
    <ol className="flex min-w-max items-center">
      {[1, 2, 3, 4, 5, 6, 7].map((n, i) => {
        const p = phases.find((x) => x.phase_number === n)
        let status = p?.status ?? 'pending'
        if (n === 2 && run.overall_status === 'awaiting_icp_approval') status = 'waiting'
        if (n === 7 && ['validation_passed', 'validation_failed'].includes(run.overall_status) && status === 'complete') status = 'waiting'
        if (n === 7 && run.overall_status === 'approved') status = 'complete'
        const done = status === 'complete'
        return (
          <li key={n} className="flex items-center" title={`Phase ${n}: ${status.replace('_', ' ')}${p?.error_message ? ` · ${p.error_message}` : ''}`}>
            {i > 0 && <span className={cn('mx-1.5 h-px w-4 sm:w-6', done || status === 'in_progress' || status === 'waiting' ? 'bg-foreground/40' : 'bg-border')} />}
            <span className="flex items-center gap-1.5">
              <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset',
                done && 'bg-foreground text-background ring-foreground',
                status === 'in_progress' && 'bg-sky-50 text-sky-700 ring-sky-300',
                status === 'waiting' && 'bg-brand text-brand-foreground ring-brand',
                status === 'error' && 'bg-red-50 text-red-700 ring-red-300',
                status === 'paused' && 'bg-amber-50 text-amber-700 ring-amber-300',
                status === 'pending' && 'bg-background text-muted-foreground ring-border')}>
                {done ? <Check className="h-3 w-3" /> : status === 'in_progress' ? <Loader2 className="h-3 w-3 animate-spin" /> : status === 'error' ? <X className="h-3 w-3" /> : status === 'paused' ? <Pause className="h-2.5 w-2.5" /> : n}
              </span>
              <span className={cn('hidden text-xs md:inline', status === 'pending' ? 'text-muted-foreground' : 'font-medium')}>{SHORT[n]}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
