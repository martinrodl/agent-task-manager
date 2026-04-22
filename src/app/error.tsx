'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[error-boundary]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Something went wrong</h2>
        <p className="text-sm text-text-secondary">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
