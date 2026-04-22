'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Eye,
  Workflow,
  Bot,
  Wrench,
  BarChart3,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Zap,
} from 'lucide-react'
import { ThemeToggle } from './theme-toggle'

const links = [
  { href: '/',          label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/projects',  label: 'Projects',      icon: FolderKanban },
  { href: '/tasks',     label: 'Tasks',         icon: CheckSquare },
  { href: '/review',    label: 'Review',        icon: Eye, badge: true },
  { href: '/workflows', label: 'Workflows',     icon: Workflow },
  { href: '/agents',    label: 'Agents',        icon: Bot },
  { href: '/skills',    label: 'Skills & Keys', icon: Wrench },
  { href: '/analytics', label: 'Analytics',     icon: BarChart3 },
  { href: '/settings',  label: 'Settings',      icon: Settings },
]

export function Nav({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/' && pathname.startsWith(href))
  }

  return (
    <aside
      className={cn(
        'flex flex-col shrink-0 min-h-screen bg-surface-1 border-r border-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="px-3 py-4 border-b border-border">
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3 px-1')}>
          <div className="relative w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-accent" />
            <div className="absolute inset-0 rounded-lg ring-1 ring-accent/20" />
          </div>
          {!collapsed && (
            <span className="font-display font-semibold text-sm text-text-primary tracking-wide">
              AgentTask
            </span>
          )}
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-2 space-y-0.5 mt-1">
        {links.map(link => {
          const Icon = link.icon
          const active = isActive(link.href)

          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              className={cn(
                'group relative flex items-center rounded-lg transition-all duration-200',
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2 gap-3',
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              )}
            >
              {/* Active accent bar */}
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent shadow-glow-sm" />
              )}

              <Icon className={cn('w-[18px] h-[18px] shrink-0', active && 'drop-shadow-[0_0_6px_var(--accent-glow)]')} />

              {!collapsed && (
                <span className="text-sm font-medium truncate">{link.label}</span>
              )}

              {/* Review badge */}
              {link.badge && reviewCount > 0 && (
                <span
                  className={cn(
                    'flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold bg-err text-white font-display',
                    collapsed ? 'absolute -top-0.5 -right-0.5' : 'ml-auto'
                  )}
                >
                  {reviewCount}
                </span>
              )}

              {/* Tooltip for collapsed */}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-surface-3 border border-border text-xs text-text-primary font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-card">
                  {link.label}
                  {link.badge && reviewCount > 0 && (
                    <span className="ml-1.5 text-err">({reviewCount})</span>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-2 border-t border-border space-y-1">
        {/* API info */}
        {!collapsed && (
          <div className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-[11px] text-text-tertiary space-y-1 mb-1">
            <p className="font-display text-text-secondary text-xs tracking-wide uppercase">Agent API</p>
            <p>Base: <code className="font-mono text-accent">/api/v1</code></p>
            <p>Auth: <code className="font-mono text-accent">Bearer &lt;key&gt;</code></p>
          </div>
        )}

        {/* Theme toggle */}
        {collapsed ? (
          <ThemeToggle collapsed />
        ) : (
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[10px] text-text-tertiary font-display uppercase tracking-wider">Theme</span>
            <ThemeToggle />
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className={cn(
            'w-full flex items-center rounded-lg text-sm text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3'
          )}
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center rounded-lg text-sm text-text-tertiary hover:text-err hover:bg-err-dim transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3'
          )}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="text-xs">Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
