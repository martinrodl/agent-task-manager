'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/',           label: 'Dashboard',     icon: '⬛' },
  { href: '/projects',   label: 'Projects',      icon: '📁' },
  { href: '/tasks',      label: 'Tasks',         icon: '✅' },
  { href: '/review',     label: 'Review',        icon: '👁', badge: true },
  { href: '/workflows',  label: 'Workflows',     icon: '⚙️' },
  { href: '/agents',     label: 'Agents',        icon: '🤖' },
  { href: '/skills',     label: 'Skills & Keys', icon: '🔧' },
  { href: '/analytics',  label: 'Analytics',     icon: '📊' },
  { href: '/settings',   label: 'Settings',      icon: '⚙️' },
]

export function Nav({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname  = usePathname()
  const router    = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-gray-900 text-white min-h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-500 rounded-md flex items-center justify-center text-xs font-bold">AT</div>
          <span className="font-semibold text-sm">AgentTask</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3 space-y-1">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            )}
          >
            <span className="flex items-center gap-2">
              <span>{link.icon}</span>
              {link.label}
            </span>
            {link.badge && reviewCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {reviewCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* API info */}
      <div className="p-3 border-t border-gray-700">
        <div className="px-3 py-2 rounded-lg bg-gray-800 text-xs text-gray-400 space-y-1">
          <p className="font-medium text-gray-300">Agent API</p>
          <p>Base: <code className="text-blue-400">/api/v1</code></p>
          <p>Auth: <code className="text-blue-400">Bearer &lt;key&gt;</code></p>
        </div>
        <button
          onClick={handleLogout}
          className="mt-2 w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
