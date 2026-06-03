'use client'

import { Fragment, useEffect, useMemo, useState, useCallback, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav } from '../_shared'

type Granularity = 'year' | 'month' | 'day'
type ViewKey    = 'daily' | 'category' | 'dow' | 'weather'

interface Bucket {
  amount       : number
  souzai       : number
  mochi        : number
  hana         : number
  customerCount: number
  days         : number
}

interface DailyEntry {
  date    : string
  dow     : number
  byStore : Record<string, Bucket>
}

interface MonthlyEntry {
  month   : number
  byStore : Record<string, Bucket>
}

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

interface WeatherEntry {
  weather     : string  // '晴' | '曇' | '雨' | '雪' | '未記録'
  days        : number
  totalAmount : number
  avgAmount   : number
  avgSouzai   : number
  avgMochi    : number
  avgHana     : number
  avgCustomer : number
}

interface ApiData {
  granularity : Granularity
  ref         : string
  start       : string
  end         : string
  label       : string
  total       : { byStore: Record<string, Bucket> }
  prevTotal   : { byStore: Record<string, Bucket> }
  daily?      : DailyEntry[]
  prevDaily?  : DailyEntry[]
  monthly?    : MonthlyEntry[]
  prevMonthly?: MonthlyEntry[]
  dow?        : { byStore: Record<string, DowEntry[]> }
  weather?    : { byStore: Record<string, WeatherEntry[]> }
}

const STORES = ['西店', '南店']

const SEGMENTS = [
  { key: 'souzai', label: '惣菜',   color: '#639922' },
  { key: 'mochi' , label: '餅'  ,   color: '#1A5276' },
  { key: 'hana'  , label: '花'  ,   color: '#E67E22' },
  { key: 'other' , label: 'その他', color: '#A8A69E' },
] as const

const VIEWS: { key: ViewKey; label: string; emoji: string }[] = [
  { key: 'daily'   , label: '日別'      , emoji: '💰' },
  { key: 'category', label: 'カテゴリ別', emoji: '📋' },
  { key: 'dow'     , label: '曜日別'    , emoji: '📊' },
  { key: 'weather' , label: '天気別'    , emoji: '☀️' },
]

const WEATHER_DISPLAY: Record<string, { emoji: string; color: string }> = {
  '晴'    : { emoji: '☀️', color: '#F1C40F' },
  '曇'    : { emoji: '☁️', color: '#95A5A6' },
  '雨'    : { emoji: '🌧️', color: '#1A5276' },
  '雪'    : { emoji: '❄️', color: '#5DADE2' },
  '未記録': { emoji: '—'  , color: '#888780' },
}

// 表示順: 月→日
const DOW_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function shiftRef(ref: string, g: Granularity, dir: -1 | 1): string {
  const [y, m, d] = ref.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (g === 'year')  date.setFullYear(date.getFullYear() + dir)
  if (g === 'month') date.setMonth(date.getMonth() + dir)
  if (g === 'day')   date.setDate(date.getDate() + dir)
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function emptyBucket(): Bucket {
  return { amount: 0, souzai: 0, mochi: 0, hana: 0, customerCount: 0, days: 0 }
}

function sumStores(byStore: Record<string, Bucket>): Bucket {
  const out = emptyBucket()
  STORES.forEach((s) => {
    const b = byStore[s]
    if (!b) return
    out.amount        += b.amount
    out.souzai        += b.souzai
    out.mochi         += b.mochi
    out.hana          += b.hana
    out.customerCount += b.customerCount
    out.days = Math.max(out.days, b.days)
  })
  return out
}

function yen(n: number): string {
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

function pct(curr: number, prev: number): string {
  if (prev <= 0) return '—'
  return Math.round((curr / prev) * 100) + '%'
}

function emptyDow(): DowEntry[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dow: i, label: ['日','月','火','水','木','金','土'][i], days: 0,
    totalAmount: 0, avgAmount: 0, avgSouzai: 0, avgMochi: 0, avgHana: 0, avgCustomer: 0,
  }))
}

function reorderDow(entries: DowEntry[]): DowEntry[] {
  return DOW_DISPLAY_ORDER.map((i) => entries[i] ?? {
    dow: i, label: ['日','月','火','水','木','金','土'][i], days: 0,
    totalAmount: 0, avgAmount: 0, avgSouzai: 0, avgMochi: 0, avgHana: 0, avgCustomer: 0,
  })
}

function AnalyticsContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [ref, setRef] = useState<string>(todayYmd())
  const [view, setView] = useState<ViewKey>('daily')
  const [data, setData] = useState<ApiData | null>(null)
  const [fetching, setFetching] = useState(true)

  const fetchData = useCallback(async (g: Granularity, r: string) => {
    setFetching(true)
    try {
      const res  = await authFetch(`/api/boss/analytics/summary?granularity=${g}&ref=${r}`)
      const json = await res.json()
      if (!json.error) setData(json)
    } finally {
      setFetching(false)
    }
  }, [authFetch])

  useEffect(() => {
    if (loading || error) return
    fetchData(granularity, ref)
  }, [loading, error, fetchData, granularity, ref])

  if (loading) return <Center>読み込み中...</Center>
  if (error)   return <Center error>{error}</Center>

  // 曜日別 / 天気別は日粒度では非表示なので、自動で日別に倒す
  const effectiveView: ViewKey =
    granularity === 'day' && (view === 'dow' || view === 'weather') ? 'daily' : view

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA', minHeight:'100vh', paddingBottom:'24px' }}>
      <BossHeader title="📈 売上分析" subtitle={user?.name} onLogout={logout} />
      <BossNav active="/boss/analytics" />

      <div style={{ padding:'12px' }}>

        {/* 期間コントロール */}
        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap',
            marginBottom:'12px' }}>
            {([
              ['day'  , '日'],
              ['month', '月'],
              ['year' , '年'],
            ] as const).map(([key, label]) => {
              const active = granularity === key
              return (
                <button key={key} onClick={() => {
                  setGranularity(key)
                  if (key === 'day') setRef(todayYmd())
                }}
                  style={{
                    padding:'8px 16px', borderRadius:'20px', fontSize:'15px',
                    fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                    border: active ? '1.5px solid #2C2C2A' : '1.5px solid #E5E1D8',
                    background: active ? '#2C2C2A' : 'white',
                    color    : active ? 'white'   : '#2C2C2A',
                  }}>{label}</button>
              )
            })}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:'8px',
            justifyContent:'center' }}>
            <button onClick={() => setRef(shiftRef(ref, granularity, -1))}
              style={navBtn}>‹</button>
            <div style={{ flex:1, textAlign:'center', fontSize:'17px',
              fontWeight:500, color:'#2C2C2A' }}>
              {data?.label ?? '—'}
            </div>
            <button onClick={() => setRef(shiftRef(ref, granularity, 1))}
              style={navBtn}>›</button>
          </div>

          <div style={{ marginTop:'12px', display:'flex',
            justifyContent:'center' }}>
            <PeriodPicker granularity={granularity} ref_={ref} onChange={setRef} />
          </div>
        </div>

        {/* ビュー切替タブ */}
        <div style={{ display:'flex', gap:'6px', marginBottom:'10px' }}>
          {VIEWS.map((v) => {
            const active   = v.key === effectiveView
            const disabled = (v.key === 'dow' || v.key === 'weather') && granularity === 'day'
            return (
              <button key={v.key} onClick={() => !disabled && setView(v.key)}
                disabled={disabled}
                style={{
                  flex:'1 1 0', padding:'10px 8px',
                  borderRadius:'12px', fontSize:'14px', fontWeight:500,
                  fontFamily:'inherit',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  border: active ? '1.5px solid #1A5276' : '1.5px solid #E5E1D8',
                  background: active ? '#1A5276' : 'white',
                  color    : active ? 'white'   : '#2C2C2A',
                }}>{v.emoji} {v.label}</button>
            )
          })}
        </div>

        {fetching ? (
          <div style={{ background:'white', borderRadius:'16px', padding:'40px',
            textAlign:'center', color:'#888780' }}>読み込み中...</div>
        ) : !data ? (
          <div style={{ background:'white', borderRadius:'16px', padding:'40px',
            textAlign:'center', color:'#888780' }}>データがありません</div>
        ) : effectiveView === 'daily' ? (
          <DailySalesTable data={data} />
        ) : effectiveView === 'category' ? (
          <CategoryTable data={data} />
        ) : effectiveView === 'dow' ? (
          <DowChartView data={data} />
        ) : (
          <WeatherChartView data={data} />
        )}

      </div>
    </div>
  )
}

// =====================================
// 日別 (売上) ビュー: 表
// 列: 日付 | 西店(売上/客数) | 南店(売上/客数) | 本部合計(売上/客数) | 前年比
// 行: 各日 + 合計 + 平均 (粒度=月/年のみ平均行を表示)
// =====================================

function avgBucket(rows: RowData[]): Bucket {
  // データのある行 (西店または南店の amount > 0) を分母にする
  const out = emptyBucket()
  let days = 0
  rows.forEach((r) => {
    const t = sumStores(r.byStore)
    if (t.amount <= 0 && t.customerCount <= 0) return
    days++
    out.amount        += t.amount
    out.souzai        += t.souzai
    out.mochi         += t.mochi
    out.hana          += t.hana
    out.customerCount += t.customerCount
  })
  if (days === 0) return out
  out.amount        = Math.round(out.amount        / days)
  out.souzai        = Math.round(out.souzai        / days)
  out.mochi         = Math.round(out.mochi         / days)
  out.hana          = Math.round(out.hana          / days)
  out.customerCount = Math.round(out.customerCount / days)
  out.days          = days
  return out
}

function DailySalesTable({ data }: { data: ApiData }) {
  const rows = useMemo(() => buildRows(data), [data])
  const totalRow: RowData = {
    key: 'TOTAL', label: '合計',
    byStore    : data.total.byStore,
    prevByStore: data.prevTotal.byStore,
  }
  // 平均行: 当期 / 前年同期間 をそれぞれ「データのある日」で平均
  const showAvg = data.granularity !== 'day' && rows.length > 1
  const avgByStore: Record<string, Bucket> = {}
  const avgPrevByStore: Record<string, Bucket> = {}
  if (showAvg) {
    STORES.forEach((s) => {
      avgByStore[s]     = avgBucket(rows.map((r) => ({
        ...r, byStore: { [s]: r.byStore[s]     ?? emptyBucket() },
      })))
      avgPrevByStore[s] = avgBucket(rows.map((r) => ({
        ...r, byStore: { [s]: r.prevByStore[s] ?? emptyBucket() },
      })))
    })
  }
  const avgRow: RowData = {
    key: 'AVG', label: '平均',
    byStore: avgByStore, prevByStore: avgPrevByStore,
  }

  return (
    <div style={{ background:'white', borderRadius:'16px', overflow:'hidden',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
        fontWeight:500, fontSize:'16px' }}>
        💰 売上 一覧
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', minWidth:'640px',
          borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={thStyle}>
                {data.granularity === 'year' ? '月' : '日付'}
              </th>
              <th colSpan={2} style={thGroupStyle}>西店</th>
              <th colSpan={2} style={thGroupStyle}>南店</th>
              <th colSpan={2} style={thTotalGroupStyle}>本部合計</th>
              <th rowSpan={2} style={{ ...thStyle, background:'#FBF8F2', minWidth:'56px' }}>
                前年比
              </th>
            </tr>
            <tr>
              <th style={thSubStyle}>売上</th>
              <th style={thSubStyle}>客数</th>
              <th style={thSubStyle}>売上</th>
              <th style={thSubStyle}>客数</th>
              <th style={{ ...thSubStyle, background:'#FBF8F2' }}>売上</th>
              <th style={{ ...thSubStyle, background:'#FBF8F2' }}>客数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <DailyRow key={r.key} row={r} />
            ))}
            <DailyRow row={totalRow} isTotal />
            {showAvg && <DailyRow row={avgRow} isAvg />}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DailyRow({ row, isTotal, isAvg }: {
  row: RowData; isTotal?: boolean; isAvg?: boolean
}) {
  const total     = sumStores(row.byStore)
  const prevTotal = sumStores(row.prevByStore)
  const curAmt  = total.amount
  const prevAmt = prevTotal.amount

  const bg = isTotal || isAvg ? '#FBF8F2'
    : row.dow === 0 ? '#FFF7F6'
    : row.dow === 6 ? '#F2F7FB'
    : 'white'
  const labelColor = isTotal || isAvg ? '#2C2C2A'
    : row.dow === 0 ? '#E24B4A'
    : row.dow === 6 ? '#1A5276'
    : '#2C2C2A'
  const weight = isTotal || isAvg ? 600 : 500
  const cell = (n: number) => n > 0 ? yen(n) : '—'

  return (
    <tr style={{ background: bg, borderTop: isAvg ? '2px solid #E5E1D8' : '1px solid #F0ECE3' }}>
      <td style={{ ...tdStyle, fontWeight: weight, color: labelColor, whiteSpace:'nowrap' }}>
        {row.label}
        {row.sublabel && (
          <span style={{ marginLeft:'4px', fontSize:'11px', color:'#888780' }}>
            ({row.sublabel})
          </span>
        )}
      </td>
      {STORES.map((s) => {
        const b = row.byStore[s]
        return (
          <Fragment key={s}>
            <td style={tdNumStyle}>{cell(b?.amount ?? 0)}</td>
            <td style={tdNumStyle}>
              {b && b.customerCount > 0 ? `${b.customerCount}人` : '—'}
            </td>
          </Fragment>
        )
      })}
      <td style={{ ...tdNumStyle, background:'#FBF8F2', fontWeight: weight }}>
        {cell(curAmt)}
      </td>
      <td style={{ ...tdNumStyle, background:'#FBF8F2' }}>
        {total.customerCount > 0 ? `${total.customerCount}人` : '—'}
      </td>
      <td style={{ ...tdNumStyle, color: yoyColor(curAmt, prevAmt) }}>
        {prevAmt > 0 ? pct(curAmt, prevAmt) : '—'}
      </td>
    </tr>
  )
}

// =====================================
// カテゴリ別ビュー: 表
// 列: 日付 | 西店惣菜 西店餅 | 南店惣菜 南店餅 | 本部合計(惣菜+餅) | 客数 | 前年比
// =====================================

interface RowData {
  key      : string
  label    : string
  sublabel?: string
  dow?     : number
  byStore     : Record<string, Bucket>
  prevByStore : Record<string, Bucket>
}

function buildRows(data: ApiData): RowData[] {
  if (data.granularity === 'month') {
    const daily     = data.daily ?? []
    const prevDaily = data.prevDaily ?? []
    return daily.map((d, i) => {
      const p  = prevDaily[i]
      const dt = new Date(d.date)
      return {
        key        : d.date,
        label      : `${dt.getMonth()+1}/${dt.getDate()}`,
        sublabel   : ['日','月','火','水','木','金','土'][d.dow],
        dow        : d.dow,
        byStore    : d.byStore,
        prevByStore: p?.byStore ?? {},
      }
    })
  }
  if (data.granularity === 'year') {
    const monthly     = data.monthly     ?? []
    const prevMonthly = data.prevMonthly ?? []
    return monthly.map((m, i) => ({
      key        : `m${m.month}`,
      label      : `${m.month}月`,
      byStore    : m.byStore,
      prevByStore: prevMonthly[i]?.byStore ?? {},
    }))
  }
  return [{
    key: 'd', label: data.label,
    byStore    : data.total.byStore,
    prevByStore: data.prevTotal.byStore,
  }]
}

function CategoryTable({ data }: { data: ApiData }) {
  const rows = useMemo(() => buildRows(data), [data])
  const totalRow: RowData = {
    key: 'TOTAL', label: '合計',
    byStore    : data.total.byStore,
    prevByStore: data.prevTotal.byStore,
  }

  return (
    <div style={{ background:'white', borderRadius:'16px', overflow:'hidden',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
        fontWeight:500, fontSize:'16px' }}>
        📋 カテゴリ別 売上一覧
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', minWidth:'720px',
          borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={thStyle}>
                {data.granularity === 'year' ? '月' : '日付'}
              </th>
              <th colSpan={2} style={thGroupStyle}>西店</th>
              <th colSpan={2} style={thGroupStyle}>南店</th>
              <th rowSpan={2} style={{ ...thStyle, background:'#FBF8F2', minWidth:'90px' }}>
                本部合計
              </th>
              <th rowSpan={2} style={{ ...thStyle, background:'#FBF8F2', minWidth:'56px' }}>
                客数
              </th>
              <th rowSpan={2} style={{ ...thStyle, background:'#FBF8F2', minWidth:'56px' }}>
                前年比
              </th>
            </tr>
            <tr>
              <th style={thSubStyle}>惣菜</th>
              <th style={thSubStyle}>餅</th>
              <th style={thSubStyle}>惣菜</th>
              <th style={thSubStyle}>餅</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CategoryRow key={r.key} row={r} />
            ))}
            <CategoryRow row={totalRow} isTotal />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CategoryRow({ row, isTotal }: { row: RowData; isTotal?: boolean }) {
  const total     = sumStores(row.byStore)
  const prevTotal = sumStores(row.prevByStore)
  // 本部合計と前年比は 惣菜 + 餅 ベース (花/その他は含めない)
  const curSM  = total.souzai     + total.mochi
  const prevSM = prevTotal.souzai + prevTotal.mochi

  const bg = isTotal ? '#FBF8F2'
    : row.dow === 0 ? '#FFF7F6'
    : row.dow === 6 ? '#F2F7FB'
    : 'white'
  const labelColor = isTotal ? '#2C2C2A'
    : row.dow === 0 ? '#E24B4A'
    : row.dow === 6 ? '#1A5276'
    : '#2C2C2A'
  const weight = isTotal ? 600 : 500

  const cell = (n: number) => n > 0 ? yen(n) : '—'

  return (
    <tr style={{ background: bg, borderTop:'1px solid #F0ECE3' }}>
      <td style={{ ...tdStyle, fontWeight: weight, color: labelColor, whiteSpace:'nowrap' }}>
        {row.label}
        {row.sublabel && (
          <span style={{ marginLeft:'4px', fontSize:'11px', color:'#888780' }}>
            ({row.sublabel})
          </span>
        )}
      </td>
      {STORES.map((s) => {
        const b = row.byStore[s]
        return (
          <Fragment key={s}>
            <td style={tdNumStyle}>{cell(b?.souzai ?? 0)}</td>
            <td style={tdNumStyle}>{cell(b?.mochi  ?? 0)}</td>
          </Fragment>
        )
      })}
      <td style={{ ...tdNumStyle, background:'#FBF8F2',
        fontWeight: isTotal ? 600 : 500 }}>{cell(curSM)}</td>
      <td style={{ ...tdNumStyle, background:'#FBF8F2' }}>
        {total.customerCount > 0 ? `${total.customerCount}人` : '—'}
      </td>
      <td style={{ ...tdNumStyle, color: yoyColor(curSM, prevSM) }}>
        {prevSM > 0 ? pct(curSM, prevSM) : '—'}
      </td>
    </tr>
  )
}

function yoyColor(curr: number, prev: number): string {
  if (prev <= 0 || curr === 0) return '#888780'
  const ratio = curr / prev
  if (ratio >= 1.05) return '#3B6D11'
  if (ratio <= 0.95) return '#E24B4A'
  return '#2C2C2A'
}

// =====================================
// 曜日別ビュー: 棒グラフ
// =====================================

function DowChartView({ data }: { data: ApiData }) {
  if (!data.dow) {
    return (
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', color:'#888780' }}>
        この粒度では曜日別表示は利用できません
      </div>
    )
  }
  return (
    <div style={{ background:'white', borderRadius:'16px', padding:'16px',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ fontWeight:500, fontSize:'16px', marginBottom:'4px' }}>
        📊 曜日別 1日平均売上
      </div>
      <div style={{ fontSize:'13px', color:'#888780', marginBottom:'12px' }}>
        ※ {data.label} 内の各曜日の1日あたり平均
      </div>

      <Legend />

      {STORES.map((s) => (
        <DowBarChart key={s} name={s}
          entries={reorderDow(data.dow!.byStore[s] ?? emptyDow())} />
      ))}
    </div>
  )
}

function Legend() {
  return (
    <div style={{ display:'flex', gap:'14px', flexWrap:'wrap',
      marginBottom:'10px', fontSize:'13px', color:'#555' }}>
      {SEGMENTS.map((seg) => (
        <span key={seg.key} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          <span style={{ width:'14px', height:'14px', borderRadius:'3px',
            background: seg.color, display:'inline-block' }} />
          {seg.label}
        </span>
      ))}
    </div>
  )
}

function DowBarChart({ name, entries }: { name: string; entries: DowEntry[] }) {
  const maxAmount = Math.max(...entries.map((e) => e.avgAmount), 1)
  const seg = (e: DowEntry) => ({
    souzai: e.avgSouzai, mochi: e.avgMochi, hana: e.avgHana,
    other : Math.max(0, e.avgAmount - e.avgSouzai - e.avgMochi - e.avgHana),
  })

  return (
    <div style={{ marginTop:'12px', marginBottom:'8px' }}>
      <div style={{ fontSize:'15px', fontWeight:500, color:'#2C2C2A',
        marginBottom:'8px' }}>{name}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'6px',
        padding:'10px', background:'#FAFAFA', borderRadius:'8px' }}>
        {entries.map((e) => {
          const total = e.avgAmount
          const widthPct = total > 0 ? (total / maxAmount) * 100 : 0
          const labelColor = e.dow === 0 ? '#E24B4A' :
                              e.dow === 6 ? '#1A6FAF' : '#2C2C2A'
          const segs = seg(e)
          return (
            <div key={e.dow} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'28px', fontSize:'14px', fontWeight:600,
                color: labelColor, textAlign:'center', flexShrink:0 }}>
                {e.label}
              </div>
              <div style={{ flex:1, position:'relative', height:'28px',
                background:'#EEE', borderRadius:'4px', overflow:'hidden' }}>
                {total > 0 && (
                  <div style={{ position:'absolute', left:0, top:0, bottom:0,
                    width: widthPct + '%', display:'flex',
                    borderRadius:'4px', overflow:'hidden' }}>
                    {SEGMENTS.map((s) => {
                      const v = segs[s.key]
                      if (v <= 0) return null
                      const pct = (v / total) * 100
                      const segWidthPx = (pct / 100) * widthPct
                      const showLabel = segWidthPx >= 8
                      return (
                        <div key={s.key}
                          title={`${s.label} ¥${Math.round(v).toLocaleString()} (${pct.toFixed(0)}%)`}
                          style={{ width: pct + '%', background: s.color,
                            display:'flex', alignItems:'center',
                            justifyContent:'center',
                            color:'white', fontSize:'11px', fontWeight:600,
                            overflow:'hidden', whiteSpace:'nowrap' }}>
                          {showLabel ? '¥' + Math.round(v).toLocaleString() : ''}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ width:'92px', fontSize:'12px',
                textAlign:'right', flexShrink:0, lineHeight:1.3 }}>
                {e.days > 0 ? (
                  <>
                    <div style={{ fontWeight:600, color:'#2C2C2A' }}>
                      ¥{Math.round(total).toLocaleString()}
                    </div>
                    <div style={{ color:'#888780', fontSize:'11px' }}>
                      {e.avgCustomer}人 · {e.days}日
                    </div>
                  </>
                ) : (
                  <span style={{ color:'#888780' }}>—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =====================================
// 天気別ビュー: 棒グラフ
// =====================================

const WEATHER_DISPLAY_ORDER = ['晴', '曇', '雨', '雪', '未記録'] as const

function emptyWeather(): WeatherEntry[] {
  return WEATHER_DISPLAY_ORDER.map((w) => ({
    weather: w, days: 0,
    totalAmount: 0, avgAmount: 0, avgSouzai: 0, avgMochi: 0, avgHana: 0, avgCustomer: 0,
  }))
}

function reorderWeather(entries: WeatherEntry[]): WeatherEntry[] {
  const byKey = new Map(entries.map((e) => [e.weather, e]))
  return WEATHER_DISPLAY_ORDER.map((w) => byKey.get(w) ?? {
    weather: w, days: 0,
    totalAmount: 0, avgAmount: 0, avgSouzai: 0, avgMochi: 0, avgHana: 0, avgCustomer: 0,
  })
}

function WeatherChartView({ data }: { data: ApiData }) {
  if (!data.weather) {
    return (
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', color:'#888780' }}>
        この粒度では天気別表示は利用できません
      </div>
    )
  }
  return (
    <div style={{ background:'white', borderRadius:'16px', padding:'16px',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ fontWeight:500, fontSize:'16px', marginBottom:'4px' }}>
        ☀️ 天気別 1日平均売上
      </div>
      <div style={{ fontSize:'13px', color:'#888780', marginBottom:'12px' }}>
        ※ {data.label} 内の各天気の1日あたり平均。天気が未入力の日は「未記録」に集計。
      </div>

      <Legend />

      {STORES.map((s) => (
        <WeatherBarChart key={s} name={s}
          entries={reorderWeather(data.weather!.byStore[s] ?? emptyWeather())} />
      ))}
    </div>
  )
}

function WeatherBarChart({ name, entries }: { name: string; entries: WeatherEntry[] }) {
  const maxAmount = Math.max(...entries.map((e) => e.avgAmount), 1)
  const seg = (e: WeatherEntry) => ({
    souzai: e.avgSouzai, mochi: e.avgMochi, hana: e.avgHana,
    other : Math.max(0, e.avgAmount - e.avgSouzai - e.avgMochi - e.avgHana),
  })

  return (
    <div style={{ marginTop:'12px', marginBottom:'8px' }}>
      <div style={{ fontSize:'15px', fontWeight:500, color:'#2C2C2A',
        marginBottom:'8px' }}>{name}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'6px',
        padding:'10px', background:'#FAFAFA', borderRadius:'8px' }}>
        {entries.map((e) => {
          const total = e.avgAmount
          const widthPct = total > 0 ? (total / maxAmount) * 100 : 0
          const disp = WEATHER_DISPLAY[e.weather] ?? { emoji: '', color: '#888780' }
          const segs = seg(e)
          return (
            <div key={e.weather} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'72px', fontSize:'13px', fontWeight:600,
                color: disp.color, textAlign:'left', flexShrink:0,
                display:'flex', alignItems:'center', gap:'4px' }}>
                <span style={{ fontSize:'15px' }}>{disp.emoji}</span>
                {e.weather}
              </div>
              <div style={{ flex:1, position:'relative', height:'28px',
                background:'#EEE', borderRadius:'4px', overflow:'hidden' }}>
                {total > 0 && (
                  <div style={{ position:'absolute', left:0, top:0, bottom:0,
                    width: widthPct + '%', display:'flex',
                    borderRadius:'4px', overflow:'hidden' }}>
                    {SEGMENTS.map((s) => {
                      const v = segs[s.key]
                      if (v <= 0) return null
                      const pct = (v / total) * 100
                      const segWidthPx = (pct / 100) * widthPct
                      const showLabel = segWidthPx >= 8
                      return (
                        <div key={s.key}
                          title={`${s.label} ¥${Math.round(v).toLocaleString()} (${pct.toFixed(0)}%)`}
                          style={{ width: pct + '%', background: s.color,
                            display:'flex', alignItems:'center',
                            justifyContent:'center',
                            color:'white', fontSize:'11px', fontWeight:600,
                            overflow:'hidden', whiteSpace:'nowrap' }}>
                          {showLabel ? '¥' + Math.round(v).toLocaleString() : ''}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ width:'92px', fontSize:'12px',
                textAlign:'right', flexShrink:0, lineHeight:1.3 }}>
                {e.days > 0 ? (
                  <>
                    <div style={{ fontWeight:600, color:'#2C2C2A' }}>
                      ¥{Math.round(total).toLocaleString()}
                    </div>
                    <div style={{ color:'#888780', fontSize:'11px' }}>
                      {e.avgCustomer}人 · {e.days}日
                    </div>
                  </>
                ) : (
                  <span style={{ color:'#888780' }}>—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PeriodPicker({ granularity, ref_, onChange }: {
  granularity: Granularity
  ref_       : string
  onChange   : (r: string) => void
}) {
  const [y, m] = ref_.split('-').map(Number)

  if (granularity === 'year') {
    const currentYear = new Date().getFullYear()
    const years: number[] = []
    for (let yy = currentYear + 1; yy >= 2020; yy--) years.push(yy)
    return (
      <select value={y} onChange={(e) => onChange(`${e.target.value}-01-01`)}
        style={pickerStyle}>
        {years.map((yy) => (
          <option key={yy} value={yy}>{yy}年</option>
        ))}
      </select>
    )
  }
  if (granularity === 'day') {
    return (
      <input type="date" value={ref_}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        style={pickerStyle} />
    )
  }
  const value = `${y}-${String(m).padStart(2, '0')}`
  return (
    <input type="month" value={value}
      onChange={(e) => {
        if (!e.target.value) return
        onChange(e.target.value + '-01')
      }}
      style={pickerStyle} />
  )
}

const thStyle: React.CSSProperties = {
  padding:'8px 6px', borderBottom:'1.5px solid #E5E1D8',
  fontSize:'12px', fontWeight:500, color:'#2C2C2A',
  background:'#FAF8F3', whiteSpace:'nowrap',
}
const thGroupStyle: React.CSSProperties = { ...thStyle, textAlign:'center' }
const thTotalGroupStyle: React.CSSProperties = { ...thStyle, textAlign:'center', background:'#FBF8F2' }
const thSubStyle: React.CSSProperties = {
  padding:'4px 6px', borderBottom:'1.5px solid #E5E1D8',
  fontSize:'11px', fontWeight:400, color:'#888780',
  background:'#FAF8F3', whiteSpace:'nowrap', textAlign:'center',
}
const tdStyle: React.CSSProperties = {
  padding:'6px 8px', fontSize:'13px', color:'#2C2C2A',
}
const tdNumStyle: React.CSSProperties = {
  padding:'6px 8px', fontSize:'13px', color:'#2C2C2A',
  textAlign:'right', whiteSpace:'nowrap',
}
const pickerStyle: React.CSSProperties = {
  padding:'10px 14px', fontSize:'15px',
  border:'1.5px solid #E5E1D8', borderRadius:'10px',
  background:'white', fontFamily:'inherit',
  color:'#2C2C2A', cursor:'pointer',
}
const navBtn: React.CSSProperties = {
  width:'40px', height:'40px', borderRadius:'10px',
  background:'#F5F1EA', border:'none', fontSize:'22px',
  cursor:'pointer', fontFamily:'inherit', color:'#2C2C2A',
}

function Center({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh',
      color: error ? '#E24B4A' : '#888780',
      fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      {children}
    </div>
  )
}

export default function BossAnalyticsPage() {
  return (
    <Suspense fallback={<Center>読み込み中...</Center>}>
      <AnalyticsContent />
    </Suspense>
  )
}
