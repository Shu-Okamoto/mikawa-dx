import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { freeeConfig } from '@/lib/freee'
import { buildSalePreviews, sendSale, DATE_RE } from '@/lib/freeeSend'

// 日次売上の確認(GET)と、freee への振替伝票登録(POST)。
// 実際の組み立ては lib/freeeSend.ts にあり、自動送信(cron)と共通。

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const date = req.nextUrl.searchParams.get('date') ?? ''
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date が不正です' }, { status: 400 })
  }

  try {
    return NextResponse.json({ date, stores: await buildSalePreviews(date) })
  } catch (e) {
    console.error('[freee] 売上の取得に失敗しました', e)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const cfg = freeeConfig()
  if (!cfg) {
    return NextResponse.json({ error: 'freee の設定が未完了です' }, { status: 400 })
  }

  try {
    const { date, storeCode } = await req.json()
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      return NextResponse.json({ error: 'date が不正です' }, { status: 400 })
    }
    if (typeof storeCode !== 'string' || !storeCode) {
      return NextResponse.json({ error: 'storeCode が必要です' }, { status: 400 })
    }

    const r = await sendSale(cfg, date, storeCode, user.name)
    if (r.status === 'skipped') {
      // 送信済みは成功扱い、それ以外は理由を返す
      if (r.reason === '送信済み') {
        return NextResponse.json({ success: true, alreadySent: true, journalId: r.journalId })
      }
      return NextResponse.json({ error: r.reason ?? '登録できませんでした' }, { status: 400 })
    }
    return NextResponse.json({ success: true, journalId: r.journalId })
  } catch (e) {
    console.error('[freee] 売上の登録に失敗しました', e)
    const reason = e instanceof Error ? e.message : ''
    return NextResponse.json({ error: reason || '登録に失敗しました' }, { status: 500 })
  }
}
