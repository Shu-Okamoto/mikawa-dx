import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { confirmed } = await req.json()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 〇・△のみ保存
    const filtered = confirmed.filter((d: any) =>
      d.storeAStatus === '〇' || d.storeAStatus === '△' ||
      d.storeBStatus === '〇' || d.storeBStatus === '△'
    )

    // 今日の同カテゴリデータを削除
    if (filtered.length > 0) {
      await prisma.confirmedOrder.deleteMany({
        where: {
          confirmDate: today,
          product    : { category: filtered[0].category },
        },
      })
    }

    // 保存
    for (const d of filtered) {
      const product = await prisma.product.findUnique({
        where: { id: d.productId },
      })
      if (!product) continue

      await prisma.confirmedOrder.create({
        data: {
          confirmDate: today,
          productId  : d.productId,
          category   : d.category,
          storeAQty  : d.storeAQty || 0,
          storeBQty  : d.storeBQty || 0,
          totalQty   : d.totalQty  || 0,
          adjustedQty: d.adjustedQty || 0,
          vendorId   : product.vendorId,
          isSent     : false,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
