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
    const deliveryDate = searchParams.get('deliveryDate')
    const category     = searchParams.get('category')

    // 曜日フィルター
    let dayName = ''
    if (deliveryDate) {
      const days = ['日','月','火','水','木','金','土']
      const d    = new Date(deliveryDate)
      dayName    = days[d.getDay()]
    }

    const products = await prisma.orderProduct.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
        ...(dayName ? { availableDays: { contains: dayName } } : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { productCode: 'asc' }],
    })

    return NextResponse.json(products.map((p) => ({
      id           : p.id,
      productCode  : p.productCode,
      productName  : p.productName,
      category     : p.category,
      price        : Number(p.price),
      availableDays: p.availableDays,
      memo         : p.memo,
      lateOrderOk  : p.lateOrderOk,
    })))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
