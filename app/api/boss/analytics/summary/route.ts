import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

interface SaleRow {
  saleDate     : Date
  amount       : { toNumber: () => number } | number
  souzaiAmount : { toNumber: () => number } | number
  mochiAmount  : { toNumber: () => number } | number
  hanaAmount   : { toNumber: () => number } | number
  customerCount: number
  store        : { storeName: string }
}

interface Bucket {
  amount       : number
  souzai       : number
  mochi        : number
  hana         : number
  customerCount: number
  days         : number
}

type Granularity = 'year' | 'month' | 'week' | 'day'
const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function toNum(v: { toNumber: () => number } | number): number {
  return typeof v === 'number' ? v : v.toNumber()
}

function newBucket(): Bucket {
  return { amount: 0, souzai: 0, mochi: 0, hana: 0, customerCount: 0, days: 0 }
}

function parseRefDate(s: string | null): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function rangeFor(granularity: Granularity, ref: Date): {
  start: Date; endExclusive: Date; endInclusive: Date; label: string
} {
  if (granularity === 'year') {
    const start = new Date(ref.getFullYear(), 0, 1)
    const end   = new Date(ref.getFullYear() + 1, 0, 1)
    const endI  = new Date(end.getTime() - 86400000)
    return { start, endExclusive: end, endInclusive: endI,
      label: `${ref.getFullYear()}年` }
  }
  if (granularity === 'month') {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const end   = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
    const endI  = new Date(end.getTime() - 86400000)
    return { start, endExclusive: end, endInclusive: endI,
      label: `${ref.getFullYear()}年${ref.getMonth() + 1}月` }
  }
  if (granularity === 'week') {
    const start = new Date(ref)
    start.setDate(ref.getDate() - ref.getDay()) // Sunday
    const end   = new Date(start)
    end.setDate(start.getDate() + 7)
    const endI  = new Date(end.getTime() - 86400000)
    const ml = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
    return { start, endExclusive: end, endInclusive: endI,
      label: `${ml(start)}〜${ml(endI)} の週` }
  }
  // day
  const start = new Date(ref)
  const end   = new Date(ref.getTime() + 86400000)
  return {
    start,
    endExclusive: end,
    endInclusive: new Date(ref),
    label: `${ref.getFullYear()}/${ref.getMonth() + 1}/${ref.getDate()}(${DOW_LABELS[ref.getDay()]})`,
  }
}

function aggregateByStore(sales: SaleRow[]): Record<string, Bucket> {
  const out: Record<string, Bucket> = {}
  sales.forEach((s) => {
    const name = s.store.storeName
    if (!out[name]) out[name] = newBucket()
    const b = out[name]
    b.amount        += toNum(s.amount)
    b.souzai        += toNum(s.souzaiAmount)
    b.mochi         += toNum(s.mochiAmount)
    b.hana          += toNum(s.hanaAmount)
    b.customerCount += s.customerCount
    b.days          += 1
  })
  return out
}

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const g  = (searchParams.get('granularity') ?? 'month') as Granularity
    if (!['year', 'month', 'week', 'day'].includes(g)) {
      return NextResponse.json({ error: '不正な粒度' }, { status: 400 })
    }
    const ref = parseRefDate(searchParams.get('ref'))
    const { start, endExclusive, endInclusive, label } = rangeFor(g, ref)

    const sales = await prisma.sale.findMany({
      where  : { saleDate: { gte: start, lt: endExclusive } },
      include: { store: true },
    }) as unknown as SaleRow[]

    const totalByStore = aggregateByStore(sales)

    let dowByStore: Record<string, Array<{
      dow         : number
      label       : string
      days        : number
      totalAmount : number
      avgAmount   : number
      avgSouzai   : number
      avgMochi    : number
      avgHana     : number
      avgCustomer : number
    }>> | undefined

    if (g !== 'day') {
      const dowAccum: Record<string, Bucket[]> = {}
      sales.forEach((s) => {
        const name = s.store.storeName
        const dow  = new Date(s.saleDate).getDay()
        if (!dowAccum[name]) dowAccum[name] = Array.from({ length: 7 }, newBucket)
        const b = dowAccum[name][dow]
        b.amount        += toNum(s.amount)
        b.souzai        += toNum(s.souzaiAmount)
        b.mochi         += toNum(s.mochiAmount)
        b.hana          += toNum(s.hanaAmount)
        b.customerCount += s.customerCount
        b.days          += 1
      })
      dowByStore = {}
      Object.entries(dowAccum).forEach(([name, buckets]) => {
        dowByStore![name] = buckets.map((b, i) => ({
          dow         : i,
          label       : DOW_LABELS[i],
          days        : b.days,
          totalAmount : b.amount,
          avgAmount   : b.days > 0 ? Math.round(b.amount / b.days) : 0,
          avgSouzai   : b.days > 0 ? Math.round(b.souzai / b.days) : 0,
          avgMochi    : b.days > 0 ? Math.round(b.mochi  / b.days) : 0,
          avgHana     : b.days > 0 ? Math.round(b.hana   / b.days) : 0,
          avgCustomer : b.days > 0 ? Math.round(b.customerCount / b.days) : 0,
        }))
      })
    }

    return NextResponse.json({
      granularity: g,
      ref        : ymd(ref),
      start      : ymd(start),
      end        : ymd(endInclusive),
      label,
      total      : { byStore: totalByStore },
      dow        : dowByStore ? { byStore: dowByStore } : undefined,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
