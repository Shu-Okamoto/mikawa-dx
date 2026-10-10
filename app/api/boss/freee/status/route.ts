import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  freeeConfig, connectionStatus, disconnect, listCompanies, setCompanyId,
  resolvedCompanyId,
} from '@/lib/freee'

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

    // 連携済みなら、参照できる事業所の一覧も返して画面で選べるようにする
    let companies: { id: string; name: string }[] = []
    let companiesError: string | null = null
    let selectedCompanyId: string | null = null
    if (cfg && status.connected) {
      selectedCompanyId = await resolvedCompanyId(cfg) || null
      try {
        companies = await listCompanies(cfg)
      } catch (e) {
        companiesError = e instanceof Error ? e.message : '事業所一覧を取得できませんでした'
      }
    }

    return NextResponse.json({
      configured : !!cfg,
      redirectUri: cfg?.redirectUri ?? null,
      companies,
      companiesError,
      selectedCompanyId,
      ...status,
    })
  } catch (e) {
    console.error('[freee] 状態の取得に失敗しました', e)
    return NextResponse.json({ error: '状態の取得に失敗しました' }, { status: 500 })
  }
}

// 使用する事業所を選ぶ
export async function PUT(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  try {
    const { companyId } = await req.json()
    if (typeof companyId !== 'string' || !companyId) {
      return NextResponse.json({ error: 'companyId が必要です' }, { status: 400 })
    }
    await setCompanyId(companyId)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[freee] 事業所の保存に失敗しました', e)
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
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
