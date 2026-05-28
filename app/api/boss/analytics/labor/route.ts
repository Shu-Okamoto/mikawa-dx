import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

interface Row {
  staff_id     : number | null
  staff_name   : string
  store_id     : number
  store_name   : string
  month        : string  // 'YYYY-MM'
  member_hours : number
  store_hours  : number
  sales_actual : number
}

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  if (user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get('year')
    const year = yearParam && /^\d{4}$/.test(yearParam)
      ? Number(yearParam)
      : new Date().getFullYear()

    const start = `${year}-01-01`
    const end   = `${year}-12-31`

    // 月別×メンバー×店舗の実績シフト集計
    const rows = await prisma.$queryRaw<Row[]>`
      WITH actual_shifts AS (
        SELECT
          se.staff_id,
          se.staff_name_manual,
          dr.store_id,
          dr.report_date,
          dr.sales_actual,
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (se.end_time - se.start_time)) / 3600.0
              - COALESCE(se.break_minutes, 0) / 60.0
          ) AS hours
        FROM nippo.shift_entries se
        JOIN nippo.daily_reports dr ON dr.id = se.daily_report_id
        WHERE se.entry_type = 'actual'
          AND se.start_time IS NOT NULL
          AND se.end_time   IS NOT NULL
          AND dr.report_date BETWEEN ${start}::date AND ${end}::date
      ),
      store_day_hours AS (
        SELECT store_id, report_date, SUM(hours) AS total_hours
        FROM actual_shifts
        GROUP BY store_id, report_date
      ),
      member_day AS (
        SELECT
          a.staff_id,
          a.staff_name_manual,
          a.store_id,
          a.report_date,
          a.sales_actual,
          SUM(a.hours) AS member_hours,
          sdh.total_hours
        FROM actual_shifts a
        JOIN store_day_hours sdh
          ON sdh.store_id = a.store_id AND sdh.report_date = a.report_date
        GROUP BY a.staff_id, a.staff_name_manual, a.store_id, a.report_date,
                 a.sales_actual, sdh.total_hours
      )
      SELECT
        md.staff_id,
        COALESCE(s.name, md.staff_name_manual, '名前未設定') AS staff_name,
        md.store_id,
        st.name AS store_name,
        to_char(md.report_date, 'YYYY-MM') AS month,
        SUM(md.member_hours)::float AS member_hours,
        SUM(md.total_hours)::float  AS store_hours,
        SUM(
          CASE
            WHEN md.total_hours > 0 AND md.sales_actual IS NOT NULL
            THEN md.sales_actual * (md.member_hours / md.total_hours)
            ELSE 0
          END
        )::float AS sales_actual
      FROM member_day md
      LEFT JOIN nippo.staff  s  ON s.id  = md.staff_id
      LEFT JOIN nippo.stores st ON st.id = md.store_id
      GROUP BY md.staff_id, s.name, md.staff_name_manual, md.store_id, st.name,
               to_char(md.report_date, 'YYYY-MM')
      ORDER BY st.name, staff_name, month
    `

    type MemberAgg = {
      staffId   : number | null
      staffName : string
      storeId   : number
      storeName : string
      perMonth  : Record<string, { hours: number; attributedSales: number }>
      total     : { hours: number; attributedSales: number }
    }

    // 集計
    const map = new Map<string, MemberAgg>()
    for (const r of rows) {
      const key = `${r.store_id}:${r.staff_id ?? 'manual:' + r.staff_name}`
      let agg = map.get(key)
      if (!agg) {
        agg = {
          staffId  : r.staff_id,
          staffName: r.staff_name,
          storeId  : r.store_id,
          storeName: r.store_name,
          perMonth : {},
          total    : { hours: 0, attributedSales: 0 },
        }
        map.set(key, agg)
      }
      const hours = Number(r.member_hours) || 0
      const att   = Number(r.sales_actual)  || 0
      agg.perMonth[r.month] = {
        hours          : (agg.perMonth[r.month]?.hours ?? 0) + hours,
        attributedSales: (agg.perMonth[r.month]?.attributedSales ?? 0) + att,
      }
      agg.total.hours           += hours
      agg.total.attributedSales += att
    }

    const result = Array.from(map.values()).map((a) => {
      const monthly: Record<string, number | null> = {}
      for (const m of Object.keys(a.perMonth)) {
        const v = a.perMonth[m]
        monthly[m] = v.hours > 0 ? v.attributedSales / v.hours : null
      }
      return {
        staffId   : a.staffId,
        staffName : a.staffName,
        storeId   : a.storeId,
        storeName : a.storeName,
        monthly,
        monthlyHours: Object.fromEntries(
          Object.entries(a.perMonth).map(([m, v]) => [m, v.hours]),
        ),
        yearAvg   : a.total.hours > 0
          ? a.total.attributedSales / a.total.hours
          : null,
        yearHours : a.total.hours,
      }
    })

    return NextResponse.json({ year, members: result })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
