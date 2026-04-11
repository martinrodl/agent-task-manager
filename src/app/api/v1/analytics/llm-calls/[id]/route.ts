import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveActor } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveActor(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const call = await prisma.llmCall.findUnique({
    where: { id },
    include: {
      task: { select: { id: true, title: true, workflowId: true } },
      taskEvent: {
        select: { id: true, actor: true, comment: true, createdAt: true, metadata: true },
      },
    },
  })

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(call)
}
