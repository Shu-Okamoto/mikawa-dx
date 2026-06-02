import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const STORE_BRANCHES = new Set(['nishi', 'minami', 'honbu'])
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

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// "YYYY-MM-DD" を UTC 00:00 の Date に変換。書式不正なら null。
function parseDateParam(s: string | null): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(s + 'T00:00:00Z')
  return isNaN(d.getTime()) ? null : d
}

// 発注データ取得
// - 単一日: ?date=YYYY-MM-DD（未指定なら今日）→ { orders, memos }
// - 範囲  : ?from=YYYY-MM-DD&to=YYYY-MM-DD  → { days: { dateStr: { orders, memos } } }
// - ?category=...   : カテゴリ絞り込み
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const branch    = req.nextUrl.searchParams.get('branch')
  const category  = req.nextUrl.searchParams.get('category') || undefined
  const dateParam = req.nextUrl.searchParams.get('date')
  const fromParam = req.nextUrl.searchParams.get('from')
  const toParam   = req.nextUrl.searchParams.get('to')

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
    // 範囲指定
    if (fromParam && toParam) {
      const from = parseDateParam(fromParam)
      const to   = parseDateParam(toParam)
      if (!from || !to) {
        return NextResponse.json({ error: 'from/to が不正です (YYYY-MM-DD)' }, { status: 400 })
      }
      const start = from <= to ? from : to
      const end   = from <= to ? to   : from

      const [orders, allMemos] = await Promise.all([
        prisma.dailyOrder.findMany({
          where: {
            orderDate: { gte: start, lte: end },
            store    : { storeCode: branch },
            ...(category ? { product: { category } } : {}),
          },
          include: { product: true },
        }),
        prisma.orderCategoryMemo.findMany({
          where: {
            orderDate: { gte: start, lte: end },
            store    : { storeCode: branch },
            ...(category ? { category } : {}),
          },
        }),
      ])

      // 日付ごとに分配
      const days: Record<string, { orders: typeof orders; memos: { category: string; memo: string }[] }> = {}
      const cur = new Date(start)
      while (cur <= end) {
        days[toDateKey(cur)] = { orders: [], memos: [] }
        cur.setDate(cur.getDate() + 1)
      }
      orders.forEach((o) => {
        const key = toDateKey(new Date(o.orderDate))
        if (days[key]) days[key].orders.push(o)
      })
      allMemos.forEach((m) => {
        const key = toDateKey(new Date(m.orderDate))
        if (days[key]) days[key].memos.push({ category: m.category, memo: m.memo })
      })

      return NextResponse.json({ days })
    }

    // 単一日（既存の互換形式）
    const targetDate = dateParam ? parseDateParam(dateParam) : today()
    if (!targetDate) {
      return NextResponse.json({ error: 'date が不正です (YYYY-MM-DD)' }, { status: 400 })
    }

    const orders = await prisma.dailyOrder.findMany({
      where: {
        orderDate: targetDate,
        store    : { storeCode: branch },
        ...(category ? { product: { category } } : {}),
      },
      include: { product: true },
    })

    let memos: { category: string; memo: string }[] = []
    if (category) {
      const m = await prisma.orderCategoryMemo.findFirst({
        where : { orderDate: targetDate, store: { storeCode: branch }, category },
      })
      memos = m ? [{ category: m.category, memo: m.memo }] : []
    } else {
      const all = await prisma.orderCategoryMemo.findMany({
        where: { orderDate: targetDate, store: { storeCode: branch } },
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
    // マスタ登録(temp + registerToMaster)対象。あとで一括で Product 作成 →
    // regularItems に編入する。
    const toRegisterItems: any[] = []

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
        const name = (o.productName || '').trim()
        if (o.registerToMaster && name) {
          toRegisterItems.push(o)
          continue
        }
        const tag = `${o.status || '―'} ${o.qty || 0}${o.unit || ''}`
        extraMemoLines.push(`+ ${name || '(無題)'} ${tag}`.trim())
        continue
      }
      if (typeof o.productId !== 'number') continue
      regularItems.push(o)
    }

    // マスタ登録: Product を作成して regularItems に追加する。
    // productCode は STORE_<branch>_<timestamp>_<i> で衝突を避ける。
    // displayOrder は当該カテゴリ末尾。
    if (toRegisterItems.length > 0) {
      const maxOrder = await prisma.product.aggregate({
        where: { category },
        _max : { displayOrder: true },
      })
      let nextOrder = (maxOrder._max.displayOrder ?? 0) + 1
      const ts = Date.now()
      for (let i = 0; i < toRegisterItems.length; i++) {
        const o = toRegisterItems[i]
        const created = await prisma.product.create({
          data: {
            productCode : `STORE_${branch}_${ts}_${i}`,
            productName : String(o.productName).trim(),
            category,
            unit        : o.unit || '個',
            weeklyAvg   : 0,
            isActive    : true,
            displayOrder: nextOrder++,
          },
        })
        regularItems.push({
          productId: created.id,
          status   : o.status,
          qty      : o.qty,
          unit     : created.unit,
        })
      }
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
          requestQty : parseFloat(String(o.qty)) || 0,
          inputUser  : user.name,
          submittedAt: new Date(),
        })),
      })
    }

    // qty に「2ケース」「半ケース」のような非数値テキストが含まれる場合は、
    // 数値情報は requestQty (parseFloat) に保存しつつ、原文をメモに自動追記して
    // 情報損失を防ぐ。
    const qtyTextNotes: string[] = []
    for (const o of validItems) {
      const rawTxt = String(o.qty ?? '').trim()
      if (!rawTxt) continue
      const num = parseFloat(rawTxt)
      // 純粋な数値表記の場合 (例: '5', '2.5') はメモ不要
      const isPureNumber = !Number.isNaN(num) && String(num) === rawTxt
      if (isPureNumber) continue
      if (o.productName) qtyTextNotes.push(`${o.productName}: ${rawTxt}`)
    }

    // メモ + 追加商品 + qty テキスト注釈 を 1 つの memo 文字列にまとめて upsert
    const combinedMemo = [memo, ...extraMemoLines, ...qtyTextNotes]
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
