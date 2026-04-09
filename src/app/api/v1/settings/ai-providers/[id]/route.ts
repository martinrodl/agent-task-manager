import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (body.isDefault) {
    await prisma.aiProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
  }

  const allowed = ['name', 'provider', 'baseUrl', 'apiKey', 'model', 'isDefault', 'enabled'] as const
  const data: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) data[k] = body[k] === '' ? null : body[k]
  }

  const provider = await prisma.aiProvider.update({ where: { id }, data })
  return NextResponse.json({ ...provider, apiKey: provider.apiKey ? '••••••••' : null })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.actorType !== 'human') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await prisma.aiProvider.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
