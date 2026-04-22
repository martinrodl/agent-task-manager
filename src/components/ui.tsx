'use client'

import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type HTMLAttributes, forwardRef } from 'react'

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs))
}

// ─── Button ──────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-text-inverse font-semibold shadow-glow-sm hover:shadow-glow active:scale-[0.98]',
  secondary:
    'bg-surface-2 text-text-primary border border-border hover:border-border-strong hover:bg-surface-3',
  ghost:
    'text-text-secondary hover:text-text-primary hover:bg-surface-2',
  danger:
    'bg-err-dim text-err border border-err/20 hover:bg-err/20',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-display font-medium tracking-wide uppercase transition-all duration-200',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled}
      {...props}
    />
  )
)
Button.displayName = 'Button'

// ─── Card ────────────────────────────────────────────────

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  glow?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive, glow, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        interactive ? 'card-interactive' : 'card',
        glow && 'animate-pulse-glow',
        'p-5',
        className
      )}
      {...props}
    />
  )
)
Card.displayName = 'Card'

// ─── Input ───────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="section-title">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'input-field',
            error && 'border-err focus:border-err focus:ring-err/30',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-err">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

// ─── Badge ───────────────────────────────────────────────

type BadgeVariant = 'accent' | 'warn' | 'ok' | 'err' | 'neutral'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  dot?: boolean
}

export function Badge({ variant = 'neutral', dot, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(`badge-${variant}`, className)} {...props}>
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            variant === 'accent' && 'bg-accent',
            variant === 'warn' && 'bg-warn',
            variant === 'ok' && 'bg-ok',
            variant === 'err' && 'bg-err',
            variant === 'neutral' && 'bg-text-tertiary'
          )}
        />
      )}
      {children}
    </span>
  )
}

// ─── Stat Card ───────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <Card className={cn('relative overflow-hidden', accent && 'border-accent/20')}>
      {accent && (
        <div className="absolute inset-0 bg-gradient-radial from-accent-dim to-transparent opacity-50" />
      )}
      <div className="relative">
        <p className="section-title mb-2">{label}</p>
        <p className={cn('stat-value', accent && 'text-gradient')}>{value}</p>
        {sub && <p className="text-xs text-text-tertiary mt-1">{sub}</p>}
      </div>
    </Card>
  )
}

// ─── Section Header ──────────────────────────────────────

interface SectionHeaderProps {
  title: string
  action?: React.ReactNode
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-display text-lg font-semibold text-text-primary tracking-wide">{title}</h2>
      {action}
    </div>
  )
}

// ─── Divider ─────────────────────────────────────────────

export function GlowDivider() {
  return <div className="glow-line my-6" />
}
