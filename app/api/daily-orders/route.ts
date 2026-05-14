import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const STORE_BRANCHES = new Set(['nishi', 'minami'])

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  return role === branch
}

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// 発注データ取得
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const branch = req.nextUrl.searchParams.get('branch')
  if (!branch || !STORE_BRANCHES.has(branch)) {
    return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
  }
  if (!canAccessBranch(user.role, branch)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const orders = await prisma.dailyOrder.findMany({
      where: {
        orderDate: today(),
        store    : { storeCode: branch },
      },
      include: { product: true },
    })

    return NextResponse.json(orders)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// 発注データ保存
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { branch, orders } = await req.json()
    if (!branch || !STORE_BRANCHES.has(branch)) {
      return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
    }
    if (!canAccessBranch(user.role, branch)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const orderDate = today()

    const store = await prisma.store.findUnique({
      where: { storeCode: branch },
    })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    await prisma.dailyOrder.deleteMany({
      where: { orderDate, storeId: store.id },
    })

    const filtered = (orders as any[]).filter((o) =>
      o.status === '〇' || o.status === '△' || Number(o.qty) > 0,
    )

    await prisma.dailyOrder.createMany({
      data: filtered.map((o) => ({
        orderDate,
        storeId    : store.id,
        productId  : o.productId,
        status     : o.status,
        requestQty : o.qty || 0,
        inputUser  : user.name,
        submittedAt: new Date(),
      })),
    })

    return NextResponse.json({ success: true, count: filtered.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
