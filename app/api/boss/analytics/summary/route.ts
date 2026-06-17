import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

interface SaleRow {
  saleDate     : Date
  amount       : { toNumber: () => number } | number
  souzaiAmount : { toNumber: () => number } | number
  mochiAmount  : { toNumber: () => number } | number
  hanaAmount   : { toNumber: () => number } | number
  customerCount: number
  weather      : string | null
  store        : { storeName: string }
}

// 日付ごと・店舗ごとの惣菜出荷額。public.hq_daily_reports の west_sales / south_sales 由来。
// キー: ymd(date)、値: 店舗名 → 出荷額 (0 = データなし)
type ShipmentMap = Map<string, Record<string, number>>

const WEATHER_KEYS = ['晴', '曇', '雨', '雪'] as const
type WeatherKey = typeof WEATHER_KEYS[number] | '未記録'

interface Bucket {
  amount        : number
  souzai        : number
  shipmentSouzai: number
  mochi         : number
  hana          : number
  customerCount : number
  days          : number
}

type Granularity = 'year' | 'month' | 'day'
const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function toNum(v: { toNumber: () => number } | number): number {
  return typeof v === 'number' ? v : v.toNumber()
}

function newBucket(): Bucket {
  return { amount: 0, souzai: 0, shipmentSouzai: 0, mochi: 0, hana: 0, customerCount: 0, days: 0 }
}

function addRow(b: Bucket, s: SaleRow, shipment: number) {
  b.amount         += toNum(s.amount)
  b.souzai         += toNum(s.souzaiAmount)
  b.shipmentSouzai += shipment
  b.mochi          += toNum(s.mochiAmount)
  b.hana           += toNum(s.hanaAmount)
  b.customerCount  += s.customerCount
  b.days           += 1
}

function shipmentFor(s: SaleRow, m: ShipmentMap): number {
  const e = m.get(ymd(new Date(s.saleDate)))
  return e?.[s.store.storeName] ?? 0
}

async function fetchShipments(start: Date, endExclusive: Date): Promise<ShipmentMap> {
  type Raw = {
    date       : Date | string
    west_sales : { toNumber: () => number } | number | string | null
    south_sales: { toNumber: () => number } | number | string | null
  }
  // hq_daily_reports.date は TEXT で書式が揺れる(ゼロ埋め無し '2026-6-15'、
  // スラッシュ '2026/06/15'、時刻付き '2026-06-15 00:00:00' 等)ことがある。
  // スラッシュを '-' に正規化し、正規表現で日付部分(YYYY-M-D)だけ抽出してから
  // hq_daily_reports は (日付 × department_id) の行構成。惣菜出荷は
  // department_id = 1 (寿司・弁当・惣菜の部門) の west_sales/south_sales を使う。
  // ※同日には他部門(餅菓子=2 等)や 0 の空行もあり、更新時刻の「最新」は
  //   別部門の 0 行になり得るため、部門で絞るのが正しい。
  // date は TEXT で書式が揺れる(スラッシュ/時刻付き/ゼロ埋め無し)ため正規化する。
  const rows = await prisma.$queryRaw<Raw[]>`
    SELECT to_char(d::date, 'YYYY-MM-DD') AS date, west_sales, south_sales
      FROM (
        SELECT substring(trim(replace(date, '/', '-')) from '[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}') AS d,
               west_sales, south_sales, department_id
          FROM public.hq_daily_reports
      ) t
     WHERE d IS NOT NULL
       AND department_id = 1
       AND d::date >= ${ymd(start)}::date
       AND d::date <  ${ymd(endExclusive)}::date
  `
  const toN = (v: Raw['west_sales']): number => {
    if (v == null) return 0
    if (typeof v === 'number') return v
    if (typeof v === 'string') return Number(v) || 0
    return v.toNumber()
  }
  const m: ShipmentMap = new Map()
  // hq_daily_reports は同じ日付に複数行が存在し得る(重複/修正入力。0 の空行も混在)。
  // 0 行は無視し、west+south が最大の「非0行」を採用する(= その日の正しい出荷)。
  const bestTotal = new Map<string, number>()
  rows.forEach((r) => {
    const key   = typeof r.date === 'string' ? r.date.slice(0, 10) : ymd(new Date(r.date))
    const west  = toN(r.west_sales)
    const south = toN(r.south_sales)
    const total = west + south
    if (total <= 0) return
    if (total > (bestTotal.get(key) ?? -1)) {
      bestTotal.set(key, total)
      m.set(key, { '西店': west, '南店': south })
    }
  })
  return m
}

function parseRefDate(s: string | null): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function rangeFor(granularity: Granularity, ref: Date): {
  start: Date; endExclusive: Date; endInclusive: Date; label: string
} {
  if (granularity === 'year') {
    const start = new Date(ref.getFullYear(), 0, 1)
    const end   = new Date(ref.getFullYear() + 1, 0, 1)
    return { start, endExclusive: end, endInclusive: new Date(end.getTime() - 86400000),
      label: `${ref.getFullYear()}年` }
  }
  if (granularity === 'month') {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const end   = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
    return { start, endExclusive: end, endInclusive: new Date(end.getTime() - 86400000),
      label: `${ref.getFullYear()}年${ref.getMonth() + 1}月` }
  }
  // day
  const start = new Date(ref)
  const end   = new Date(ref.getTime() + 86400000)
  return {
    start, endExclusive: end, endInclusive: new Date(ref),
    label: `${ref.getFullYear()}/${ref.getMonth() + 1}/${ref.getDate()}(${DOW_LABELS[ref.getDay()]})`,
  }
}

function aggregateByStore(sales: SaleRow[], ship: ShipmentMap): Record<string, Bucket> {
  const out: Record<string, Bucket> = {}
  sales.forEach((s) => {
    const name = s.store.storeName
    if (!out[name]) out[name] = newBucket()
    addRow(out[name], s, 0)
  })
  // 惣菜出荷は売上(dx.Sale)の有無に依らず hq_daily_reports から店舗別に合計
  ship.forEach((e) => {
    for (const name of Object.keys(e)) {
      const v = e[name] || 0
      if (v <= 0) continue
      if (!out[name]) out[name] = newBucket()
      out[name].shipmentSouzai += v
    }
  })
  return out
}

// 日別 (月粒度用)
interface DailyEntry {
  date    : string                       // 'YYYY-MM-DD'
  dow     : number                       // 0=日,6=土
  weather : string | null                // 同日の最初の非空 weather (店舗共通想定)
  byStore : Record<string, Bucket>
}
function aggregateDaily(sales: SaleRow[], start: Date, endInclusive: Date, ship: ShipmentMap): DailyEntry[] {
  const byDate = new Map<string, DailyEntry>()
  const cur = new Date(start)
  while (cur <= endInclusive) {
    byDate.set(ymd(cur), { date: ymd(cur), dow: cur.getDay(), weather: null, byStore: {} })
    cur.setDate(cur.getDate() + 1)
  }
  sales.forEach((s) => {
    const key = ymd(new Date(s.saleDate))
    const entry = byDate.get(key)
    if (!entry) return
    const name = s.store.storeName
    if (!entry.byStore[name]) entry.byStore[name] = newBucket()
    addRow(entry.byStore[name], s, 0)
    if (!entry.weather && s.weather) entry.weather = s.weather
  })
  // 惣菜出荷は売上(dx.Sale)の有無に依らず、日付×店舗で hq_daily_reports から直接セット
  byDate.forEach((entry) => {
    const e = ship.get(entry.date)
    if (!e) return
    for (const name of Object.keys(e)) {
      const v = e[name] || 0
      if (v <= 0) continue
      if (!entry.byStore[name]) entry.byStore[name] = newBucket()
      entry.byStore[name].shipmentSouzai = v   // 日×店で 1 値
    }
  })
  return Array.from(byDate.values())
}

// 月別 (年粒度用)
interface MonthlyEntry {
  month   : number                       // 1〜12
  byStore : Record<string, Bucket>
}
function aggregateMonthly(sales: SaleRow[], ship: ShipmentMap): MonthlyEntry[] {
  const arr: MonthlyEntry[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, byStore: {},
  }))
  sales.forEach((s) => {
    const m  = new Date(s.saleDate).getMonth() // 0..11
    const e  = arr[m]
    const name = s.store.storeName
    if (!e.byStore[name]) e.byStore[name] = newBucket()
    addRow(e.byStore[name], s, 0)
  })
  // 惣菜出荷は売上の有無に依らず、月×店舗で hq_daily_reports から合計
  ship.forEach((e, dateKey) => {
    const month = Number(dateKey.slice(5, 7)) - 1 // 'YYYY-MM-DD' → 0..11
    if (month < 0 || month > 11) return
    const me = arr[month]
    for (const name of Object.keys(e)) {
      const v = e[name] || 0
      if (v <= 0) continue
      if (!me.byStore[name]) me.byStore[name] = newBucket()
      me.byStore[name].shipmentSouzai += v
    }
  })
  return arr
}

// 曜日別 1日平均 (月/年粒度用)
interface DowEntry {
  dow         : number
  label       : string
  days        : number
  totalAmount : number
  avgAmount   : number
  avgSouzai   : number
  avgMochi    : number
  avgHana     : number
  avgCustomer : number
}
function aggregateDow(sales: SaleRow[], ship: ShipmentMap): Record<string, DowEntry[]> {
  const accum: Record<string, Bucket[]> = {}
  sales.forEach((s) => {
    const name = s.store.storeName
    const dow  = new Date(s.saleDate).getDay()
    if (!accum[name]) accum[name] = Array.from({ length: 7 }, newBucket)
    const b   = accum[name][dow]
    const amt = toNum(s.amount)
    b.amount         += amt
    b.souzai         += toNum(s.souzaiAmount)
    b.shipmentSouzai += shipmentFor(s, ship)
    b.mochi          += toNum(s.mochiAmount)
    b.hana           += toNum(s.hanaAmount)
    b.customerCount  += s.customerCount
    // 曜日別の日数は売上 > 0 の日だけ加算する
    if (amt > 0) b.days += 1
  })
  const out: Record<string, DowEntry[]> = {}
  Object.entries(accum).forEach(([name, buckets]) => {
    out[name] = buckets.map((b, i) => ({
      dow         : i,
      label       : DOW_LABELS[i],
      days        : b.days,
      totalAmount : b.amount,
      avgAmount   : b.days > 0 ? Math.round(b.amount / b.days) : 0,
      avgSouzai   : b.days > 0 ? Math.round(b.souzai / b.days) : 0,
      avgMochi    : b.days > 0 ? Math.round(b.mochi  / b.days) : 0,
      avgHana     : b.days > 0 ? Math.round(b.hana   / b.days) : 0,
      avgCustomer : b.days > 0 ? Math.round(b.customerCount / b.days) : 0,
    }))
  })
  return out
}

// 天気別 1日平均 (月/年粒度用)
interface WeatherEntry {
  weather     : WeatherKey
  days        : number
  totalAmount : number
  avgAmount   : number
  avgSouzai   : number
  avgMochi    : number
  avgHana     : number
  avgCustomer : number
}
function aggregateWeather(sales: SaleRow[], ship: ShipmentMap): Record<string, WeatherEntry[]> {
  const accum: Record<string, Record<WeatherKey, Bucket>> = {}
  const allKeys: WeatherKey[] = [...WEATHER_KEYS, '未記録']
  const newEmpty = (): Record<WeatherKey, Bucket> => {
    const m = {} as Record<WeatherKey, Bucket>
    allKeys.forEach((k) => { m[k] = newBucket() })
    return m
  }
  sales.forEach((s) => {
    const name = s.store.storeName
    const w    = s.weather && (WEATHER_KEYS as readonly string[]).includes(s.weather)
      ? (s.weather as WeatherKey)
      : '未記録'
    if (!accum[name]) accum[name] = newEmpty()
    addRow(accum[name][w], s, shipmentFor(s, ship))
  })
  const out: Record<string, WeatherEntry[]> = {}
  Object.entries(accum).forEach(([name, byWeather]) => {
    out[name] = allKeys.map((w) => {
      const b = byWeather[w]
      return {
        weather    : w,
        days       : b.days,
        totalAmount: b.amount,
        avgAmount  : b.days > 0 ? Math.round(b.amount / b.days)        : 0,
        avgSouzai  : b.days > 0 ? Math.round(b.souzai / b.days)        : 0,
        avgMochi   : b.days > 0 ? Math.round(b.mochi  / b.days)        : 0,
        avgHana    : b.days > 0 ? Math.round(b.hana   / b.days)        : 0,
        avgCustomer: b.days > 0 ? Math.round(b.customerCount / b.days) : 0,
      }
    })
  })
  return out
}

// 前年同期間の Date を計算
function prevYearRef(ref: Date): Date {
  return new Date(ref.getFullYear() - 1, ref.getMonth(), ref.getDate())
}

// 前年の同日から最も近い「同じ曜日」の日を返す。
// 例: 当日が日曜なら、前年同日付の前後 3 日以内にある日曜を選ぶ。
function prevYearSameDow(ref: Date): Date {
  const base = new Date(ref.getFullYear() - 1, ref.getMonth(), ref.getDate())
  let diff = (ref.getDay() - base.getDay() + 7) % 7  // 0..6 (前方向の距離)
  if (diff > 3) diff -= 7                              // -3..3 の最短側に寄せる
  base.setDate(base.getDate() + diff)
  return base
}

// 'YYYY-MM-DD' をローカル Date に
function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 日付キー -> 店舗別 Bucket / 天気 のマップ (前年の同曜日突き合わせ用)
function aggregateDailyMap(
  sales: SaleRow[], ship: ShipmentMap,
): Map<string, { byStore: Record<string, Bucket>; weather: string | null }> {
  const map = new Map<string, { byStore: Record<string, Bucket>; weather: string | null }>()
  sales.forEach((s) => {
    const key = ymd(new Date(s.saleDate))
    let e = map.get(key)
    if (!e) { e = { byStore: {}, weather: null }; map.set(key, e) }
    const name = s.store.storeName
    if (!e.byStore[name]) e.byStore[name] = newBucket()
    addRow(e.byStore[name], s, shipmentFor(s, ship))
    if (!e.weather && s.weather) e.weather = s.weather
  })
  return map
}

// from の店舗別 Bucket を into にマージ
function mergeByStore(into: Record<string, Bucket>, from: Record<string, Bucket>) {
  Object.entries(from).forEach(([name, b]) => {
    if (!into[name]) into[name] = newBucket()
    const t = into[name]
    t.amount         += b.amount
    t.souzai         += b.souzai
    t.shipmentSouzai += b.shipmentSouzai
    t.mochi          += b.mochi
    t.hana           += b.hana
    t.customerCount  += b.customerCount
    t.days           += b.days
  })
}

// 過去 n 年分の ref Date を古い順で返す (現在は含まない: 1年前/2年前/...)
function pastYearRefs(ref: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) =>
    // n=3 → i=0→-3, i=1→-2, i=2→-1 で古い順
    new Date(ref.getFullYear() - (n - i), ref.getMonth(), ref.getDate()),
  )
}

// 店舗別合計 + 営業日数 (売上 > 0 の日数) + カテゴリ別売上
interface PastYearStoreEntry {
  amount       : number
  souzai       : number
  mochi        : number
  customerCount: number
  businessDays : number
}
interface PastYearEntry {
  year     : number
  label    : string
  byStore  : Record<string, PastYearStoreEntry>
  total    : PastYearStoreEntry
}
function aggregatePastYear(
  sales: SaleRow[], year: number, label: string,
): PastYearEntry {
  const byStore: Record<string, PastYearStoreEntry> = {}
  const totalDays = new Set<string>()
  const storeDays: Record<string, Set<string>> = {}
  let totalAmount = 0
  let totalSouzai = 0
  let totalMochi  = 0
  let totalCust   = 0
  sales.forEach((s) => {
    const name = s.store.storeName
    if (!byStore[name]) byStore[name] = {
      amount: 0, souzai: 0, mochi: 0, customerCount: 0, businessDays: 0,
    }
    if (!storeDays[name]) storeDays[name] = new Set()
    const amt    = toNum(s.amount)
    const souzai = toNum(s.souzaiAmount)
    const mochi  = toNum(s.mochiAmount)
    const cust   = s.customerCount
    byStore[name].amount        += amt
    byStore[name].souzai        += souzai
    byStore[name].mochi         += mochi
    byStore[name].customerCount += cust
    totalAmount += amt
    totalSouzai += souzai
    totalMochi  += mochi
    totalCust   += cust
    // 営業日 = 売上 > 0 の日のみ
    if (amt > 0) {
      const key = ymd(new Date(s.saleDate))
      storeDays[name].add(key)
      totalDays.add(key)
    }
  })
  Object.entries(storeDays).forEach(([name, days]) => {
    byStore[name].businessDays = days.size
  })
  return {
    year, label, byStore,
    total: {
      amount: totalAmount, souzai: totalSouzai, mochi: totalMochi,
      customerCount: totalCust, businessDays: totalDays.size,
    },
  }
}

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const g  = (searchParams.get('granularity') ?? 'month') as Granularity
    if (!['year', 'month', 'day'].includes(g)) {
      return NextResponse.json({ error: '不正な粒度' }, { status: 400 })
    }
    const ref     = parseRefDate(searchParams.get('ref'))
    // 前年比の比較対象:
    //  - 日粒度: 前年の同日から最も近い同曜日の日
    //  - 月粒度: 前年同月 (日別行は下で 1 日ずつ同曜日に突き合わせる)
    //  - 年粒度: 前年 (月別で突き合わせ。曜日補正は対象外)
    const prevRef = g === 'day' ? prevYearSameDow(ref) : prevYearRef(ref)
    const cur     = rangeFor(g, ref)
    const prev    = rangeFor(g, prevRef)

    // 月粒度は日別の同曜日補正で月境界をまたぐため、前年の取得範囲を ±4 日広げる
    const prevFetchStart = g === 'month'
      ? new Date(prev.start.getTime() - 4 * 86400000) : prev.start
    const prevFetchEnd   = g === 'month'
      ? new Date(prev.endExclusive.getTime() + 4 * 86400000) : prev.endExclusive

    // 過去 3 年 (古い順, 末尾が今期と同じ)
    const past3Refs   = pastYearRefs(ref, 3)
    const past3Ranges = past3Refs.map((r) => rangeFor(g, r))

    const [
      [curSales, prevSales, ...past3SalesByIdx],
      [curShip, prevShip],
    ] = await Promise.all([
      Promise.all([
        prisma.sale.findMany({
          where  : { saleDate: { gte: cur.start, lt: cur.endExclusive } },
          include: { store: true },
        }) as unknown as Promise<SaleRow[]>,
        prisma.sale.findMany({
          where  : { saleDate: { gte: prevFetchStart, lt: prevFetchEnd } },
          include: { store: true },
        }) as unknown as Promise<SaleRow[]>,
        ...past3Ranges.map((r) =>
          prisma.sale.findMany({
            where  : { saleDate: { gte: r.start, lt: r.endExclusive } },
            include: { store: true },
          }) as unknown as Promise<SaleRow[]>,
        ),
      ]),
      Promise.all([
        fetchShipments(cur.start,  cur.endExclusive),
        fetchShipments(prevFetchStart, prevFetchEnd),
      ]),
    ])

    const pastYears: PastYearEntry[] = past3SalesByIdx.map((sales, i) =>
      aggregatePastYear(sales, past3Refs[i].getFullYear(), past3Ranges[i].label),
    )
    // 今年 (現在選択中期間) も同形式で算出 (過去3年表の比較行用)
    const currentYear: PastYearEntry =
      aggregatePastYear(curSales, ref.getFullYear(), cur.label)

    const total = { byStore: aggregateByStore(curSales, curShip) }

    let daily         : DailyEntry[] | undefined
    let prevDaily     : DailyEntry[] | undefined
    let monthly       : MonthlyEntry[] | undefined
    let prevMonthly   : MonthlyEntry[] | undefined
    let dowByStore    : Record<string, DowEntry[]> | undefined
    let weatherByStore: Record<string, WeatherEntry[]> | undefined
    let prevTotalByStore: Record<string, Bucket> = {}

    if (g === 'month') {
      daily = aggregateDaily(curSales, cur.start, cur.endInclusive, curShip)
      // 前年: 各当日に対し「前年同日から最も近い同曜日」を突き合わせる
      const prevMap = aggregateDailyMap(prevSales, prevShip)
      prevDaily = daily.map((d) => {
        const target = prevYearSameDow(parseYmd(d.date))
        const e = prevMap.get(ymd(target))
        return {
          date   : ymd(target),
          dow    : target.getDay(),
          weather: e?.weather ?? null,
          byStore: e?.byStore ?? {},
        }
      })
      // 合計の前年比も同曜日補正後の日の合計に揃える
      prevDaily.forEach((pd) => mergeByStore(prevTotalByStore, pd.byStore))
      dowByStore     = aggregateDow(curSales, curShip)
      weatherByStore = aggregateWeather(curSales, curShip)
    } else if (g === 'year') {
      monthly          = aggregateMonthly(curSales,  curShip)
      prevMonthly      = aggregateMonthly(prevSales, prevShip)
      prevTotalByStore = aggregateByStore(prevSales, prevShip)
      dowByStore       = aggregateDow(curSales, curShip)
      weatherByStore   = aggregateWeather(curSales, curShip)
    } else {
      // 日粒度: prevSales は同曜日補正済みの 1 日
      prevTotalByStore = aggregateByStore(prevSales, prevShip)
    }

    const prevTotal = { byStore: prevTotalByStore }

    return NextResponse.json({
      granularity: g,
      ref        : ymd(ref),
      start      : ymd(cur.start),
      end        : ymd(cur.endInclusive),
      label      : cur.label,
      total,
      prevTotal,
      ...(daily       ? { daily }       : {}),
      ...(prevDaily   ? { prevDaily }   : {}),
      ...(monthly     ? { monthly }     : {}),
      ...(prevMonthly ? { prevMonthly } : {}),
      ...(dowByStore     ? { dow    : { byStore: dowByStore }     } : {}),
      ...(weatherByStore ? { weather: { byStore: weatherByStore } } : {}),
      pastYears,
      currentYear,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
