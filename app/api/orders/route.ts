import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

// 注文一覧取得
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const store = await prisma.store.findUnique({
      where: { storeCode: user.store },
    })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    const orders = await prisma.instoreOrder.findMany({
      where: {
        storeId     : store.id,
        status      : 'active',
        deliveryDate: { gte: today },
      },
      include : { store: true },
      orderBy : { deliveryDate: 'asc' },
    })

    return NextResponse.json(orders)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// 注文保存
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const data = await req.json()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const store = await prisma.store.findUnique({
      where: { storeCode: user.store },
    })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    const now     = new Date()
    const orderCode = 'ORD' +
      now.getFullYear().toString() +
      ('0' + (now.getMonth()+1)).slice(-2) +
      ('0' + now.getDate()).slice(-2) +
      '_' + store.storeCode + '_' +
      ('0' + now.getHours()).slice(-2) +
      ('0' + now.getMinutes()).slice(-2) +
      ('0' + now.getSeconds()).slice(-2)

    const deliveryDate = new Date(data.deliveryDate)
    deliveryDate.setHours(0, 0, 0, 0)

    const order = await prisma.instoreOrder.create({
      data: {
        orderCode      : orderCode,
        orderDate      : today,
        deliveryDate   : deliveryDate,
        storeId        : store.id,
        productId      : data.productId || null,
        productName    : data.productName,
        quantity       : data.quantity,
        customerName   : data.customerName,
        phone          : data.phone,
        deliveryAddress: data.deliveryAddress,
        deliveryTime   : data.deliveryTime || null,
        receipt        : data.receipt || 'no',
        receiptName    : data.receiptName || null,
        purpose        : data.purpose || null,
        okazu          : data.okazu || null,
        notes          : data.notes || null,
        inputUser      : user.name,
        status         : 'active',
      },
    })

    return NextResponse.json({ success: true, orderId: order.id })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
