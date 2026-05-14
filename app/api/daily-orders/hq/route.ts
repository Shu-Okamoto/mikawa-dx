import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const ROLE_TO_CATEGORY: Record<string, string> = {
  hq1: '野菜',
  hq2: '果物',
  hq3: '餅・乾物菓子類',
}

const HQ_ROLES = new Set(['hq1', 'hq2', 'hq3', 'all'])

function categoryFromQuery(role: string, queryCategory: string | null): string | null {
  if (role === 'all') {
    if (!queryCategory) return null
    return ROLE_TO_CATEGORY[queryCategory] ?? null
  }
  return ROLE_TO_CATEGORY[role] ?? null
}

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || !HQ_ROLES.has(user.role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const queryCategory = req.nextUrl.searchParams.get('category')
    const category      = categoryFromQuery(user.role, queryCategory)

    const orders = await prisma.dailyOrder.findMany({
      where: {
        orderDate: today(),
        ...(category ? { product: { category } } : {}),
      },
      include: {
        store  : true,
        product: { include: { vendor: true } },
      },
    })

    // 商品別に集計
    const summary: Record<number, any> = {}
    orders.forEach((o) => {
      const pid = o.productId
      if (!summary[pid]) {
        summary[pid] = {
          productId  : pid,
          productName: o.product.productName,
          category   : o.product.category,
          unit       : o.product.unit,
          vendor     : o.product.vendor?.vendorName || '',
          storeA     : null,
          storeB     : null,
          totalQty   : 0,
          adjustedQty: 0,
        }
      }
      const item = summary[pid]
      const qty  = Number(o.requestQty)

      if (o.store.storeCode === 'nishi') {
        item.storeA = { status: o.status, qty }
      } else if (o.store.storeCode === 'minami') {
        item.storeB = { status: o.status, qty }
      }
      item.totalQty += qty
    })

    // 〇・△のみ表示・在庫なし順にソート
    const statusOrder: Record<string, number> = { '〇': 0, '△': 1, '×': 2 }
    const items = Object.values(summary)
      .filter((item) =>
        item.storeA?.status === '〇' || item.storeA?.status === '△' ||
        item.storeB?.status === '〇' || item.storeB?.status === '△'
      )
      .sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category)
        const wa = Math.min(
          statusOrder[a.storeA?.status] ?? 3,
          statusOrder[a.storeB?.status] ?? 3,
        )
        const wb = Math.min(
          statusOrder[b.storeA?.status] ?? 3,
          statusOrder[b.storeB?.status] ?? 3,
        )
        return wa - wb
      })

    return NextResponse.json({ items })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
