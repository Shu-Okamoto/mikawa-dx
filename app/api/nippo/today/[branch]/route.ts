import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const VALID_SLUGS = new Set(['nishi', 'minami'])

interface StoreRow {
  id        : number
  name      : string
  slug      : string
  open_time : string
  close_time: string
}

interface ReportRow {
  id            : number
  weather       : string | null
  sales_forecast: number | null
  sales_actual  : number | null
  customer_count: number | null
  sozai_zan     : number | null
  mochi_zan     : number | null
  report_text   : string | null
  kizuki        : string | null
  bikou         : string | null
  updated_at    : string | null
}

interface StaffRow {
  id        : number
  name      : string
  role      : string
  sort_order: number
}

interface ShiftRow {
  id               : number
  staff_id         : number | null
  staff_name_manual: string | null
  entry_type       : string
  pattern          : string | null
  start_time       : string | null
  end_time         : string | null
  break_minutes    : number
  break_start      : string | null
  break_end        : string | null
}

interface ShiftPayload {
  staffId         : number | null
  staffNameManual : string | null
  entryType       : 'plan' | 'actual'
  pattern         : string | null
  startTime       : string | null
  endTime         : string | null
  breakMinutes    : number
  breakStart      : string | null
  breakEnd        : string | null
}

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  return role === branch
}

function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ branch: string }> },
) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { branch } = await params
  if (!VALID_SLUGS.has(branch)) {
    return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
  }
  if (!canAccessBranch(user.role, branch)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const stores = await prisma.$queryRaw<StoreRow[]>`
      SELECT id, name, slug, open_time::text AS open_time, close_time::text AS close_time
      FROM nippo.stores
      WHERE slug = ${branch} AND is_active = true
      LIMIT 1
    `
    if (stores.length === 0) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }
    const store = stores[0]
    const today = todayDateStr()

    const [reports, staffList] = await Promise.all([
      prisma.$queryRaw<ReportRow[]>`
        SELECT id, weather, sales_forecast, sales_actual, customer_count,
               sozai_zan, mochi_zan, report_text, kizuki, bikou,
               updated_at::text AS updated_at
        FROM nippo.daily_reports
        WHERE store_id = ${store.id} AND report_date = ${today}::date
        LIMIT 1
      `,
      prisma.$queryRaw<StaffRow[]>`
        SELECT id, name, role, sort_order
        FROM nippo.staff
        WHERE store_id = ${store.id} AND is_active = true
        ORDER BY sort_order ASC, id ASC
      `,
    ])
    const report = reports[0] ?? null

    let shifts: ShiftRow[] = []
    if (report) {
      shifts = await prisma.$queryRaw<ShiftRow[]>`
        SELECT id, staff_id, staff_name_manual, entry_type, pattern,
               start_time::text AS start_time, end_time::text AS end_time,
               break_minutes,
               break_start::text AS break_start, break_end::text AS break_end
        FROM nippo.shift_entries
        WHERE daily_report_id = ${report.id}
        ORDER BY id ASC
      `
    }

    return NextResponse.json({ store, report, shifts, staffList, today })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ branch: string }> },
) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { branch } = await params
  if (!VALID_SLUGS.has(branch)) {
    return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
  }
  if (!canAccessBranch(user.role, branch)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const stores = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM nippo.stores WHERE slug = ${branch} AND is_active = true LIMIT 1
    `
    if (stores.length === 0) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }
    const storeId = stores[0].id
    const today   = todayDateStr()

    const weather       = body.weather ?? null
    const salesForecast = body.salesForecast ?? null
    const salesActual   = body.salesActual ?? null
    const customerCount = body.customerCount ?? null
    const sozaiZan      = body.sozaiZan ?? null
    const mochiZan      = body.mochiZan ?? null
    const reportText    = (body.reportText || '').trim() || null
    const kizuki        = (body.kizuki || '').trim() || null
    const bikou         = (body.bikou || '').trim() || null
    const shifts: ShiftPayload[] = Array.isArray(body.shifts) ? body.shifts : []

    // 日報をupsertしてidを取得
    const upserted = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
      INSERT INTO nippo.daily_reports
        (store_id, report_date, weather, sales_forecast, sales_actual,
         customer_count, sozai_zan, mochi_zan, report_text, kizuki, bikou)
      VALUES (${storeId}, ${today}::date, ${weather}, ${salesForecast}, ${salesActual},
              ${customerCount}, ${sozaiZan}, ${mochiZan}, ${reportText}, ${kizuki}, ${bikou})
      ON CONFLICT (store_id, report_date) DO UPDATE SET
        weather        = EXCLUDED.weather,
        sales_forecast = EXCLUDED.sales_forecast,
        sales_actual   = EXCLUDED.sales_actual,
        customer_count = EXCLUDED.customer_count,
        sozai_zan      = EXCLUDED.sozai_zan,
        mochi_zan      = EXCLUDED.mochi_zan,
        report_text    = EXCLUDED.report_text,
        kizuki         = EXCLUDED.kizuki,
        bikou          = EXCLUDED.bikou,
        updated_at     = now()
      RETURNING id
    `)
    const dailyReportId = upserted[0]?.id
    if (!dailyReportId) {
      return NextResponse.json({ error: '日報の保存に失敗' }, { status: 500 })
    }

    // シフトは全削除→再挿入（replace パターン）
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM nippo.shift_entries WHERE daily_report_id = ${dailyReportId}
    `)
    if (shifts.length > 0) {
      const values = Prisma.join(
        shifts.map((s) => Prisma.sql`(
          ${dailyReportId},
          ${s.staffId},
          ${s.staffNameManual},
          ${s.entryType},
          ${s.pattern},
          ${s.startTime}::time,
          ${s.endTime}::time,
          ${s.breakMinutes ?? 0},
          ${s.breakStart}::time,
          ${s.breakEnd}::time
        )`),
        ', ',
      )
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO nippo.shift_entries
          (daily_report_id, staff_id, staff_name_manual, entry_type, pattern,
           start_time, end_time, break_minutes, break_start, break_end)
        VALUES ${values}
      `)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
