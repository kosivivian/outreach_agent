'use client'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/85',
        brand: 'bg-brand text-brand-foreground shadow-sm hover:bg-brand/85',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-8 px-3', sm: 'h-7 px-2.5 text-xs', lg: 'h-10 px-5 text-sm', icon: 'h-8 w-8' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
})
Button.displayName = 'Button'

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-lg border bg-card text-card-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)} {...p} />
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-0.5 px-4 pb-2 pt-4', className)} {...p} />
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn('text-sm font-semibold', className)} {...p} />
export const CardDescription = ({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn('text-xs text-muted-foreground', className)} {...p} />
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('px-4 pb-4', className)} {...p} />

const field = 'flex w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] shadow-sm placeholder:text-muted-foreground focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/10 disabled:opacity-50'
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-8', className)} {...p} />)
Input.displayName = 'Input'
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-[64px]', className)} {...p} />)
Textarea.displayName = 'Textarea'
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} className={cn(field, 'h-8 py-0', className)} {...p} />)
Select.displayName = 'Select'
export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn('text-xs font-medium text-foreground/80', className)} {...p} />

const badgeVariants = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground',
      secondary: 'bg-secondary text-secondary-foreground',
      outline: 'border text-foreground',
      success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15',
      warning: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20',
      destructive: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15',
      info: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15',
      brand: 'bg-brand/25 text-brand-foreground ring-1 ring-inset ring-brand/50',
    },
  },
  defaultVariants: { variant: 'default' },
})
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>
export const Badge = ({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => <span className={cn(badgeVariants({ variant }), className)} {...p} />

export const Checkbox = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => <input type="checkbox" className={cn('h-4 w-4 rounded border-input accent-primary', className)} {...p} />

/** Notification-style counter, e.g. on the Errors / Tool calls buttons. */
export function CountBadge({ count, tone = 'neutral', className }: { count: number; tone?: 'neutral' | 'danger' | 'warning'; className?: string }) {
  if (!count) return null
  return (
    <span className={cn(
      'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular',
      tone === 'danger' ? 'bg-red-600 text-white' : tone === 'warning' ? 'bg-amber-500 text-white' : 'bg-foreground/10 text-foreground',
      className,
    )}>{count > 999 ? '999+' : count}</span>
  )
}

export function Progress({ value, className, tone = 'default' }: { value: number; className?: string; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-all', { default: 'bg-primary', success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-red-500' }[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-md bg-muted', className)} />

export function StatTile({ label, value, sub, icon, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {icon && <span className="text-muted-foreground/70 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  )
}

/** Underline tabs. */
export function Tabs<T extends string>({ value, onChange, items, className }: {
  value: T
  onChange: (v: T) => void
  items: Array<{ value: T; label: React.ReactNode; count?: number; tone?: 'neutral' | 'danger' | 'warning' }>
  className?: string
}) {
  return (
    <div role="tablist" className={cn('flex gap-4 overflow-x-auto border-b scrollbar-thin', className)}>
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2 text-[13px] transition-colors',
            value === it.value ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {it.label}
          {it.count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px] tabular', value === it.value ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground', it.tone === 'danger' && it.count > 0 && 'bg-red-100 text-red-700', it.tone === 'warning' && it.count > 0 && 'bg-amber-100 text-amber-800')}>{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Right-hand slide-over panel with its own scroll area. */
export function Drawer({ open, onClose, title, subtitle, actions, children, width = 'max-w-2xl' }: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  width?: string
}) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-foreground/20 animate-fade-in" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className={cn('absolute inset-y-0 right-0 flex w-full flex-col bg-background shadow-2xl animate-slide-in', width)}>
        <header className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </aside>
    </div>
  )
}

export function EmptyState({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {icon && <div className="mb-1 rounded-full bg-muted p-3 text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {body && <p className="max-w-sm text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Small label/value row used in drawers and cards. */
export const Meta = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5 truncate text-[13px]">{children}</div>
  </div>
)
