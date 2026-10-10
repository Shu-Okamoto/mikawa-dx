import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { freeeConfig, createManualJournal, JournalLine } from '@/lib/freee'

// 日次売上を freee の振替伝票として登録する。
//
// 実績入力の「売上金額」は PayPay・プレミアム商品券を含む総額なので、
// 現金分は 売上金額 − PayPay − 商品券 で求める。仕訳は
//   借方: 現金 / ペイペイ未収入金 / 商品券  貸方: 売上高<店舗>
// となり、借方合計と貸方合計は必ず一致する。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function dateOnly(ymd: string): Date {
  // DATE 列は UTC 深夜で揃える既存の慣習に合わせる
  return new Date(`${ymd}T00:00:00Z`)
}

const yen = (v: Prisma.Decimal | null | undefined) =>
  Math.round(Number(v ?? 0))

export interface Preview {
  storeCode : string
  storeName : string
  total     : number
  cash      : number
  paypay    : number
  voucher   : number
  sent      : boolean
  // 送信を妨げている理由(科目未設定など)。空なら送信可
  blockers  : string[]
}

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
    const previews = await buildPreviews(date)
    return NextResponse.json({ date, stores: previews })
  } catch (e) {
    console.error('[freee] 売上の取得に失敗しました', e)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

async function buildPreviews(date: string): Promise<Preview[]> {
  const saleDate = dateOnly(date)
  const [sales, mappings, sent] = await Promise.all([
    prisma.sale.findMany({ where: { saleDate }, include: { store: true } }),
    prisma.freeeMapping.findMany(),
    prisma.freeeJournal.findMany({ where: { saleDate } }),
  ])
  const byKey  = new Map(mappings.map((m) => [m.key, m]))
  const sentBy = new Set(sent.map((s) => s.storeCode))

  return sales.map((s) => {
    const total   = yen(s.amount)
    const paypay  = yen(s.paypayAmount)
    const voucher = yen(s.premiumVoucherAmount)
    const cash    = total - paypay - voucher

    const blockers: string[] = []
    if (!byKey.get(`sales:${s.store.storeCode}`)) blockers.push('売上高の科目が未設定')
    if (cash    > 0 && !byKey.get('cash'))    blockers.push('現金の科目が未設定')
    if (paypay  > 0 && !byKey.get('paypay'))  blockers.push('PayPayの科目が未設定')
    if (voucher > 0 && !byKey.get('voucher')) blockers.push('商品券の科目が未設定')
    if (total <= 0) blockers.push('売上が 0 円')
    if (cash < 0) blockers.push('現金分がマイナス（売上金額より PayPay+商品券 が大きい）')

    return {
      storeCode: s.store.storeCode,
      storeName: s.store.storeName,
      total, cash, paypay, voucher,
      sent     : sentBy.has(s.store.storeCode),
      blockers,
    }
  })
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

    const saleDate = dateOnly(date)
    const already = await prisma.freeeJournal.findUnique({
      where: { saleDate_storeCode: { saleDate, storeCode } },
    })
    if (already) {
      return NextResponse.json({
        success: true, alreadySent: true, journalId: already.journalId,
      })
    }

    const target = (await buildPreviews(date)).find((p) => p.storeCode === storeCode)
    if (!target) {
      return NextResponse.json({ error: 'この日の実績がありません' }, { status: 404 })
    }
    if (target.blockers.length > 0) {
      return NextResponse.json({ error: target.blockers.join(' / ') }, { status: 400 })
    }

    const mappings = await prisma.freeeMapping.findMany()
    const byKey = new Map(mappings.map((m) => [m.key, m]))
    const salesAcc = byKey.get(`sales:${storeCode}`)!

    const lines: JournalLine[] = []
    const debit = (key: string, amount: number, label: string) => {
      if (amount <= 0) return
      const m = byKey.get(key)!
      lines.push({
        entrySide: 'debit', accountId: m.accountId, amount,
        taxCode: null, description: `${target.storeName} ${date} ${label}`,
      })
    }
    debit('cash',    target.cash,    '現金売上')
    debit('paypay',  target.paypay,  'PayPay売上')
    debit('voucher', target.voucher, 'プレミアム商品券')

    lines.push({
      entrySide: 'credit', accountId: salesAcc.accountId, amount: target.total,
      taxCode: salesAcc.taxCode, description: `${target.storeName} ${date} 売上`,
    })

    const journalId = await createManualJournal(cfg, date, lines)

    await prisma.freeeJournal.create({
      data: { saleDate, storeCode, journalId, amount: target.total, sentBy: user.name },
    })

    return NextResponse.json({ success: true, journalId })
  } catch (e) {
    console.error('[freee] 売上の登録に失敗しました', e)
    const reason = e instanceof Error ? e.message : ''
    return NextResponse.json({ error: reason || '登録に失敗しました' }, { status: 500 })
  }
}
