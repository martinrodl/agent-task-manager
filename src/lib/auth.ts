import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { prisma } from './prisma'

const secret = () => new TextEncoder().encode(
  process.env.SECRET_KEY ?? 'fallback-secret-change-me'
)

export type ActorType = 'human' | 'agent' | 'orchestrator'

export interface AuthContext {
  actor: string
  actorType: ActorType
}

// ─── Session (human admin) ────────────────────────────────────────────────────

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(secret())
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret())
    return true
  } catch {
    return false
  }
}

export async function verifyPassword(password: string): Promise<boolean> {
  return password === (process.env.ADMIN_PASSWORD ?? 'admin')
}

// ─── Server-side session read ─────────────────────────────────────────────────

export async function getSession(): Promise<boolean> {
  const jar = await cookies()
  const token = jar.get('session')?.value
  if (!token) return false
  return verifySessionToken(token)
}

// ─── API request auth (agent or human) ───────────────────────────────────────

export async function resolveActor(req: NextRequest): Promise<AuthContext | null> {
  // 1. Bearer token — agent or orchestrator
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const key = authHeader.slice(7)
    if (!key) return null

    // 1a. Check per-agent tokens in DB first
    const agentRecord = await prisma.agent.findFirst({
      where: { apiToken: key, enabled: true },
      select: { name: true },
    })
    if (agentRecord) {
      return { actor: agentRecord.name, actorType: 'agent' }
    }

    // 1b. Fall back to env-var keys (backward compat + orchestrator)
    const orchKey  = process.env.ORCHESTRATOR_API_KEY ?? ''
    const agentKey = process.env.AGENT_API_KEY ?? ''

    if (orchKey && key === orchKey) {
      const agentId = req.headers.get('x-agent-id') ?? 'orchestrator'
      return { actor: agentId, actorType: 'orchestrator' }
    }
    if (agentKey && key === agentKey) {
      const agentId = req.headers.get('x-agent-id') ?? 'agent'
      return { actor: agentId, actorType: 'agent' }
    }
    return null
  }

  // 2. Session cookie — human
  const token = req.cookies.get('session')?.value
  if (token && await verifySessionToken(token)) {
    return { actor: 'admin', actorType: 'human' }
  }

  return null
}
