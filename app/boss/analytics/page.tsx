'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav } from '../_shared'

type Granularity = 'year' | 'month' | 'week'

interface Bucket {
  amount       : number
  souzai       : number
  mochi        : number
  hana         : number
  customerCount: number
  days         : number
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

interface ApiData {
  granularity: Granularity
  ref        : string
  start      : string
  end        : string
  label      : string
  total      : { byStore: Record<string, Bucket> }
  dow?       : { byStore: Record<string, DowEntry[]> }
}

const STORES = ['西店', '南店']

const SEGMENTS = [
  { key: 'souzai', label: '惣菜',   color: '#639922' },
  { key: 'mochi' , label: '餅'  ,   color: '#1A5276' },
  { key: 'hana'  , label: '花'  ,   color: '#E67E22' },
  { key: 'other' , label: 'その他', color: '#A8A69E' },
] as const

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function shiftRef(ref: string, g: Granularity, dir: -1 | 1): string {
  const [y, m, d] = ref.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (g === 'year')  date.setFullYear(date.getFullYear() + dir)
  if (g === 'month') date.setMonth(date.getMonth() + dir)
  if (g === 'week')  date.setDate(date.getDate() + 7 * dir)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function weekStartOf(ref: string): string {
  const [y, m, d] = ref.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const offset = (date.getDay() + 6) % 7 // 月曜始まり
  date.setDate(date.getDate() - offset)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// 表示順: 月→日 (JS getDay基準で 1,2,3,4,5,6,0)
const DOW_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

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

  const totalAll: Bucket = { amount: 0, souzai: 0, mochi: 0, hana: 0, customerCount: 0, days: 0 }
  STORES.forEach((s) => {
    const b = data?.total.byStore[s]
    if (!b) return
    totalAll.amount        += b.amount
    totalAll.souzai        += b.souzai
    totalAll.mochi         += b.mochi
    totalAll.hana          += b.hana
    totalAll.customerCount += b.customerCount
    totalAll.days = Math.max(totalAll.days, b.days)
  })

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
              ['year' , '年'],
              ['month', '月'],
              ['week' , '週'],
            ] as const).map(([key, label]) => {
              const active = granularity === key
              return (
                <button key={key} onClick={() => setGranularity(key)}
                  style={{
                    padding:'8px 16px', borderRadius:'20px', fontSize:'15px',
                    fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                    border: active ? '1.5px solid #2C2C2A' : '1.5px solid #E5E1D8',
                    background: active ? '#2C2C2A' : 'white',
                    color    : active ? 'white'   : '#2C2C2A',
                  }}>{label}</button>
              )
            })}
            <button onClick={() => setRef(todayYmd())}
              style={{ padding:'8px 14px', borderRadius:'20px', fontSize:'14px',
                fontFamily:'inherit', cursor:'pointer',
                border:'1.5px solid #E5E1D8', background:'#F5F1EA',
                color:'#2C2C2A', marginLeft:'auto' }}>
              今日
            </button>
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

          {/* 粒度ごとのピッカー */}
          <div style={{ marginTop:'12px', display:'flex',
            justifyContent:'center' }}>
            <PeriodPicker granularity={granularity} ref_={ref}
              onChange={setRef} />
          </div>
        </div>

        {/* 売上合計 */}
        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ fontWeight:500, fontSize:'16px', marginBottom:'12px' }}>
            💰 売上合計
          </div>
          {fetching ? (
            <div style={{ padding:'24px', textAlign:'center',
              color:'#888780', fontSize:'15px' }}>読み込み中...</div>
          ) : (
            <>
              {STORES.map((s) => (
                <StoreBucket key={s} name={s}
                  bucket={data?.total.byStore[s] ??
                    { amount:0, souzai:0, mochi:0, hana:0, customerCount:0, days:0 }} />
              ))}
              <StoreBucket name="🧮 2店合計" bucket={totalAll} />
            </>
          )}
        </div>

        {/* 曜日別グラフ */}
        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ fontWeight:500, fontSize:'16px', marginBottom:'4px' }}>
            📊 曜日別 1日平均売上
          </div>
          <div style={{ fontSize:'13px', color:'#888780', marginBottom:'12px' }}>
            ※ {data?.label} 内の各曜日の1日あたり平均
          </div>

          <Legend />

          {fetching ? (
            <div style={{ padding:'24px', textAlign:'center',
              color:'#888780', fontSize:'15px' }}>読み込み中...</div>
          ) : (
            <>
              {STORES.map((s) => (
                <DowBarChart key={s} name={s}
                  entries={reorderDow(data?.dow?.byStore[s] ?? emptyDow())} />
              ))}
            </>
          )}
        </div>

      </div>
    </div>
  )
}

function emptyDow(): DowEntry[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dow: i, label: ['日','月','火','水','木','金','土'][i], days: 0,
    totalAmount: 0, avgAmount: 0, avgSouzai: 0, avgMochi: 0, avgHana: 0, avgCustomer: 0,
  }))
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

function StoreBucket({ name, bucket }: { name: string; bucket: Bucket }) {
  return (
    <div style={{ marginBottom:'12px', paddingBottom:'12px',
      borderBottom:'1px solid #F5F1EA' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'baseline', marginBottom:'6px' }}>
        <span style={{ fontSize:'15px', fontWeight:500, color:'#2C2C2A' }}>{name}</span>
        <span style={{ fontSize:'13px', color:'#888780' }}>{bucket.days}営業日</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
        gap:'4px', fontSize:'14px' }}>
        <Stat label="売上合計" value={'¥' + bucket.amount.toLocaleString()} />
        <Stat label="客数合計" value={bucket.customerCount + '人'} />
        <Stat label="惣菜売上" value={'¥' + bucket.souzai.toLocaleString()} />
        <Stat label="餅売上"   value={'¥' + bucket.mochi.toLocaleString()} />
        <Stat label="花売上"   value={'¥' + bucket.hana.toLocaleString()} />
        <Stat label="客単価"   value={bucket.customerCount > 0
          ? '¥' + Math.round(bucket.amount / bucket.customerCount).toLocaleString() : '—'} />
        <Stat label="日商平均" value={bucket.days > 0
          ? '¥' + Math.round(bucket.amount / bucket.days).toLocaleString() : '—'} />
        <Stat label="日次客数" value={bucket.days > 0
          ? Math.round(bucket.customerCount / bucket.days) + '人' : '—'} />
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

  if (granularity === 'month') {
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

  // week: 開始日を表示するdate input
  const weekStart = weekStartOf(ref_)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
      <span style={{ fontSize:'13px', color:'#888780' }}>週開始(月)</span>
      <input type="date" value={weekStart}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        style={pickerStyle} />
    </div>
  )
}

const pickerStyle: React.CSSProperties = {
  padding:'10px 14px', fontSize:'15px',
  border:'1.5px solid #E5E1D8', borderRadius:'10px',
  background:'white', fontFamily:'inherit',
  color:'#2C2C2A', cursor:'pointer',
}

function DowBarChart({ name, entries }: { name: string; entries: DowEntry[] }) {
  const maxAmount = Math.max(...entries.map((e) => e.avgAmount), 1)

  const seg = (e: DowEntry) => ({
    souzai: e.avgSouzai,
    mochi : e.avgMochi,
    hana  : e.avgHana,
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
            <div key={e.dow} style={{ display:'flex', alignItems:'center',
              gap:'8px' }}>
              {/* 曜日 */}
              <div style={{ width:'28px', fontSize:'14px', fontWeight:600,
                color: labelColor, textAlign:'center', flexShrink:0 }}>
                {e.label}
              </div>

              {/* バー本体 */}
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
                      return (
                        <div key={s.key}
                          title={`${s.label} ¥${v.toLocaleString()} (${pct.toFixed(0)}%)`}
                          style={{ width: pct + '%', background: s.color,
                            display:'flex', alignItems:'center',
                            justifyContent:'center',
                            color:'white', fontSize:'11px', fontWeight:600,
                            overflow:'hidden' }}>
                          {pct >= 12 ? `${pct.toFixed(0)}%` : ''}
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* 金額ラベル（バー右端の外側または内側） */}
                <div style={{ position:'absolute', top:0, bottom:0,
                  left: widthPct > 60 ? '6px' : (widthPct + 1) + '%',
                  display:'flex', alignItems:'center',
                  fontSize:'12px', fontWeight:600,
                  color: widthPct > 60 ? 'white' : '#2C2C2A',
                  textShadow: widthPct > 60
                    ? '0 1px 2px rgba(0,0,0,.25)' : 'none',
                  pointerEvents:'none', whiteSpace:'nowrap' }}>
                  {total > 0 ? '¥' + Math.round(total).toLocaleString() : '—'}
                </div>
              </div>

              {/* 営業日数・客数 */}
              <div style={{ width:'70px', fontSize:'11px', color:'#888780',
                textAlign:'right', flexShrink:0, lineHeight:1.3 }}>
                {e.days > 0 ? (
                  <>
                    <div>{e.avgCustomer}人</div>
                    <div>{e.days}日</div>
                  </>
                ) : '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between',
      padding:'6px 10px', background:'#FAFAFA', borderRadius:'6px' }}>
      <span style={{ color:'#888780' }}>{label}</span>
      <span style={{ fontWeight:500, color:'#2C2C2A' }}>{value}</span>
    </div>
  )
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
