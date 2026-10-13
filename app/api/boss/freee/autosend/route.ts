import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { freeeConfig } from '@/lib/freee'
import {
  autoSendSettings, saveAutoSendSettings, runAutoSend, DATE_RE,
} from '@/lib/freeeSend'
import { todayJstYmd } from '@/lib/serverDate'

// 自動送信の設定と、手動での即時実行(動作確認用)。

function requireBoss(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') return null
  return user
}

export async function GET(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  try {
    return NextResponse.json({
      ...await autoSendSettings(),
      // CRON_SECRET が無いと Vercel Cron からの実行は 401 で止まる
      cronReady: !!process.env.CRON_SECRET,
    })
  } catch (e) {
    console.error('[freee] 自動送信設定の取得に失敗しました', e)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  try {
    const b = await req.json()
    await saveAutoSendSettings({
      enabled     : !!b.enabled,
      sendSales   : b.sendSales !== false,
      sendReceipts: b.sendReceipts !== false,
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[freee] 自動送信設定の保存に失敗しました', e)
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}

// 今すぐ実行(自動送信と同じ処理を手動で動かす)
export async function POST(req: NextRequest) {
  const user = requireBoss(req)
  if (!user) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  const cfg = freeeConfig()
  if (!cfg) {
    return NextResponse.json({ error: 'freee の設定が未完了です' }, { status: 400 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const date = typeof body?.date === 'string' && DATE_RE.test(body.date)
      ? body.date : todayJstYmd()
    const s = await autoSendSettings()
    const result = await runAutoSend(cfg, date, user.name, {
      sendSales   : s.sendSales,
      sendReceipts: s.sendReceipts,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[freee] 手動実行に失敗しました', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '実行に失敗しました' },
      { status: 500 },
    )
  }
}
