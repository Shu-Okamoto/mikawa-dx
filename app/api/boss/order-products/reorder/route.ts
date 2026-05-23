import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

interface ReorderPayload {
  items: { id: number; displayOrder: number }[]
}

export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const body = await req.json() as ReorderPayload
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ success: true })
    }

    const cases = Prisma.join(
      body.items.map(
        (it) => Prisma.sql`WHEN ${it.id}::int THEN ${it.displayOrder}::int`,
      ),
      ' ',
    )
    const ids = Prisma.join(body.items.map((it) => it.id))

    await prisma.$executeRaw`
      UPDATE dx."OrderProduct"
      SET "displayOrder" = CASE id ${cases} END
      WHERE id IN (${ids})
    `

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
