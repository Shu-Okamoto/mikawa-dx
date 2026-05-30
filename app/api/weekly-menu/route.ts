import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const ALLOWED_CATEGORIES = ['デラックスメイン', 'メイン肉', '魚', '天ぷら']

// 月曜始まりで今週の月曜の日付を返す(JST)
function thisMondayJst(): Date {
  const now    = new Date()
  const offset = 9 * 60 // JST = UTC+9
  const local  = new Date(now.getTime() + (offset - now.getTimezoneOffset()) * 60 * 1000)
  const day    = local.getUTCDay()           // 日=0, 月=1, ... 土=6
  const diff   = day === 0 ? 6 : day - 1     // 月曜までの戻り日数
  const mon    = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(),
                                   local.getUTCDate() - diff))
  return mon
}

interface MenuRow {
  day_of_week: number
  category   : string
  menu_name  : string | null
}

// 認証不要。soozai-system 由来の今週の献立(惣菜カテゴリ抜粋)を返す
// 読み取り専用エンドポイント。
export async function GET(req: NextRequest) {
  const weekStartParam = req.nextUrl.searchParams.get('weekStart')
  const weekStart      = weekStartParam ? new Date(weekStartParam) : thisMondayJst()
  if (isNaN(weekStart.getTime())) {
    return NextResponse.json({ error: 'weekStart が不正です' }, { status: 400 })
  }

  const weekStartIso = weekStart.toISOString().slice(0, 10)

  try {
    // soozai-system が管理する public.hq_weekly_menus を参照のみで読む。
    // 当該テーブルのマイグレーション管理は mikawa-dx 側では行わない。
    const rows = await prisma.$queryRawUnsafe<MenuRow[]>(
      `SELECT day_of_week, category, menu_name
       FROM public.hq_weekly_menus
       WHERE week_start = $1::date
         AND category = ANY($2::text[])
       ORDER BY day_of_week, category`,
      weekStartIso,
      ALLOWED_CATEGORIES,
    )

    return NextResponse.json({
      weekStart : weekStartIso,
      categories: ALLOWED_CATEGORIES,
      rows,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[weekly-menu]', message)
    return NextResponse.json(
      { error: '週間献立表を取得できませんでした', detail: message, weekStart: weekStartIso },
      { status: 500 }
    )
  }
}
