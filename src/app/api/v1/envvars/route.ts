import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const vars = await prisma.envVar.findMany({ orderBy: { key: 'asc' } })
  // Never expose values in list — show masked version
  return NextResponse.json(vars.map(v => ({ ...v, value: '••••••••' })))
}

export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.key || !body?.value) return NextResponse.json({ error: 'key and value are required' }, { status: 400 })

  const envVar = await prisma.envVar.create({
    data: {
      key:         body.key.trim().toUpperCase().replace(/\s+/g, '_'),
      value:       body.value,
      description: body.description ?? null,
    },
  })
  return NextResponse.json({ ...envVar, value: '••••••••' }, { status: 201 })
}
