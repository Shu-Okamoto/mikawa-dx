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

function toNum(v: { toNumber: () => number } | number): number {
  return typeof v === 'number' ? v : v.toNumber()
}

function newBucket(): Bucket {
  return { amount: 0, souzai: 0, mochi: 0, hana: 0, customerCount: 0, days: 0 }
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
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const yearStart  = new Date(now.getFullYear(), 0, 1)
    const yearEnd    = new Date(now.getFullYear() + 1, 0, 1)

    const [monthSales, yearSales] = await Promise.all([
      prisma.sale.findMany({
        where  : { saleDate: { gte: monthStart, lt: monthEnd } },
        include: { store: true },
      }),
      prisma.sale.findMany({
        where  : { saleDate: { gte: yearStart, lt: yearEnd } },
        include: { store: true },
      }),
    ])

    const monthlyByStore = aggregateByStore(monthSales as unknown as SaleRow[])
    const yearlyByStore  = aggregateByStore(yearSales  as unknown as SaleRow[])

    // 曜日別: 年内データを曜日でグループ化
    const dowLabels = ['日', '月', '火', '水', '木', '金', '土']
    const dowAccum: Record<string, Bucket[]> = {}
    ;(yearSales as unknown as SaleRow[]).forEach((s) => {
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

    const dowByStore: Record<string, Array<{
      dow         : number
      label       : string
      days        : number
      totalAmount : number
      avgAmount   : number
      avgSouzai   : number
      avgMochi    : number
      avgHana     : number
      avgCustomer : number
    }>> = {}
    Object.entries(dowAccum).forEach(([name, buckets]) => {
      dowByStore[name] = buckets.map((b, i) => ({
        dow         : i,
        label       : dowLabels[i],
        days        : b.days,
        totalAmount : b.amount,
        avgAmount   : b.days > 0 ? Math.round(b.amount / b.days) : 0,
        avgSouzai   : b.days > 0 ? Math.round(b.souzai / b.days) : 0,
        avgMochi    : b.days > 0 ? Math.round(b.mochi  / b.days) : 0,
        avgHana     : b.days > 0 ? Math.round(b.hana   / b.days) : 0,
        avgCustomer : b.days > 0 ? Math.round(b.customerCount / b.days) : 0,
      }))
    })

    return NextResponse.json({
      monthly: {
        label  : `${now.getFullYear()}年${now.getMonth() + 1}月`,
        byStore: monthlyByStore,
      },
      yearly: {
        label  : `${now.getFullYear()}年`,
        byStore: yearlyByStore,
      },
      dow: {
        label  : `${now.getFullYear()}年（曜日別1日平均）`,
        byStore: dowByStore,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
