import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const providers = await prisma.aiProvider.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json(providers.map(p => ({ ...p, apiKey: p.apiKey ? '••••••••' : null })))
}

export async function POST(req: NextRequest) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.name || !body?.provider || !body?.model) {
    return NextResponse.json({ error: 'name, provider, and model are required' }, { status: 400 })
  }

  // If setting as default, clear existing default
  if (body.isDefault) {
    await prisma.aiProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
  }

  const provider = await prisma.aiProvider.create({
    data: {
      name:      body.name,
      provider:  body.provider,
      baseUrl:   body.baseUrl   || null,
      apiKey:    body.apiKey    || null,
      model:     body.model,
      isDefault: body.isDefault ?? false,
      enabled:   body.enabled   ?? true,
    },
  })
  return NextResponse.json({ ...provider, apiKey: provider.apiKey ? '••••••••' : null }, { status: 201 })
}
