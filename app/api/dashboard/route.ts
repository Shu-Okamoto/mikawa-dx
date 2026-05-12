import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 今日の発注データ
    const dailyOrders = await prisma.dailyOrder.findMany({
      where  : { orderDate: today },
      include: { store: true },
    })

    const storeStatus = {
      A: dailyOrders.some((o: any) => o.store.storeCode === 'nishi'),
      B: dailyOrders.some((o: any) => o.store.storeCode === 'minami'),
      C: dailyOrders.some((o: any) => o.store.storeCode === 'honbu'),
    }

    // 発注確定状況
    const confirmed = await prisma.confirmedOrder.findMany({
      where: { confirmDate: today },
    })

    const hqStatus = {
      veg  : confirmed.some((c: any) => c.category === '野菜'),
      fruit: confirmed.some((c: any) => c.category === '果物'),
      mochi: confirmed.some((c: any) => c.category === '餅・乾物菓子類'),
    }

    // 売上データ
    const sales = await prisma.sale.findMany({
      where  : { saleDate: today },
      include: { store: true },
    })

    const salesData: Record<string, any> = {}
    sales.forEach((s: any) => {
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

    // 入力ログ
    const logs: any[] = []
    const seenStores  = new Set()
    dailyOrders.forEach((o: any) => {
      if (!seenStores.has(o.store.storeCode)) {
        seenStores.add(o.store.storeCode)
        logs.push({
          who : o.store.storeName,
          time: o.submittedAt,
        })
      }
    })

    return NextResponse.json({
      date       : today.toISOString().split('T')[0],
      storeStatus,
      hqStatus,
      sales      : salesData,
      logs,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}