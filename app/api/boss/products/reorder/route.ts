import { NextRequest, NextResponse } from 'next/server'
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
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items が不正です' }, { status: 400 })
    }

    await prisma.$transaction(
      body.items.map((it) =>
        prisma.product.update({
          where: { id: it.id },
          data : { displayOrder: it.displayOrder },
        }),
      ),
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
