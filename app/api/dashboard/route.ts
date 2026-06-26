import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { todayJst } from '@/lib/serverDate'

const today = todayJst

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

    const STORE_CODES = new Set(['nishi', 'minami'])
    const logs: { who: string; time: Date | null }[] = []
    const seenStores  = new Set<string>()
    dailyOrders.forEach((o) => {
      if (!STORE_CODES.has(o.store.storeCode)) return
      if (!seenStores.has(o.store.storeCode)) {
        seenStores.add(o.store.storeCode)
        logs.push({
          who : o.store.storeName,
          time: o.submittedAt,
        })
      }
    })

    return NextResponse.json({
      date : orderDate.toISOString().split('T')[0],
      sales: salesData,
      logs,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
