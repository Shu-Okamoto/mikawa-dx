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

const WEATHER_KEYS = ['晴', '曇', '雨', '雪'] as const
type WeatherKey = typeof WEATHER_KEYS[number] | '未記録'

interface Bucket {
  amount       : number
  souzai       : number
  mochi        : number
  hana         : number
  customerCount: number
  days         : number
}

type Granularity = 'year' | 'month' | 'day'
const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function toNum(v: { toNumber: () => number } | number): number {
  return typeof v === 'number' ? v : v.toNumber()
}

function newBucket(): Bucket {
  return { amount: 0, souzai: 0, mochi: 0, hana: 0, customerCount: 0, days: 0 }
}

function addRow(b: Bucket, s: SaleRow) {
  b.amount        += toNum(s.amount)
  b.souzai        += toNum(s.souzaiAmount)
  b.mochi         += toNum(s.mochiAmount)
  b.hana          += toNum(s.hanaAmount)
  b.customerCount += s.customerCount
  b.days          += 1
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

function aggregateByStore(sales: SaleRow[]): Record<string, Bucket> {
  const out: Record<string, Bucket> = {}
  sales.forEach((s) => {
    const name = s.store.storeName
    if (!out[name]) out[name] = newBucket()
    addRow(out[name], s)
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
function aggregateDaily(sales: SaleRow[], start: Date, endInclusive: Date): DailyEntry[] {
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
    addRow(entry.byStore[name], s)
    if (!entry.weather && s.weather) entry.weather = s.weather
  })
  return Array.from(byDate.values())
}

// 月別 (年粒度用)
interface MonthlyEntry {
  month   : number                       // 1〜12
  byStore : Record<string, Bucket>
}
function aggregateMonthly(sales: SaleRow[]): MonthlyEntry[] {
  const arr: MonthlyEntry[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, byStore: {},
  }))
  sales.forEach((s) => {
    const m  = new Date(s.saleDate).getMonth() // 0..11
    const e  = arr[m]
    const name = s.store.storeName
    if (!e.byStore[name]) e.byStore[name] = newBucket()
    addRow(e.byStore[name], s)
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
function aggregateDow(sales: SaleRow[]): Record<string, DowEntry[]> {
  const accum: Record<string, Bucket[]> = {}
  sales.forEach((s) => {
    const name = s.store.storeName
    const dow  = new Date(s.saleDate).getDay()
    if (!accum[name]) accum[name] = Array.from({ length: 7 }, newBucket)
    addRow(accum[name][dow], s)
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
function aggregateWeather(sales: SaleRow[]): Record<string, WeatherEntry[]> {
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
    addRow(accum[name][w], s)
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
    const prevRef = prevYearRef(ref)
    const cur     = rangeFor(g, ref)
    const prev    = rangeFor(g, prevRef)

    // 過去 3 年 (古い順, 末尾が今期と同じ)
    const past3Refs   = pastYearRefs(ref, 3)
    const past3Ranges = past3Refs.map((r) => rangeFor(g, r))

    const [curSales, prevSales, ...past3SalesByIdx] = await Promise.all([
      prisma.sale.findMany({
        where  : { saleDate: { gte: cur.start, lt: cur.endExclusive } },
        include: { store: true },
      }) as unknown as Promise<SaleRow[]>,
      prisma.sale.findMany({
        where  : { saleDate: { gte: prev.start, lt: prev.endExclusive } },
        include: { store: true },
      }) as unknown as Promise<SaleRow[]>,
      ...past3Ranges.map((r) =>
        prisma.sale.findMany({
          where  : { saleDate: { gte: r.start, lt: r.endExclusive } },
          include: { store: true },
        }) as unknown as Promise<SaleRow[]>,
      ),
    ])

    const pastYears: PastYearEntry[] = past3SalesByIdx.map((sales, i) =>
      aggregatePastYear(sales, past3Refs[i].getFullYear(), past3Ranges[i].label),
    )

    const total     = { byStore: aggregateByStore(curSales) }
    const prevTotal = { byStore: aggregateByStore(prevSales) }

    let daily         : DailyEntry[] | undefined
    let prevDaily     : DailyEntry[] | undefined
    let monthly       : MonthlyEntry[] | undefined
    let prevMonthly   : MonthlyEntry[] | undefined
    let dowByStore    : Record<string, DowEntry[]> | undefined
    let weatherByStore: Record<string, WeatherEntry[]> | undefined

    if (g === 'month') {
      daily          = aggregateDaily(curSales,  cur.start,  cur.endInclusive)
      prevDaily      = aggregateDaily(prevSales, prev.start, prev.endInclusive)
      dowByStore     = aggregateDow(curSales)
      weatherByStore = aggregateWeather(curSales)
    } else if (g === 'year') {
      monthly        = aggregateMonthly(curSales)
      prevMonthly    = aggregateMonthly(prevSales)
      dowByStore     = aggregateDow(curSales)
      weatherByStore = aggregateWeather(curSales)
    }

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
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
