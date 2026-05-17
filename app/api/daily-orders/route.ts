import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const STORE_BRANCHES = new Set(['nishi', 'minami'])
const VALID_CATEGORIES = new Set(['野菜', '果物', '餅・乾物菓子類'])

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  return role === branch
}

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// 発注データ取得（category 指定なら絞り込み、memo も返す）
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const branch   = req.nextUrl.searchParams.get('branch')
  const category = req.nextUrl.searchParams.get('category') || undefined
  if (!branch || !STORE_BRANCHES.has(branch)) {
    return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
  }
  if (!canAccessBranch(user.role, branch)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  if (category && !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'category が不正です' }, { status: 400 })
  }

  try {
    const orders = await prisma.dailyOrder.findMany({
      where: {
        orderDate: today(),
        store    : { storeCode: branch },
        ...(category ? { product: { category } } : {}),
      },
      include: { product: true },
    })

    let memos: { category: string; memo: string }[] = []
    if (category) {
      const m = await prisma.orderCategoryMemo.findFirst({
        where : { orderDate: today(), store: { storeCode: branch }, category },
      })
      memos = m ? [{ category: m.category, memo: m.memo }] : []
    } else {
      const all = await prisma.orderCategoryMemo.findMany({
        where: { orderDate: today(), store: { storeCode: branch } },
      })
      memos = all.map((m: { category: string; memo: string }) => ({
        category: m.category, memo: m.memo,
      }))
    }

    return NextResponse.json({ orders, memos })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// 発注データ保存（カテゴリ単位）
// body: { branch, category, orders: [...], memo: string }
// orders 内の status='MEMO' や productId が string の項目は memo にまとめる
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { branch, category, orders, memo } = await req.json() as {
      branch  : string
      category: string
      orders  : any[]
      memo?   : string
    }

    if (!branch || !STORE_BRANCHES.has(branch)) {
      return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
    }
    if (!canAccessBranch(user.role, branch)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }
    if (!category || !VALID_CATEGORIES.has(category)) {
      return NextResponse.json({ error: 'category が不正です' }, { status: 400 })
    }
    if (!Array.isArray(orders)) {
      return NextResponse.json({ error: 'orders は配列で送信してください' }, { status: 400 })
    }

    const orderDate = today()

    const store = await prisma.store.findUnique({ where: { storeCode: branch } })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    // 正規アイテム（productId が数値）と メモ扱い（MEMO ステータスや productId が文字列）を分離
    const regularItems: any[] = []
    const extraMemoLines: string[] = []

    for (const o of orders) {
      const isMemo =
        o.status === 'MEMO' ||
        (typeof o.productId === 'string' && /^MEMO_/i.test(o.productId))
      const isExtra = typeof o.productId === 'string' && /^temp_/i.test(o.productId)

      if (isMemo) {
        if (o.productName) extraMemoLines.push(String(o.productName))
        continue
      }
      if (isExtra) {
        const name = o.productName || '(無題)'
        const tag  = `${o.status || '―'} ${o.qty || 0}${o.unit || ''}`
        extraMemoLines.push(`+ ${name} ${tag}`.trim())
        continue
      }
      if (typeof o.productId !== 'number') continue
      regularItems.push(o)
    }

    // カテゴリ内の Product を取得して product.category 制約を確認
    const products = await prisma.product.findMany({
      where : { category, id: { in: regularItems.map((o) => o.productId) } },
      select: { id: true },
    })
    const validProductIds = new Set(products.map((p: { id: number }) => p.id))
    const validItems = regularItems.filter((o) => validProductIds.has(o.productId))

    // このカテゴリの既存 DailyOrder のみ削除（他カテゴリは保持）
    await prisma.dailyOrder.deleteMany({
      where: {
        orderDate, storeId: store.id,
        product: { category },
      },
    })

    if (validItems.length > 0) {
      await prisma.dailyOrder.createMany({
        data: validItems.map((o) => ({
          orderDate,
          storeId    : store.id,
          productId  : o.productId,
          status     : o.status || null,
          requestQty : Number(o.qty) || 0,
          inputUser  : user.name,
          submittedAt: new Date(),
        })),
      })
    }

    // メモ + 追加商品を 1 つの memo 文字列にまとめて upsert
    const combinedMemo = [memo, ...extraMemoLines]
      .map((s) => (s || '').trim()).filter(Boolean).join('\n')

    if (combinedMemo) {
      await prisma.orderCategoryMemo.upsert({
        where : { orderDate_storeId_category: { orderDate, storeId: store.id, category } },
        update: { memo: combinedMemo, inputUser: user.name },
        create: { orderDate, storeId: store.id, category, memo: combinedMemo, inputUser: user.name },
      })
    } else {
      await prisma.orderCategoryMemo.deleteMany({
        where: { orderDate, storeId: store.id, category },
      })
    }

    return NextResponse.json({
      success    : true,
      count      : validItems.length,
      memoSaved  : !!combinedMemo,
      submittedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
