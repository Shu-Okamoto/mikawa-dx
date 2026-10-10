import { NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { freeeConfig, uploadReceipt } from '@/lib/freee'

// ファイルボックスのレシートを freee(会計)のファイルボックスへ送る。
// blob は private なのでサーバー側で取得し、そのまま freee へ転送する。
// 送信済みは dx.FreeeReceipt に pathname で記録し、二重送信を防ぐ。

const RECEIPT_PREFIX = 'receipts/'
const STORE_BRANCHES = new Set(['nishi', 'minami', 'honbu'])

function parsePath(pathname: string): { branch: string; date: string | null } | null {
  if (!pathname.startsWith(RECEIPT_PREFIX) || pathname.includes('..')) return null
  const rest  = pathname.slice(RECEIPT_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const branch = rest.slice(0, slash)
  if (!STORE_BRANCHES.has(branch)) return null
  const m = /^(\d{4}-\d{2}-\d{2})-/.exec(rest.slice(slash + 1))
  return { branch, date: m ? m[1] : null }
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
    const { path } = await req.json()
    if (typeof path !== 'string' || !path) {
      return NextResponse.json({ error: 'path が必要です' }, { status: 400 })
    }
    const parsed = parsePath(path)
    if (!parsed) {
      return NextResponse.json({ error: 'path が不正です' }, { status: 400 })
    }

    const already = await prisma.freeeReceipt.findUnique({ where: { path } })
    if (already) {
      return NextResponse.json({
        success: true, alreadySent: true, receiptId: already.receiptId,
      })
    }

    const blob = await get(path, { access: 'private' })
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
    }
    const body = await new Response(blob.stream).blob()

    const store = await prisma.store.findUnique({ where: { storeCode: parsed.branch } })
    const label = store?.storeName ?? parsed.branch
    const description = `${label} ${parsed.date ?? ''} レシート`.trim()
    const filename = path.split('/').pop() || 'receipt.jpg'

    const receiptId = await uploadReceipt(cfg, body, filename, description)

    await prisma.freeeReceipt.create({
      data: { path, receiptId, sentBy: user.name },
    })

    return NextResponse.json({ success: true, receiptId })
  } catch (e) {
    console.error('[freee] レシートの送信に失敗しました', e)
    const reason = e instanceof Error ? e.message : ''
    return NextResponse.json(
      { error: reason || 'freee への送信に失敗しました' },
      { status: 500 },
    )
  }
}
