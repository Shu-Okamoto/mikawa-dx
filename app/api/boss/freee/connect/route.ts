import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyToken } from '@/lib/auth'
import { freeeConfig, authorizeUrl } from '@/lib/freee'

// freee 連携の開始。
// 認可画面へはブラウザのトップレベル遷移で飛ぶ必要があり、その遷移には
// Authorization ヘッダを付けられない。そのため「認証付きのこの API で URL を
// 作って state を Cookie に置き」「遷移自体はクライアントが行う」形にする。
// コールバック側はこの Cookie と照合して、第三者が叩いても通らないようにする。

export const STATE_COOKIE = 'freee_oauth_state'

export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const cfg = freeeConfig()
  if (!cfg) {
    return NextResponse.json({
      error: 'freee の設定が未完了です(FREEE_CLIENT_ID / FREEE_CLIENT_SECRET / '
           + 'FREEE_COMPANY_ID / NEXT_PUBLIC_API_URL を設定してください)',
    }, { status: 400 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const res = NextResponse.json({ url: authorizeUrl(cfg, state), redirectUri: cfg.redirectUri })
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure  : process.env.NODE_ENV === 'production',
    sameSite: 'lax',   // freee からのリダイレクトでも送られるようにする
    path    : '/',
    maxAge  : 10 * 60,
  })
  return res
}
