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
    const range    = searchParams.get('range') === 'past' ? 'past' : 'future'

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let start: Date
    let end  : Date
    if (range === 'past') {
      // 過去30日: today-30 〜 today-1
      start = new Date(today); start.setDate(today.getDate() - 30)
      end   = new Date(today); end.setDate(today.getDate() - 1)
    } else {
      // 今後30日: today 〜 today+30
      start = new Date(today)
      end   = new Date(today); end.setDate(today.getDate() + 30)
    }

    // カテゴリに合致する商品IDを取得
    const products = await prisma.orderProduct.findMany({
      where: { isActive: true, category },
    })
    const productIds = products.map((p: any) => p.id)

    // 注文データ取得（マスタ品 OR カスタム品で当該カテゴリのもの）
    const orders = await prisma.instoreOrder.findMany({
      where: {
        status      : 'active',
        deliveryDate: { gte: start, lte: end },
        OR: [
          ...(productIds.length > 0
            ? [{ productId: { in: productIds } }]
            : []),
          { productId: null, category },
        ],
      },
      include : { store: true, product: true },
      orderBy : { deliveryDate: 'asc' },
    })

    // 日付別に集計
    const days: Record<string, any> = {}
    const dayNames = ['日','月','火','水','木','金','土']

    const dayCount = range === 'past' ? 30 : 31  // past: -30 〜 -1 / future: 0 〜 +30
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const dStr = d.toISOString().split('T')[0]
      days[dStr] = {
        date  : dStr,
        label : (d.getMonth()+1) + '月' + d.getDate() +
                '日(' + dayNames[d.getDay()] + ')',
        orders: [],
      }
    }

    orders.forEach((o: any) => {
      const dStr     = o.deliveryDate.toISOString().split('T')[0]
      const qty      = Number(o.quantity)
      const price    = Number(o.price) || (o.product ? Number(o.product.price) : 0)
      const subtotal = price * qty
      if (days[dStr]) {
        days[dStr].orders.push({
          orderId        : o.id,
          store          : o.store.storeName,
          productName    : o.productName,
          quantity       : qty,
          price,
          subtotal,
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
