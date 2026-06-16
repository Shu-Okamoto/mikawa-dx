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

// 'YYYY-MM-DD' or 'YYYY/MM/DD' を 0:00 の Date に
function parseDateParam(s: string | null): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setHours(0, 0, 0, 0)
  return isNaN(d.getTime()) ? null : d
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

interface ItemSummary {
  productId  : number
  productName: string
  category   : string
  unit       : string
  vendor     : string
  storeA     : { status: string | null; qty: number; qtyText: string | null } | null
  storeB     : { status: string | null; qty: number; qtyText: string | null } | null
  totalQty   : number
  adjustedQty: number
}

interface MemoEntry {
  store   : string
  category: string
  memo    : string
}

type MemoRow = {
  store   : { storeCode: string }
  category: string
  memo    : string
  orderDate: Date
}

type OrderRow = {
  productId: number
  product  : { productName: string; category: string; unit: string; vendor: { vendorName: string } | null }
  store    : { storeCode: string }
  status   : string | null
  requestQty    : number | { toNumber: () => number }
  requestQtyText: string | null
}

function aggregateItems(orders: OrderRow[]): ItemSummary[] {
  const summary: Record<number, ItemSummary> = {}
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
    const item    = summary[pid]
    const qty     = typeof o.requestQty === 'number' ? o.requestQty : o.requestQty.toNumber()
    const qtyText = o.requestQtyText ?? null

    if (o.store.storeCode === 'nishi') {
      item.storeA = { status: o.status, qty, qtyText }
    } else if (o.store.storeCode === 'minami') {
      item.storeB = { status: o.status, qty, qtyText }
    }
    item.totalQty += qty
  })

  const statusOrder: Record<string, number> = { '〇': 0, '△': 1, '×': 2 }
  return Object.values(summary).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    const wa = Math.min(
      statusOrder[a.storeA?.status ?? ''] ?? 3,
      statusOrder[a.storeB?.status ?? ''] ?? 3,
    )
    const wb = Math.min(
      statusOrder[b.storeA?.status ?? ''] ?? 3,
      statusOrder[b.storeB?.status ?? ''] ?? 3,
    )
    return wa - wb
  })
}

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || !HQ_ROLES.has(user.role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const queryCategory = req.nextUrl.searchParams.get('category')
    const category      = categoryFromQuery(user.role, queryCategory)
    const fromParam     = parseDateParam(req.nextUrl.searchParams.get('from'))
    const toParam       = parseDateParam(req.nextUrl.searchParams.get('to'))

    // 範囲指定: { days: { dateStr: { items, memos } } } を返す
    if (fromParam && toParam) {
      const start = fromParam <= toParam ? fromParam : toParam
      const end   = fromParam <= toParam ? toParam   : fromParam

      const [orders, memos] = await Promise.all([
        prisma.dailyOrder.findMany({
          where: {
            orderDate: { gte: start, lte: end },
            // 本部(honbu)は発注集計に含めない(メモのみ)
            store: { storeCode: { in: ['nishi', 'minami'] } },
            ...(category ? { product: { category } } : {}),
          },
          include: {
            store  : true,
            product: { include: { vendor: true } },
          },
        }),
        prisma.orderCategoryMemo.findMany({
          where: {
            orderDate: { gte: start, lte: end },
            ...(category ? { category } : {}),
          },
          include: { store: true },
        }),
      ])

      // 日付ごとに分類
      const ordersByDate: Record<string, OrderRow[]> = {}
      orders.forEach((o) => {
        const key = toDateKey(new Date(o.orderDate))
        if (!ordersByDate[key]) ordersByDate[key] = []
        ordersByDate[key].push(o as unknown as OrderRow)
      })
      const memosByDate: Record<string, MemoEntry[]> = {}
      ;(memos as unknown as MemoRow[]).forEach((m) => {
        const key = toDateKey(new Date(m.orderDate))
        if (!memosByDate[key]) memosByDate[key] = []
        memosByDate[key].push({
          store   : m.store.storeCode,
          category: m.category,
          memo    : m.memo,
        })
      })

      const days: Record<string, { items: ItemSummary[]; memos: MemoEntry[] }> = {}
      // 範囲内の全日を埋める（空日もキー入れる）
      const cur = new Date(start)
      while (cur <= end) {
        const key = toDateKey(cur)
        days[key] = {
          items: aggregateItems(ordersByDate[key] ?? []),
          memos: memosByDate[key] ?? [],
        }
        cur.setDate(cur.getDate() + 1)
      }

      return NextResponse.json({ days })
    }

    // 単一日: 既存の互換形式
    const orderDate = parseDateParam(req.nextUrl.searchParams.get('date')) ?? today()

    const [orders, memos] = await Promise.all([
      prisma.dailyOrder.findMany({
        where: {
          orderDate,
          // 本部(honbu)は発注集計に含めない(メモのみ)
          store: { storeCode: { in: ['nishi', 'minami'] } },
          ...(category ? { product: { category } } : {}),
        },
        include: {
          store  : true,
          product: { include: { vendor: true } },
        },
      }),
      prisma.orderCategoryMemo.findMany({
        where: {
          orderDate,
          ...(category ? { category } : {}),
        },
        include: { store: true },
      }),
    ])

    const items = aggregateItems(orders as unknown as OrderRow[])
    const memoList: MemoEntry[] = (memos as unknown as MemoRow[]).map((m) => ({
      store   : m.store.storeCode,
      category: m.category,
      memo    : m.memo,
    }))
    return NextResponse.json({ items, memos: memoList })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
