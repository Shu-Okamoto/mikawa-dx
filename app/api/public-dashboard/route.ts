import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 公開ダッシュボード用。認証なしで本日の売上(日報の sales_actual)を返す。
export const dynamic = 'force-dynamic'

type Decimalish = { toNumber: () => number } | number | string | null

interface RawRow {
  slug          : string
  name          : string
  sales_actual  : Decimalish
  sales_forecast: Decimalish
  customer_count: number | string | null
  weather       : string | null
  total_hours   : Decimalish
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
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT s.slug, s.name,
             r.sales_actual, r.sales_forecast, r.customer_count, r.weather,
             COALESCE(h.total_hours, 0) AS total_hours
        FROM nippo.stores s
        LEFT JOIN nippo.daily_reports r
          ON r.store_id = s.id AND r.report_date = ${today}::date
        LEFT JOIN (
          -- 当日の実績シフトから店舗の総労働時間 (休憩控除後) を集計
          SELECT se.daily_report_id,
                 SUM(
                   EXTRACT(EPOCH FROM (se.end_time - se.start_time)) / 3600.0
                   - COALESCE(se.break_minutes, 0) / 60.0
                 ) AS total_hours
            FROM nippo.shift_entries se
           WHERE se.entry_type = 'actual'
             AND se.start_time IS NOT NULL
             AND se.end_time   IS NOT NULL
           GROUP BY se.daily_report_id
        ) h ON h.daily_report_id = r.id
       WHERE s.slug IN ('nishi', 'minami') AND s.is_active = true
    `
    const bySlug = new Map(rows.map((r) => [r.slug, r]))
    const stores = STORE_ORDER.map((slug) => {
      const r = bySlug.get(slug)
      const salesActual = r ? num(r.sales_actual) : null
      const laborHours  = r ? num(r.total_hours)  : null
      // 人時売 = 売上 ÷ 労働時間
      const salesPerHour = laborHours && laborHours > 0 && salesActual != null
        ? salesActual / laborHours
        : null
      return {
        slug,
        name         : STORE_LABEL[slug],
        salesActual,
        salesForecast: r ? num(r.sales_forecast) : null,
        customerCount: r ? num(r.customer_count) : null,
        weather      : r?.weather ?? null,
        laborHours,
        salesPerHour,
      }
    })
    const totalActual = stores.reduce((sum, s) => sum + (s.salesActual ?? 0), 0)
    const totalHours  = stores.reduce((sum, s) => sum + (s.laborHours ?? 0), 0)
    const totalSalesPerHour = totalHours > 0 ? totalActual / totalHours : null

    return NextResponse.json({ today, stores, totalActual, totalHours, totalSalesPerHour })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
