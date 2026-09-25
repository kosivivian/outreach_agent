'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronsLeft, ChevronsRight, FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Sparkles, X } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Home', icon: LayoutDashboard, match: (p: string) => p === '/' },
  { href: '/campaigns', label: 'Campaigns', icon: FolderKanban, match: (p: string) => p.startsWith('/campaigns') && p !== '/campaigns/new' },
]

const COLLAPSE_KEY = 'koya.sidebar.collapsed'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch {}
    supabaseBrowser().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? null))
  }, [])
  useEffect(() => setMobileOpen(false), [pathname])

  if (pathname.startsWith('/login') || pathname.startsWith('/auth')) return <>{children}</>

  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch {}
      return !c
    })
  }
  const signOut = async () => { await supabaseBrowser().auth.signOut(); router.replace('/login'); router.refresh() }

  const nav = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 items-center gap-2 px-4', compact && 'justify-center px-0')}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground"><Sparkles className="h-4 w-4" /></span>
        {!compact && <span className="truncate text-sm font-semibold">Koya Lead Agent</span>}
      </div>

      <div className={cn('px-3 pb-2', compact && 'px-2')}>
        <Link href="/campaigns/new" title="New campaign"
          className={cn('flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary/85', pathname === '/campaigns/new' && 'ring-2 ring-brand')}>
          <Plus className="h-4 w-4" />{!compact && 'New campaign'}
        </Link>
      </div>

      <nav className={cn('flex-1 space-y-0.5 px-3 py-2', compact && 'px-2')}>
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <Link key={href} href={href} title={compact ? label : undefined}
              className={cn('relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
                compact && 'justify-center px-0',
                active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground')}>
              {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" />}
              <Icon className="h-4 w-4 shrink-0" />
              {!compact && label}
            </Link>
          )
        })}
      </nav>

      <div className={cn('space-y-1 border-t p-3', compact && 'px-2')}>
        {!compact && email && <div className="truncate px-2.5 pb-1 text-xs text-muted-foreground" title={email}>{email}</div>}
        <button onClick={signOut} title="Sign out" className={cn('flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground', compact && 'justify-center px-0')}>
          <LogOut className="h-4 w-4" />{!compact && 'Sign out'}
        </button>
        <button onClick={toggle} title={compact ? 'Expand sidebar' : 'Collapse sidebar'} className={cn('hidden h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground lg:flex', compact && 'justify-center px-0')}>
          {compact ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={cn('hidden shrink-0 border-r bg-background transition-[width] duration-200 lg:block', collapsed ? 'w-[60px]' : 'w-[220px]')}>
        {nav(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[240px] border-r bg-background shadow-xl animate-fade-in">
            <button className="absolute right-2 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
            {nav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4 lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Open menu"><Menu className="h-4 w-4" /></button>
          <span className="text-sm font-semibold">Koya Lead Agent</span>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  )
}

/** Page header used at the top of every screen: title left, actions right. */
export function PageHeader({ title, description, actions, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="border-b bg-background">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">{typeof title === 'string' ? <h1>{title}</h1> : title}</div>
          {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
