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

    // JSTで今日(YYYY-MM-DD)を求めて以降の日付計算を進める
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
    const addDays = (s: string, n: number): string => {
      const d = new Date(s + 'T00:00:00.000Z')
      d.setUTCDate(d.getUTCDate() + n)
      return d.toISOString().split('T')[0]
    }

    const startStr = range === 'past' ? addDays(todayStr, -30) : todayStr
    const endStr   = range === 'past' ? addDays(todayStr, -1)  : addDays(todayStr, 30)
    const start = new Date(startStr + 'T00:00:00.000Z')
    const end   = new Date(endStr   + 'T23:59:59.999Z')

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
      const dStr = addDays(startStr, i)
      const [y, m, d] = dStr.split('-').map(Number)
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
      days[dStr] = {
        date  : dStr,
        label : `${m}月${d}日(${dayNames[dow]})`,
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
