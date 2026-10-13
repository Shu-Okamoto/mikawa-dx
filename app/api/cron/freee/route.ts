import { NextRequest, NextResponse } from 'next/server'
import { freeeConfig } from '@/lib/freee'
import { autoSendSettings, runAutoSend } from '@/lib/freeeSend'
import { todayJstYmd } from '@/lib/serverDate'

// 毎日 20 時(JST)に Vercel Cron から呼ばれ、その日の売上とレシートを
// freee へ送る。vercel.json のスケジュールは UTC なので 11:00 を指定する。
//
// 「営業日だけ」はカレンダーを持たずに実現する: 実績が入っていない日は
// 送るものが無いので自然に何もしない(日曜・臨時休業も同じ扱いになる)。
//
// 外部から叩かれないよう CRON_SECRET で保護する。未設定なら実行しない。

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const settings = await autoSendSettings()
  if (!settings.enabled) {
    return NextResponse.json({ skipped: '自動送信が無効です' })
  }

  const cfg = freeeConfig()
  if (!cfg) {
    return NextResponse.json({ skipped: 'freee の設定が未完了です' })
  }

  const date = todayJstYmd()
  try {
    const result = await runAutoSend(cfg, date, '自動送信', {
      sendSales   : settings.sendSales,
      sendReceipts: settings.sendReceipts,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[cron] freee への自動送信に失敗しました', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '自動送信に失敗しました' },
      { status: 500 },
    )
  }
}
