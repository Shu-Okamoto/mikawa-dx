import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 公開ダッシュボード用。認証なしで本日の売上等を返す。
// - 本日売上/客数/天気: mikawa-dx の dx.Sale(本日・店舗別, 店舗ページで入力)を主に、
//   無ければ日報 nippo(daily_reports → daily_kpi)へフォールバック。
// - 時間数: nippo.daily_kpi.total_hours(シフト由来)。
// - 人時売/客単価: 上記の売上から再計算(売上÷時間数, 売上÷客数)。
// - 前年売上: 売上分析と同じ「前年の同日から最も近い同曜日の日」を dx.Sale から。
export const dynamic = 'force-dynamic'

type Decimalish = { toNumber: () => number } | number | string | null

interface NippoRow {
  slug          : string
  r_sales       : Decimalish      // daily_reports.sales_actual
  r_cust        : number | string | null
  r_weather     : string | null
  k_sales       : Decimalish      // daily_kpi.sales_actual
  total_hours   : Decimalish      // daily_kpi.total_hours
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

export async function GET(req: NextRequest) {
  try {
    const debug     = new URL(req.url).searchParams.get('debug') === '1'
    const now       = new Date()
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const today     = ymd(todayDate)

    const todayStart = todayDate
    const todayEnd   = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1)

    const prevDate  = prevYearSameDow(todayDate)
    const prevStart = prevDate
    const prevEnd   = new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate() + 1)

    const [nippoRows, todaySales, prevSales] = await Promise.all([
      // 日報側: 時間数(KPI) + 売上/客数/天気のフォールバック
      prisma.$queryRaw<NippoRow[]>`
        SELECT s.slug,
               r.sales_actual   AS r_sales,
               r.customer_count AS r_cust,
               r.weather        AS r_weather,
               k.sales_actual   AS k_sales,
               k.total_hours    AS total_hours
          FROM nippo.stores s
          LEFT JOIN nippo.daily_reports r
            ON r.store_id = s.id AND r.report_date = ${today}::date
          LEFT JOIN nippo.daily_kpi k
            ON k.store_id = s.id AND k.report_date = ${today}::date
         WHERE s.slug IN ('nishi', 'minami') AND s.is_active = true
      `,
      // 本日売上(主ソース): dx.Sale(店舗ページ入力)
      prisma.sale.findMany({
        where  : { saleDate: { gte: todayStart, lt: todayEnd } },
        include: { store: true },
      }),
      // 前年売上: dx.Sale(同曜日の最寄り日)
      prisma.sale.findMany({
        where  : { saleDate: { gte: prevStart, lt: prevEnd } },
        include: { store: true },
      }),
    ])

    const nippoBySlug = new Map(nippoRows.map((r) => [r.slug, r]))

    // dx.Sale 本日(店舗コード別)
    const dxToday = new Map<string, { amount: number; customerCount: number; weather: string | null }>()
    for (const s of todaySales) {
      dxToday.set(s.store.storeCode, {
        amount       : num(s.amount as unknown as Decimalish) ?? 0,
        customerCount: s.customerCount ?? 0,
        weather      : s.weather ?? null,
      })
    }

    // 前年売上(店舗コード別合計)
    const prevByCode = new Map<string, number>()
    for (const s of prevSales) {
      const code = s.store.storeCode
      prevByCode.set(code, (prevByCode.get(code) ?? 0) + (num(s.amount as unknown as Decimalish) ?? 0))
    }

    const stores = STORE_ORDER.map((slug) => {
      const dx = dxToday.get(slug)
      const r  = nippoBySlug.get(slug)

      // 本日売上: dx.Sale を優先、無ければ日報(daily_reports → daily_kpi)
      const dxAmount   = dx && dx.amount > 0 ? dx.amount : null
      const nippoSales = r ? (num(r.r_sales) ?? num(r.k_sales)) : null
      const salesActual = dxAmount ?? (nippoSales && nippoSales > 0 ? nippoSales : null)

      // 客数: dx を優先、無ければ日報
      const dxCust   = dx && dx.customerCount > 0 ? dx.customerCount : null
      const nippoCust = r ? num(r.r_cust) : null
      const customerCount = dxCust ?? (nippoCust && nippoCust > 0 ? nippoCust : null)

      const weather = (dx?.weather ?? null) || (r?.r_weather ?? null)

      // 時間数: 日報(シフト由来)
      const laborHours = r ? num(r.total_hours) : null

      // 人時売 / 客単価: 上記売上から再計算
      const salesPerHour = laborHours && laborHours > 0 && salesActual != null
        ? salesActual / laborHours : null
      const unitPrice = customerCount && customerCount > 0 && salesActual != null
        ? salesActual / customerCount : null

      const base = {
        slug,
        name: STORE_LABEL[slug],
        salesActual, customerCount, weather, laborHours, salesPerHour, unitPrice,
        prevYearSales: prevByCode.has(slug) ? (prevByCode.get(slug) as number) : null,
      }
      if (!debug) return base
      return {
        ...base,
        _debug: {
          dxAmount   : dx?.amount ?? null,
          r_sales    : r ? num(r.r_sales) : null,
          k_sales    : r ? num(r.k_sales) : null,
          total_hours: r ? num(r.total_hours) : null,
          dxCustomer : dx?.customerCount ?? null,
          nippoRowFound: !!r,
        },
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
