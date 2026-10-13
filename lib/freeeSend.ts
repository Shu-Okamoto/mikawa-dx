import { Prisma } from '@prisma/client'
import { get, list } from '@vercel/blob'
import prisma from '@/lib/prisma'
import {
  FreeeConfig, createManualJournal, uploadReceipt, JournalLine,
} from '@/lib/freee'

// 日次売上とレシート画像を freee へ送る処理。
// 画面からの手動送信(/boss/freee, /boss/files)と、毎日 20 時の自動送信
// (/api/cron/freee)の両方から呼ぶ。
//
// 実績入力の「売上金額」は PayPay・プレミアム商品券を含む総額なので、
// 現金分は 売上金額 − PayPay − 商品券 で求める。仕訳は
//   借方: 現金 / ペイペイ未収入金 / 商品券   貸方: 売上高<店舗>
// となり、借方合計と貸方合計は必ず一致する。

export const RECEIPT_PREFIX = 'receipts/'
const STORE_BRANCHES = new Set(['nishi', 'minami', 'honbu'])

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// DATE 列は UTC 深夜で揃える既存の慣習に合わせる
export function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`)
}

const yen = (v: Prisma.Decimal | null | undefined) => Math.round(Number(v ?? 0))

export interface SalePreview {
  storeCode: string
  storeName: string
  total    : number
  cash     : number
  paypay   : number
  voucher  : number
  sent     : boolean
  // 送信を妨げている理由(科目未設定など)。空なら送信可
  blockers : string[]
}

export async function buildSalePreviews(date: string): Promise<SalePreview[]> {
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

// 1 店舗ぶんの売上を振替伝票として登録する。
// 送信済み・送信不可の場合は登録せずに理由を返す。
export async function sendSale(
  cfg: FreeeConfig, date: string, storeCode: string, by: string,
): Promise<{ status: 'sent' | 'skipped'; journalId?: string; reason?: string }> {
  const saleDate = dateOnly(date)

  const already = await prisma.freeeJournal.findUnique({
    where: { saleDate_storeCode: { saleDate, storeCode } },
  })
  if (already) return { status: 'skipped', reason: '送信済み', journalId: already.journalId }

  const target = (await buildSalePreviews(date)).find((p) => p.storeCode === storeCode)
  if (!target) return { status: 'skipped', reason: 'この日の実績がありません' }
  if (target.blockers.length > 0) {
    return { status: 'skipped', reason: target.blockers.join(' / ') }
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
    data: { saleDate, storeCode, journalId, amount: target.total, sentBy: by },
  })
  return { status: 'sent', journalId }
}

export function parseReceiptPath(
  pathname: string,
): { branch: string; date: string | null } | null {
  if (!pathname.startsWith(RECEIPT_PREFIX) || pathname.includes('..')) return null
  const rest  = pathname.slice(RECEIPT_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const branch = rest.slice(0, slash)
  if (!STORE_BRANCHES.has(branch)) return null
  const m = /^(\d{4}-\d{2}-\d{2})-/.exec(rest.slice(slash + 1))
  return { branch, date: m ? m[1] : null }
}

// レシート画像 1 枚を freee のファイルボックスへ送る。
export async function sendReceipt(
  cfg: FreeeConfig, path: string, by: string,
): Promise<{ status: 'sent' | 'skipped'; receiptId?: string; reason?: string }> {
  const parsed = parseReceiptPath(path)
  if (!parsed) return { status: 'skipped', reason: 'path が不正です' }

  const already = await prisma.freeeReceipt.findUnique({ where: { path } })
  if (already) return { status: 'skipped', reason: '送信済み', receiptId: already.receiptId }

  const blob = await get(path, { access: 'private' })
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    return { status: 'skipped', reason: '画像が見つかりません' }
  }
  const body = await new Response(blob.stream).blob()

  const store = await prisma.store.findUnique({ where: { storeCode: parsed.branch } })
  const label = store?.storeName ?? parsed.branch
  const description = `${label} ${parsed.date ?? ''} レシート`.trim()
  const filename = path.split('/').pop() || 'receipt.jpg'

  const receiptId = await uploadReceipt(cfg, body, filename, description)
  await prisma.freeeReceipt.create({ data: { path, receiptId, sentBy: by } })
  return { status: 'sent', receiptId }
}

// ---------------------------------------------------------------------------
// 自動送信(毎営業日 20 時)
// ---------------------------------------------------------------------------

const AUTO_ROW_ID = 1

export interface AutoSendSettings {
  enabled     : boolean
  sendSales   : boolean
  sendReceipts: boolean
  lastRunAt   : string | null
  lastResult  : string | null
}

export async function autoSendSettings(): Promise<AutoSendSettings> {
  const row = await prisma.freeeAutoSend.findUnique({ where: { id: AUTO_ROW_ID } })
  return {
    enabled     : row?.enabled ?? false,
    sendSales   : row?.sendSales ?? true,
    sendReceipts: row?.sendReceipts ?? true,
    lastRunAt   : row?.lastRunAt?.toISOString() ?? null,
    lastResult  : row?.lastResult ?? null,
  }
}

export async function saveAutoSendSettings(
  s: { enabled: boolean; sendSales: boolean; sendReceipts: boolean },
): Promise<void> {
  await prisma.freeeAutoSend.upsert({
    where : { id: AUTO_ROW_ID },
    update: s,
    create: { id: AUTO_ROW_ID, ...s },
  })
}

export interface RunResult {
  date     : string
  sales    : { sent: number; skipped: number; failed: number; detail: string[] }
  receipts : { sent: number; skipped: number; failed: number; detail: string[] }
}

// 指定日ぶんの売上とレシートをまとめて送る。
// 送信済み・科目未設定などは失敗にせず飛ばす(毎日動くので、翌日以降に
// 設定が整えばその日のぶんから再び送れる)。
export async function runAutoSend(
  cfg: FreeeConfig, date: string, by: string,
  opts: { sendSales: boolean; sendReceipts: boolean },
): Promise<RunResult> {
  const result: RunResult = {
    date,
    sales   : { sent: 0, skipped: 0, failed: 0, detail: [] },
    receipts: { sent: 0, skipped: 0, failed: 0, detail: [] },
  }

  // 片方が落ちてももう片方と実行記録は残す(cron は毎日動くので、
  // 原因を直せば翌日以降に再開できる。記録が無いと気付けない)
  if (opts.sendSales) try {
    const previews = await buildSalePreviews(date)
    for (const p of previews) {
      try {
        const r = await sendSale(cfg, date, p.storeCode, by)
        if (r.status === 'sent') {
          result.sales.sent++
          result.sales.detail.push(`${p.storeName}: 登録`)
        } else {
          result.sales.skipped++
          result.sales.detail.push(`${p.storeName}: ${r.reason}`)
        }
      } catch (e) {
        result.sales.failed++
        result.sales.detail.push(
          `${p.storeName}: 失敗 ${e instanceof Error ? e.message : ''}`)
      }
    }
  } catch (e) {
    result.sales.failed++
    result.sales.detail.push(`売上の処理に失敗 ${e instanceof Error ? e.message : ''}`)
  }

  if (opts.sendReceipts) try {
    // その日のレシートはパスの先頭が日付なので、店舗ごとに前方一致で引ける
    const stores = await prisma.store.findMany()
    for (const s of stores) {
      let cursor: string | undefined
      do {
        const page = await list({
          prefix: `${RECEIPT_PREFIX}${s.storeCode}/${date}-`, cursor, limit: 100,
        })
        for (const b of page.blobs) {
          try {
            const r = await sendReceipt(cfg, b.pathname, by)
            if (r.status === 'sent') {
              result.receipts.sent++
              result.receipts.detail.push(`${s.storeName}: 送信`)
            } else {
              result.receipts.skipped++
              result.receipts.detail.push(`${s.storeName}: ${r.reason}`)
            }
          } catch (e) {
            result.receipts.failed++
            result.receipts.detail.push(
              `${s.storeName}: 失敗 ${e instanceof Error ? e.message : ''}`)
          }
        }
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
    }
  } catch (e) {
    result.receipts.failed++
    result.receipts.detail.push(
      `レシートの処理に失敗 ${e instanceof Error ? e.message : ''}`)
  }

  const summary = `売上 送信${result.sales.sent}/スキップ${result.sales.skipped}`
    + `/失敗${result.sales.failed}、`
    + `レシート 送信${result.receipts.sent}/スキップ${result.receipts.skipped}`
    + `/失敗${result.receipts.failed}`
  await prisma.freeeAutoSend.upsert({
    where : { id: AUTO_ROW_ID },
    update: { lastRunAt: new Date(), lastResult: `${date} ${summary}` },
    create: {
      id: AUTO_ROW_ID, enabled: false,
      lastRunAt: new Date(), lastResult: `${date} ${summary}`,
    },
  })

  return result
}
