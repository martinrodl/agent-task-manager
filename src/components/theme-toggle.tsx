'use client'

import { useTheme } from './theme-provider'
import { Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  collapsed?: boolean
}

export function ThemeToggle({ collapsed }: ThemeToggleProps) {
  const { theme, resolved, setTheme, toggle } = useTheme()

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="group relative w-full flex items-center justify-center px-2 py-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors"
        title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
      >
        {resolved === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-surface-3 border border-border text-xs text-text-primary font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-card">
          {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
        </div>
      </button>
    )
  }

  return (
    <div className="flex items-center rounded-lg bg-surface-2 border border-border p-0.5">
      {([
        { value: 'light' as const, icon: Sun, label: 'Light' },
        { value: 'system' as const, icon: Monitor, label: 'System' },
        { value: 'dark' as const, icon: Moon, label: 'Dark' },
      ]).map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={cn(
            'flex items-center justify-center w-8 h-7 rounded-md transition-all duration-200',
            theme === value
              ? 'bg-accent/15 text-accent shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  )
}
