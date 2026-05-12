import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

// 発注データ取得
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const orders = await prisma.dailyOrder.findMany({
      where: {
        orderDate: today,
        store    : { storeCode: user.store },
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
    const { orders } = await req.json()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 店舗取得
    const store = await prisma.store.findUnique({
      where: { storeCode: user.store },
    })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    // 今日の同一店舗データを削除して再登録
    await prisma.dailyOrder.deleteMany({
      where: { orderDate: today, storeId: store.id },
    })

    // 〇・△・数量ありのみ保存
    const filtered = orders.filter((o: any) =>
      o.status === '〇' || o.status === '△' || Number(o.qty) > 0
    )

    await prisma.dailyOrder.createMany({
      data: filtered.map((o: any) => ({
          orderDate  : today,
        storeId    : store.id,
        productId  : o.productId,
        status     : o.status,
        requestQty : o.qty || 0,
        inputUser  : user.name,
        submittedAt: new Date(),
      })),
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}