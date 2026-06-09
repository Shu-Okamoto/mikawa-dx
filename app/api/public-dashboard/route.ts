import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 公開ダッシュボード用。認証なしで本日の売上等を返す。
// 時間数(total_hours)・人時売(ninjibai)は日報システムのダッシュボードと
// 同じ nippo.daily_kpi ビューから取得し、値を完全に一致させる。
export const dynamic = 'force-dynamic'

type Decimalish = { toNumber: () => number } | number | string | null

interface RawRow {
  slug          : string
  sales_actual  : Decimalish
  sales_forecast: Decimalish
  customer_count: number | string | null
  weather       : string | null
  total_hours   : Decimalish
  ninjibai      : Decimalish
  kyaku_tanka   : Decimalish
}

const STORE_ORDER = ['nishi', 'minami'] as const
const STORE_LABEL: Record<string, string> = { nishi: '西店', minami: '南店' }

function num(v: Decimalish): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null }
  return v.toNumber()
}

function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET() {
  try {
    const today = todayDateStr()
    // daily_kpi: 日報システムのダッシュボードと同一ソース(total_hours / ninjibai)。
    // sales 系は kpi が未生成でも表示できるよう daily_reports でフォールバック。
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT s.slug,
             COALESCE(k.sales_actual,   r.sales_actual)   AS sales_actual,
             COALESCE(k.sales_forecast, r.sales_forecast) AS sales_forecast,
             COALESCE(k.customer_count, r.customer_count) AS customer_count,
             r.weather,
             k.total_hours,
             k.ninjibai,
             k.kyaku_tanka
        FROM nippo.stores s
        LEFT JOIN nippo.daily_reports r
          ON r.store_id = s.id AND r.report_date = ${today}::date
        LEFT JOIN nippo.daily_kpi k
          ON k.store_id = s.id AND k.report_date = ${today}::date
       WHERE s.slug IN ('nishi', 'minami') AND s.is_active = true
    `
    const bySlug = new Map(rows.map((r) => [r.slug, r]))
    const stores = STORE_ORDER.map((slug) => {
      const r = bySlug.get(slug)
      return {
        slug,
        name         : STORE_LABEL[slug],
        salesActual  : r ? num(r.sales_actual)   : null,
        salesForecast: r ? num(r.sales_forecast) : null,
        customerCount: r ? num(r.customer_count) : null,
        weather      : r?.weather ?? null,
        laborHours   : r ? num(r.total_hours)    : null,  // 時間数 = daily_kpi.total_hours
        salesPerHour : r ? num(r.ninjibai)       : null,  // 人時売 = daily_kpi.ninjibai
        unitPrice    : r ? num(r.kyaku_tanka)    : null,  // 客単価 = daily_kpi.kyaku_tanka
      }
    })
    const totalActual    = stores.reduce((sum, s) => sum + (s.salesActual ?? 0), 0)
    const totalHours     = stores.reduce((sum, s) => sum + (s.laborHours ?? 0), 0)
    const totalCustomers = stores.reduce((sum, s) => sum + (s.customerCount ?? 0), 0)
    const totalSalesPerHour = totalHours > 0 ? totalActual / totalHours : null
    const totalUnitPrice    = totalCustomers > 0 ? totalActual / totalCustomers : null

    return NextResponse.json({
      today, stores, totalActual, totalHours, totalSalesPerHour, totalUnitPrice,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
