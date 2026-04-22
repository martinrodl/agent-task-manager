'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Zap } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      const from = searchParams.get('from') ?? '/'
      const safeDest = from.startsWith('/') && !from.startsWith('//') ? from : '/'
      router.push(safeDest)
    } else {
      setError('Invalid password')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-surface-0 relative">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/[0.04] rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/15 ring-1 ring-accent/20 mb-5">
            <Zap className="w-7 h-7 text-accent" />
          </div>
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">AgentTask</h1>
          <p className="text-sm text-text-tertiary mt-1">Task management for agentic workflows</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8 space-y-5">
          <div>
            <label className="section-title mb-2 block">Admin password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-err">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent text-text-inverse font-display font-semibold rounded-lg tracking-wide uppercase shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
