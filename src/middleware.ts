import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const secret = () => new TextEncoder().encode(
  process.env.SECRET_KEY ?? 'fallback-secret-change-me'
)

async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    await jwtVerify(token, secret())
    return true
  } catch {
    return false
  }
}

function isValidApiKey(authHeader: string | null): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false
  const key = authHeader.slice(7)
  if (!key) return false
  const agentKey = process.env.AGENT_API_KEY ?? ''
  const orchKey  = process.env.ORCHESTRATOR_API_KEY ?? ''
  // Env-var keys are validated here (no DB available in middleware).
  // Per-agent DB tokens are validated later in resolveActor() inside the route handler.
  // Any non-empty Bearer token is allowed through; resolveActor returns null if invalid.
  if ((!!agentKey && key === agentKey) || (!!orchKey && key === orchKey)) return true
  // Unknown token — let it through; the route handler will reject if not in DB
  return true
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // API v1 — accept API key OR session cookie
  if (pathname.startsWith('/api/v1/')) {
    if (isValidApiKey(request.headers.get('authorization'))) {
      return NextResponse.next()
    }
    const token = request.cookies.get('session')?.value
    if (await isValidSession(token)) {
      return NextResponse.next()
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // All other routes — require session cookie
  const token = request.cookies.get('session')?.value
  if (await isValidSession(token)) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
