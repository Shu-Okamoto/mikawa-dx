import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || '弁当'

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const end = new Date(today)
    end.setDate(today.getDate() + 30)

    // カテゴリに合致する商品IDを取得
    const products = await prisma.orderProduct.findMany({
      where: { isActive: true, category },
    })
    const productIds = products.map((p: any) => p.id)

    // 注文データ取得
    const orders = await prisma.instoreOrder.findMany({
      where: {
        status      : 'active',
        deliveryDate: { gte: today, lte: end },
        ...(productIds.length > 0
          ? { productId: { in: productIds } }
          : {}),
      },
      include : { store: true },
      orderBy : { deliveryDate: 'asc' },
    })

    // 日付別に集計
    const days: Record<string, any> = {}
    const dayNames = ['日','月','火','水','木','金','土']

    for (let i = 0; i < 30; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const dStr = d.toISOString().split('T')[0]
      days[dStr] = {
        date  : dStr,
        label : (d.getMonth()+1) + '月' + d.getDate() +
                '日(' + dayNames[d.getDay()] + ')',
        orders: [],
      }
    }

    orders.forEach((o: any) => {
      const dStr = o.deliveryDate.toISOString().split('T')[0]
      if (days[dStr]) {
        days[dStr].orders.push({
          orderId        : o.id,
          store          : o.store.storeName,
          productName    : o.productName,
          quantity       : Number(o.quantity),
          customerName   : o.customerName,
          phone          : o.phone,
          deliveryAddress: o.deliveryAddress,
          deliveryTime   : o.deliveryTime,
          receipt        : o.receipt,
          receiptName    : o.receiptName,
          purpose        : o.purpose,
          okazu          : o.okazu,
          notes          : o.notes,
        })
      }
    })

    return NextResponse.json(Object.values(days))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}