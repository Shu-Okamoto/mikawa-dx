import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { freeeConfig } from '@/lib/freee'
import { sendReceipt } from '@/lib/freeeSend'

// レシート画像 1 枚を freee のファイルボックスへ送る。
// 実際の送信は lib/freeeSend.ts にあり、自動送信(cron)と共通。

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
    const { path } = await req.json()
    if (typeof path !== 'string' || !path) {
      return NextResponse.json({ error: 'path が必要です' }, { status: 400 })
    }

    const r = await sendReceipt(cfg, path, user.name)
    if (r.status === 'skipped') {
      if (r.reason === '送信済み') {
        return NextResponse.json({ success: true, alreadySent: true, receiptId: r.receiptId })
      }
      return NextResponse.json({ error: r.reason ?? '送信できませんでした' }, { status: 400 })
    }
    return NextResponse.json({ success: true, receiptId: r.receiptId })
  } catch (e) {
    console.error('[freee] レシートの送信に失敗しました', e)
    const reason = e instanceof Error ? e.message : ''
    return NextResponse.json({ error: reason || 'freee への送信に失敗しました' }, { status: 500 })
  }
}
