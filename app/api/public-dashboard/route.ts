import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 公開ダッシュボード用。認証なしで本日の売上等を返す。
// 時間数(total_hours)・人時売(ninjibai)・客単価(kyaku_tanka)は日報システムの
// ダッシュボードと同じ nippo.daily_kpi ビューから取得し値を一致させる。
// 前年売上は売上分析と同じく「前年の同日から最も近い同曜日の日」を dx.Sale から取得。
export const dynamic = 'force-dynamic'

type Decimalish = { toNumber: () => number } | number | string | null

interface RawRow {
  slug          : string
  sales_actual  : Decimalish
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

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 前年の同日から最も近い「同じ曜日」の日 (売上分析の前年比と同一ロジック)
function prevYearSameDow(ref: Date): Date {
  const base = new Date(ref.getFullYear() - 1, ref.getMonth(), ref.getDate())
  let diff = (ref.getDay() - base.getDay() + 7) % 7
  if (diff > 3) diff -= 7
  base.setDate(base.getDate() + diff)
  return base
}

export async function GET() {
  try {
    const now       = new Date()
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const today     = ymd(todayDate)

    // 前年売上の対象日 (同曜日の最寄り) の範囲
    const prevDate  = prevYearSameDow(todayDate)
    const prevStart = prevDate
    const prevEnd   = new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate() + 1)

    const [rows, prevSales] = await Promise.all([
      // 日報 KPI (本日)
      prisma.$queryRaw<RawRow[]>`
        SELECT s.slug,
               -- 本日売上・客数は手入力の日報値を優先(KPIが0/未生成でも正しく表示)
               COALESCE(r.sales_actual,   k.sales_actual)   AS sales_actual,
               COALESCE(r.customer_count, k.customer_count) AS customer_count,
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
      `,
      // 前年売上 (dx.Sale, 同曜日の最寄り日)
      prisma.sale.findMany({
        where  : { saleDate: { gte: prevStart, lt: prevEnd } },
        include: { store: true },
      }),
    ])

    // 前年売上を storeCode(=slug) 別に集計
    const prevByCode = new Map<string, number>()
    for (const s of prevSales) {
      const code = s.store.storeCode
      const amt  = num(s.amount as unknown as Decimalish) ?? 0
      prevByCode.set(code, (prevByCode.get(code) ?? 0) + amt)
    }

    const bySlug = new Map(rows.map((r) => [r.slug, r]))
    const stores = STORE_ORDER.map((slug) => {
      const r = bySlug.get(slug)
      const salesActual   = r ? num(r.sales_actual)   : null
      const customerCount = r ? num(r.customer_count) : null
      const laborHours    = r ? num(r.total_hours)    : null  // 時間数 = daily_kpi.total_hours
      const kpiNinjibai   = r ? num(r.ninjibai)       : null
      const kpiTanka      = r ? num(r.kyaku_tanka)    : null
      // 人時売/客単価: KPI が有効ならそれを使い、0/未生成なら売上から再計算
      const salesPerHour = kpiNinjibai && kpiNinjibai > 0
        ? kpiNinjibai
        : (laborHours && laborHours > 0 && salesActual != null ? salesActual / laborHours : null)
      const unitPrice = kpiTanka && kpiTanka > 0
        ? kpiTanka
        : (customerCount && customerCount > 0 && salesActual != null ? salesActual / customerCount : null)
      return {
        slug,
        name         : STORE_LABEL[slug],
        salesActual,
        customerCount,
        weather      : r?.weather ?? null,
        laborHours,
        salesPerHour,
        unitPrice,
        prevYearSales: prevByCode.has(slug) ? (prevByCode.get(slug) as number) : null, // 前年売上
      }
    })
    const totalActual    = stores.reduce((sum, s) => sum + (s.salesActual ?? 0), 0)
    const totalHours     = stores.reduce((sum, s) => sum + (s.laborHours ?? 0), 0)
    const totalCustomers = stores.reduce((sum, s) => sum + (s.customerCount ?? 0), 0)
    const totalPrevYear  = stores.reduce((sum, s) => sum + (s.prevYearSales ?? 0), 0)
    const totalSalesPerHour = totalHours > 0 ? totalActual / totalHours : null
    const totalUnitPrice    = totalCustomers > 0 ? totalActual / totalCustomers : null

    return NextResponse.json({
      today, stores, totalActual, totalHours, totalSalesPerHour, totalUnitPrice, totalPrevYear,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
