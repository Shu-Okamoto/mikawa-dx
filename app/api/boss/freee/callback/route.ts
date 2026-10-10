import { NextRequest, NextResponse } from 'next/server'
import { freeeConfig, connectWithCode } from '@/lib/freee'
import { STATE_COOKIE } from '../connect/route'

// freee の認可画面からのリダイレクト先。
// ブラウザのトップレベル遷移で来るため JWT は付かない。代わりに連携開始時に
// 置いた state Cookie と照合する(一致しなければ何もしない)。
// 結果は画面にクエリで伝える。

const DONE = '/boss/files'

function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL(DONE, req.nextUrl.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = NextResponse.redirect(url)
  // 使い捨てなので必ず消す
  res.cookies.delete(STATE_COOKIE)
  return res
}

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) return back(req, { freee: 'error', reason: error })

  const expected = req.cookies.get(STATE_COOKIE)?.value
  if (!expected || !state || state !== expected) {
    return back(req, { freee: 'error', reason: 'state_mismatch' })
  }
  if (!code) return back(req, { freee: 'error', reason: 'no_code' })

  const cfg = freeeConfig()
  if (!cfg) return back(req, { freee: 'error', reason: 'not_configured' })

  try {
    await connectWithCode(cfg, code)
    return back(req, { freee: 'connected' })
  } catch (e) {
    console.error('[freee] 連携に失敗しました', e)
    return back(req, { freee: 'error', reason: 'token_failed' })
  }
}
