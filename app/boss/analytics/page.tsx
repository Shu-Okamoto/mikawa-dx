'use client'

import { useEffect, useState, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav } from '../_shared'

interface PeriodBucket {
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
interface AnalyticsData {
  weekly : { label: string; byStore: Record<string, PeriodBucket> }
  monthly: { label: string; byStore: Record<string, PeriodBucket> }
  yearly : { label: string; byStore: Record<string, PeriodBucket> }
  dow    : { label: string; byStore: Record<string, DowEntry[]> }
}

function AnalyticsContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const [data, setData]       = useState<AnalyticsData | null>(null)
  const [fetching, setFetching] = useState(true)
  const [tab, setTab] = useState<'week' | 'month' | 'year' | 'dow'>('week')

  useEffect(() => {
    if (loading || error) return
    let cancelled = false
    const run = async () => {
      setFetching(true)
      try {
        const res  = await authFetch('/api/dashboard/sales-summary')
        const json = await res.json()
        if (!cancelled && !json.error) setData(json)
      } finally {
        if (!cancelled) setFetching(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [authFetch, loading, error])

  if (loading) return <Loading />
  if (error)   return <ErrorBox msg={error} />

  const stores = ['西店', '南店']

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA', minHeight:'100vh', paddingBottom:'24px' }}>
      <BossHeader title="📈 売上分析" subtitle={user?.name} onLogout={logout} />
      <BossNav active="/boss/analytics" />

      <div style={{ padding:'12px' }}>
        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'14px' }}>
            {([
              ['week' , '今週'],
              ['month', '今月'],
              ['year' , '今年'],
              ['dow'  , '曜日別'],
            ] as const).map(([key, label]) => {
              const active = tab === key
              return (
                <button key={key} onClick={() => setTab(key)}
                  style={{
                    padding:'8px 16px', borderRadius:'20px', fontSize:'14px',
                    fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                    border: active ? '1.5px solid #2C2C2A' : '1.5px solid #E5E1D8',
                    background: active ? '#2C2C2A' : 'white',
                    color    : active ? 'white'   : '#2C2C2A',
                  }}>{label}</button>
              )
            })}
          </div>

          {fetching && (
            <div style={{ padding:'24px', textAlign:'center', color:'#888780', fontSize:'13px' }}>
              読み込み中...
            </div>
          )}

          {!fetching && data && tab === 'week' && (
            <PeriodSummary label={data.weekly.label} byStore={data.weekly.byStore} stores={stores} />
          )}
          {!fetching && data && tab === 'month' && (
            <PeriodSummary label={data.monthly.label} byStore={data.monthly.byStore} stores={stores} />
          )}
          {!fetching && data && tab === 'year' && (
            <PeriodSummary label={data.yearly.label} byStore={data.yearly.byStore} stores={stores} />
          )}
          {!fetching && data && tab === 'dow' && (
            <DowSummary label={data.dow.label} byStore={data.dow.byStore} stores={stores} />
          )}
        </div>
      </div>
    </div>
  )
}

function PeriodSummary({
  label, byStore, stores,
}: { label: string; byStore: Record<string, PeriodBucket>; stores: string[] }) {
  const total: PeriodBucket = { amount: 0, souzai: 0, mochi: 0, hana: 0, customerCount: 0, days: 0 }
  stores.forEach((s) => {
    const b = byStore[s]
    if (!b) return
    total.amount        += b.amount
    total.souzai        += b.souzai
    total.mochi         += b.mochi
    total.hana          += b.hana
    total.customerCount += b.customerCount
    total.days           = Math.max(total.days, b.days)
  })

  const render = (name: string, b: PeriodBucket) => (
    <div key={name} style={{ marginBottom:'12px', paddingBottom:'12px',
      borderBottom:'1px solid #F5F1EA' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'baseline', marginBottom:'6px' }}>
        <span style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A' }}>{name}</span>
        <span style={{ fontSize:'12px', color:'#888780' }}>{b.days}営業日</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
        gap:'4px', fontSize:'13px' }}>
        <Stat label="売上合計" value={'¥' + b.amount.toLocaleString()} />
        <Stat label="客数合計" value={b.customerCount + '人'} />
        <Stat label="惣菜売上" value={'¥' + b.souzai.toLocaleString()} />
        <Stat label="餅売上"   value={'¥' + b.mochi.toLocaleString()} />
        <Stat label="花売上"   value={'¥' + b.hana.toLocaleString()} />
        <Stat label="客単価"   value={b.customerCount > 0
          ? '¥' + Math.round(b.amount / b.customerCount).toLocaleString() : '—'} />
        <Stat label="日商平均" value={b.days > 0
          ? '¥' + Math.round(b.amount / b.days).toLocaleString() : '—'} />
        <Stat label="日次客数" value={b.days > 0
          ? Math.round(b.customerCount / b.days) + '人' : '—'} />
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:'13px', color:'#888780', marginBottom:'12px' }}>{label}</div>
      {stores.map((s) => render(s, byStore[s] ?? { amount:0, souzai:0, mochi:0, hana:0, customerCount:0, days:0 }))}
      {render('🧮 2店合計', total)}
    </div>
  )
}

function DowSummary({
  label, byStore, stores,
}: { label: string; byStore: Record<string, DowEntry[]>; stores: string[] }) {
  const totalDow: DowEntry[] = Array.from({ length: 7 }, (_, i) => ({
    dow: i, label: ['日','月','火','水','木','金','土'][i], days: 0,
    totalAmount: 0, avgAmount: 0, avgSouzai: 0, avgMochi: 0, avgHana: 0, avgCustomer: 0,
  }))
  stores.forEach((s) => {
    const arr = byStore[s] ?? []
    arr.forEach((e) => {
      const t = totalDow[e.dow]
      t.totalAmount += e.totalAmount
      t.days = Math.max(t.days, e.days)
      t.avgAmount   += e.avgAmount
      t.avgSouzai   += e.avgSouzai
      t.avgMochi    += e.avgMochi
      t.avgHana     += e.avgHana
      t.avgCustomer += e.avgCustomer
    })
  })

  const maxAvg = Math.max(
    ...stores.flatMap((s) => (byStore[s] ?? []).map((e) => e.avgAmount)),
    ...totalDow.map((e) => e.avgAmount),
    1,
  )

  const SEGMENTS = [
    { key: 'souzai', label: '惣菜', color: '#639922' },
    { key: 'mochi' , label: '餅'  , color: '#1A5276' },
    { key: 'hana'  , label: '花'  , color: '#E67E22' },
    { key: 'other' , label: 'その他', color: '#A8A69E' },
  ] as const

  const segValues = (e: DowEntry) => ({
    souzai: e.avgSouzai,
    mochi : e.avgMochi,
    hana  : e.avgHana,
    other : Math.max(0, e.avgAmount - e.avgSouzai - e.avgMochi - e.avgHana),
  })

  const renderStore = (name: string, arr: DowEntry[]) => (
    <div key={name} style={{ marginBottom:'14px', paddingBottom:'12px',
      borderBottom:'1px solid #F5F1EA' }}>
      <div style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A',
        marginBottom:'8px' }}>{name}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        {arr.map((e) => {
          const isSun = e.dow === 0
          const isSat = e.dow === 6
          const labelColor = isSun ? '#E24B4A' : isSat ? '#1A6FAF' : '#2C2C2A'
          const segs = segValues(e)
          return (
            <div key={e.dow} style={{ display:'grid',
              gridTemplateColumns:'30px 1fr 120px', gap:'8px',
              alignItems:'center', fontSize:'13px' }}>
              <span style={{ fontWeight:500, color: labelColor }}>{e.label}</span>
              <div style={{ background:'#F5F1EA', borderRadius:'4px',
                height:'20px', overflow:'hidden', position:'relative',
                display:'flex' }}>
                {SEGMENTS.map((seg) => {
                  const v = segs[seg.key]
                  const w = v > 0 ? (v / maxAvg) * 100 : 0
                  if (w === 0) return null
                  const tip = `${seg.label}: ¥${v.toLocaleString()}`
                  return (
                    <div key={seg.key} title={tip}
                      style={{ width: w + '%', height:'100%',
                        background: seg.color, transition:'width .25s' }} />
                  )
                })}
              </div>
              <div style={{ textAlign:'right' }}>
                {e.days > 0 ? (
                  <>
                    <span style={{ fontWeight:500 }}>¥{e.avgAmount.toLocaleString()}</span>
                    <span style={{ color:'#888780', marginLeft:'6px' }}>
                      {e.avgCustomer}人
                    </span>
                  </>
                ) : (
                  <span style={{ color:'#B4B2A9' }}>—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:'13px', color:'#888780', marginBottom:'8px' }}>
        {label}
      </div>
      {/* 凡例 */}
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap',
        marginBottom:'14px', fontSize:'12px', color:'#888780' }}>
        {SEGMENTS.map((seg) => (
          <span key={seg.key} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            <span style={{ width:'12px', height:'12px', borderRadius:'2px',
              background: seg.color, display:'inline-block' }} />
            {seg.label}
          </span>
        ))}
      </div>
      {stores.map((s) => renderStore(s, byStore[s] ?? []))}
      {renderStore('🧮 2店合計', totalDow)}
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

function Loading() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      読み込み中...
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA' }}>
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', maxWidth:'320px' }}>
        <p style={{ fontSize:'16px', fontWeight:500, color:'#E24B4A' }}>{msg}</p>
      </div>
    </div>
  )
}

export default function BossAnalyticsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AnalyticsContent />
    </Suspense>
  )
}
