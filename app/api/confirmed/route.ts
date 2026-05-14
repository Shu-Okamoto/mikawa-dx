import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const ROLE_TO_CATEGORY: Record<string, string> = {
  hq1: '野菜',
  hq2: '果物',
  hq3: '餅・乾物菓子類',
}

const HQ_ROLES = new Set(['hq1', 'hq2', 'hq3', 'all'])

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || !HQ_ROLES.has(user.role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const { confirmed } = await req.json()
    if (!Array.isArray(confirmed)) {
      return NextResponse.json({ error: 'confirmed が不正です' }, { status: 400 })
    }

    // hq1/hq2/hq3 は自カテゴリ以外への書き込みを拒否
    if (user.role !== 'all') {
      const myCategory = ROLE_TO_CATEGORY[user.role]
      for (const d of confirmed) {
        if (d.category !== myCategory) {
          return NextResponse.json(
            { error: 'カテゴリ権限エラー' },
            { status: 403 },
          )
        }
      }
    }

    const orderDate = today()

    // 〇・△のみ保存
    const filtered = confirmed.filter((d: any) =>
      d.storeAStatus === '〇' || d.storeAStatus === '△' ||
      d.storeBStatus === '〇' || d.storeBStatus === '△'
    )

    // カテゴリ単位で当日データを削除
    const categories = Array.from(new Set(filtered.map((d: any) => d.category)))
    for (const cat of categories) {
      await prisma.confirmedOrder.deleteMany({
        where: {
          confirmDate: orderDate,
          category   : cat as string,
        },
      })
    }

    for (const d of filtered) {
      const product = await prisma.product.findUnique({
        where: { id: d.productId },
      })
      if (!product) continue

      await prisma.confirmedOrder.create({
        data: {
          confirmDate: orderDate,
          productId  : d.productId,
          category   : d.category,
          storeAQty  : d.storeAQty   || 0,
          storeBQty  : d.storeBQty   || 0,
          totalQty   : d.totalQty    || 0,
          adjustedQty: d.adjustedQty || 0,
          vendorId   : product.vendorId,
          isSent     : false,
        },
      })
    }

    return NextResponse.json({ success: true, count: filtered.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
