import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const orderDate = today()

    const dailyOrders = await prisma.dailyOrder.findMany({
      where  : { orderDate },
      include: { store: true },
    })

    const storeStatus = {
      A: dailyOrders.some((o) => o.store.storeCode === 'nishi'),
      B: dailyOrders.some((o) => o.store.storeCode === 'minami'),
      C: dailyOrders.some((o) => o.store.storeCode === 'honbu'),
    }

    const confirmed = await prisma.confirmedOrder.findMany({
      where: { confirmDate: orderDate },
    })

    const hqStatus = {
      veg  : confirmed.some((c) => c.category === '野菜'),
      fruit: confirmed.some((c) => c.category === '果物'),
      mochi: confirmed.some((c) => c.category === '餅・乾物菓子類'),
    }

    const sales = await prisma.sale.findMany({
      where  : { saleDate: orderDate },
      include: { store: true },
    })

    const salesData: Record<string, any> = {}
    sales.forEach((s) => {
      salesData[s.store.storeName] = {
        amount        : Number(s.amount),
        souzai        : Number(s.souzaiAmount),
        mochi         : Number(s.mochiAmount),
        hana          : Number(s.hanaAmount),
        customerCount : s.customerCount,
        staffMorning  : s.staffMorning,
        staffAfternoon: s.staffAfternoon,
      }
    })

    const logs: { who: string; time: Date | null }[] = []
    const seenStores  = new Set<string>()
    dailyOrders.forEach((o) => {
      if (!seenStores.has(o.store.storeCode)) {
        seenStores.add(o.store.storeCode)
        logs.push({
          who : o.store.storeName,
          time: o.submittedAt,
        })
      }
    })

    return NextResponse.json({
      date  : orderDate.toISOString().split('T')[0],
      storeStatus,
      hqStatus,
      sales : salesData,
      logs,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
