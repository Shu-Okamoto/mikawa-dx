import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const HQ_ROLES = new Set(['hq1', 'hq2', 'hq3'])

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  if (branch === 'honbu') return HQ_ROLES.has(role)
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

// 注文編集（数量・受取情報・備考など）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const id   = parseInt((await params).id)

    const auth = await authorizeOrderAccess(id, user.role)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const data: Record<string, unknown> = {}
    if (body.quantity        !== undefined) data.quantity        = body.quantity
    if (body.price           !== undefined) data.price           = body.price
    if (body.customerName    !== undefined) data.customerName    = body.customerName
    if (body.phone           !== undefined) data.phone           = body.phone
    if (body.deliveryAddress !== undefined) data.deliveryAddress = body.deliveryAddress
    if (body.deliveryTime    !== undefined) data.deliveryTime    = body.deliveryTime
    if (body.receipt         !== undefined) data.receipt         = body.receipt
    if (body.receiptName     !== undefined) data.receiptName     = body.receiptName
    if (body.purpose         !== undefined) data.purpose         = body.purpose
    if (body.okazu           !== undefined) data.okazu           = body.okazu
    if (body.notes           !== undefined) data.notes           = body.notes

    await prisma.instoreOrder.update({ where: { id }, data })

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
