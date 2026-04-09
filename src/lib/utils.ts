import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleString('cs-CZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function priorityLabel(p: number) {
  return ['Low', 'Medium', 'High', 'Critical'][p] ?? 'Low'
}

export function priorityColor(p: number) {
  return ['text-gray-400', 'text-blue-500', 'text-amber-500', 'text-red-500'][p] ?? 'text-gray-400'
}

export function priorityBorderColor(p: number) {
  return ['border-gray-300', 'border-blue-400', 'border-amber-400', 'border-red-500'][p] ?? 'border-gray-300'
}

export function timeAgo(date: Date | string): string {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function initials(id: string): string {
  return id.slice(0, 2).toUpperCase()
}
