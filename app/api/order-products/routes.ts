import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

// 数量修正
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const id = parseInt(params.id)

    const order = await prisma.instoreOrder.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json({ error: '注文が見つかりません' }, { status: 404 })
    }

    await prisma.instoreOrder.update({
      where: { id },
      data : { quantity },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// キャンセル
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const id = parseInt(params.id)

    const order = await prisma.instoreOrder.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json({ error: '注文が見つかりません' }, { status: 404 })
    }

    await prisma.instoreOrder.update({
      where: { id },
      data : { status: 'cancelled' },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}