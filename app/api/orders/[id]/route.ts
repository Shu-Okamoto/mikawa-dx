import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  return role === branch
}

async function authorizeOrderAccess(orderId: number, role: string) {
  const order = await prisma.instoreOrder.findUnique({
    where  : { id: orderId },
    include: { store: true },
  })
  if (!order) return { ok: false as const, status: 404, error: '注文が見つかりません' }
  if (!canAccessBranch(role, order.store.storeCode)) {
    return { ok: false as const, status: 403, error: '権限がありません' }
  }
  return { ok: true as const, order }
}

// 数量修正
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const id = parseInt((await params).id)

    const auth = await authorizeOrderAccess(id, user.role)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
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
  { params }: { params: Promise<{ id: string }> },
) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const id = parseInt((await params).id)

    const auth = await authorizeOrderAccess(id, user.role)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
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
