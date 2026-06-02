'use client'

import { Fragment, useEffect, useMemo, useState, useCallback, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav } from '../_shared'

type Granularity = 'year' | 'month' | 'day'
type MetricKey  = 'amount' | 'souzai' | 'mochi' | 'hana'

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

interface ApiData {
  granularity: Granularity
  ref        : string
  start      : string
  end        : string
  label      : string
  total      : { byStore: Record<string, Bucket> }
  prevTotal  : { byStore: Record<string, Bucket> }
  daily?     : DailyEntry[]
  prevDaily? : DailyEntry[]
  monthly?   : MonthlyEntry[]
  prevMonthly?: MonthlyEntry[]
}

const STORES = ['西店', '南店']

const METRICS: { key: MetricKey; label: string; emoji: string }[] = [
  { key: 'amount', label: '売上',   emoji: '💰' },
  { key: 'souzai', label: '惣菜',   emoji: '🍱' },
  { key: 'mochi',  label: '餅',     emoji: '🍡' },
  { key: 'hana',   label: '花',     emoji: '💐' },
]

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
  if (prev <= 0) return curr > 0 ? '—' : '—'
  return Math.round((curr / prev) * 100) + '%'
}

function AnalyticsContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [ref, setRef] = useState<string>(todayYmd())
  const [metric, setMetric] = useState<MetricKey>('amount')
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

        {/* メトリクスタブ */}
        <div style={{ display:'flex', gap:'6px', marginBottom:'10px', flexWrap:'wrap' }}>
          {METRICS.map((m) => {
            const active = m.key === metric
            return (
              <button key={m.key} onClick={() => setMetric(m.key)}
                style={{
                  flex:'1 1 0', minWidth:'70px', padding:'10px 8px',
                  borderRadius:'12px', fontSize:'14px', fontWeight:500,
                  fontFamily:'inherit', cursor:'pointer',
                  border: active ? '1.5px solid #1A5276' : '1.5px solid #E5E1D8',
                  background: active ? '#1A5276' : 'white',
                  color    : active ? 'white'   : '#2C2C2A',
                }}>{m.emoji} {m.label}</button>
            )
          })}
        </div>

        {fetching ? (
          <div style={{ background:'white', borderRadius:'16px', padding:'40px',
            textAlign:'center', color:'#888780' }}>読み込み中...</div>
        ) : data ? (
          <SalesTable data={data} metric={metric} />
        ) : (
          <div style={{ background:'white', borderRadius:'16px', padding:'40px',
            textAlign:'center', color:'#888780' }}>データがありません</div>
        )}

      </div>
    </div>
  )
}

function SalesTable({ data, metric }: { data: ApiData; metric: MetricKey }) {
  // 行データを統一インタフェイス {label, byStore, prevByStore} で組み立て
  const rows = useMemo(() => buildRows(data), [data])
  const totalRow = useMemo(() => buildTotalRow(data), [data])

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? '売上'
  const metricEmoji = METRICS.find((m) => m.key === metric)?.emoji ?? ''

  return (
    <div style={{ background:'white', borderRadius:'16px', overflow:'hidden',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
        fontWeight:500, fontSize:'16px' }}>
        {metricEmoji} {metricLabel} 一覧
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
              <th colSpan={2} style={thTotalGroupStyle}>合計</th>
              <th rowSpan={2} style={{ ...thStyle, background:'#FBF8F2', minWidth:'56px' }}>前年比</th>
            </tr>
            <tr>
              <th style={thSubStyle}>{metricLabel}</th>
              <th style={thSubStyle}>客数</th>
              <th style={thSubStyle}>{metricLabel}</th>
              <th style={thSubStyle}>客数</th>
              <th style={{ ...thSubStyle, background:'#FBF8F2' }}>{metricLabel}</th>
              <th style={{ ...thSubStyle, background:'#FBF8F2' }}>客数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.key} row={r} metric={metric} />
            ))}
            <Row row={totalRow} metric={metric} isTotal />
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface RowData {
  key      : string
  label    : string
  sublabel?: string
  dow?     : number    // 日曜=0,土曜=6
  byStore     : Record<string, Bucket>
  prevByStore : Record<string, Bucket>
}

function buildRows(data: ApiData): RowData[] {
  if (data.granularity === 'month') {
    const daily     = data.daily ?? []
    const prevDaily = data.prevDaily ?? []
    return daily.map((d, i) => {
      // 前年同日: 同じインデックス(月内位置)で対応させる。
      // 末日のズレ(例: 当月31日まで、前年同月30日まで)は prevDaily[i] が
      // undefined になるので 0扱い。
      const p = prevDaily[i]
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
    const monthly     = data.monthly ?? []
    const prevMonthly = data.prevMonthly ?? []
    return monthly.map((m, i) => ({
      key        : `m${m.month}`,
      label      : `${m.month}月`,
      byStore    : m.byStore,
      prevByStore: prevMonthly[i]?.byStore ?? {},
    }))
  }
  // day: 1行だけ
  return [{
    key        : 'd',
    label      : data.label,
    byStore    : data.total.byStore,
    prevByStore: data.prevTotal.byStore,
  }]
}

function buildTotalRow(data: ApiData): RowData {
  return {
    key        : 'TOTAL',
    label      : '合計',
    byStore    : data.total.byStore,
    prevByStore: data.prevTotal.byStore,
  }
}

function metricOf(b: Bucket | undefined, m: MetricKey): number {
  if (!b) return 0
  if (m === 'amount') return b.amount
  if (m === 'souzai') return b.souzai
  if (m === 'mochi')  return b.mochi
  return b.hana
}

function Row({ row, metric, isTotal }: {
  row: RowData; metric: MetricKey; isTotal?: boolean
}) {
  const total     = sumStores(row.byStore)
  const prevTotal = sumStores(row.prevByStore)
  const curMetric = metricOf(total, metric)
  const prvMetric = metricOf(prevTotal, metric)

  const bg = isTotal ? '#FBF8F2'
    : row.dow === 0 ? '#FFF7F6'
    : row.dow === 6 ? '#F2F7FB'
    : 'white'
  const labelColor = isTotal ? '#2C2C2A'
    : row.dow === 0 ? '#E24B4A'
    : row.dow === 6 ? '#1A5276'
    : '#2C2C2A'
  const weight = isTotal ? 600 : 500

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
        const v = metricOf(b, metric)
        return (
          <Fragment key={s}>
            <td style={tdNumStyle}>{v > 0 ? yen(v) : '—'}</td>
            <td style={tdNumStyle}>{b && b.customerCount > 0 ? `${b.customerCount}人` : '—'}</td>
          </Fragment>
        )
      })}
      <td style={{ ...tdNumStyle, background:'#FBF8F2', fontWeight: isTotal ? 600 : 500 }}>
        {curMetric > 0 ? yen(curMetric) : '—'}
      </td>
      <td style={{ ...tdNumStyle, background:'#FBF8F2' }}>
        {total.customerCount > 0 ? `${total.customerCount}人` : '—'}
      </td>
      <td style={{ ...tdNumStyle, color: yoyColor(curMetric, prvMetric) }}>
        {prvMetric > 0 ? pct(curMetric, prvMetric) : '—'}
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
  // month
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
const thGroupStyle: React.CSSProperties = {
  ...thStyle, textAlign:'center',
}
const thTotalGroupStyle: React.CSSProperties = {
  ...thStyle, textAlign:'center', background:'#FBF8F2',
}
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
