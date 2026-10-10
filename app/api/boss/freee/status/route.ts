import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { freeeConfig, connectionStatus, disconnect } from '@/lib/freee'

// freee 連携の状態確認と解除。トークンそのものは返さない。

function requireBoss(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') return null
  return user
}

export async function GET(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  const cfg = freeeConfig()
  try {
    const status = await connectionStatus()
    return NextResponse.json({
      configured : !!cfg,
      redirectUri: cfg?.redirectUri ?? null,
      ...status,
    })
  } catch (e) {
    console.error('[freee] 状態の取得に失敗しました', e)
    return NextResponse.json({ error: '状態の取得に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  try {
    await disconnect()
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[freee] 連携解除に失敗しました', e)
    return NextResponse.json({ error: '連携解除に失敗しました' }, { status: 500 })
  }
}
