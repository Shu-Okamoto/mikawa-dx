'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossNav } from './_shared'

interface DashboardData {
  date       : string
  storeStatus: { A: boolean; B: boolean; C: boolean }
  hqStatus   : { veg: boolean; fruit: boolean; mochi: boolean }
  sales      : Record<string, {
    amount: number; souzai: number; mochi: number; hana: number
    customerCount: number; staffMorning: number; staffAfternoon: number
  }>
  logs: { who: string; time: string }[]
}

function BossPageContent() {
  const router = useRouter()
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const [data, setData]       = useState<DashboardData | null>(null)
  const [fetching, setFetching] = useState(true)

  const fetchDashboard = useCallback(async () => {
    if (!user) return
    setFetching(true)
    const res  = await authFetch('/api/dashboard')
    const json = await res.json()
    setData(json)
    setFetching(false)
  }, [user])

  useEffect(() => {
    if (loading) return
    if (error) { setFetching(false); return }
    fetchDashboard()
  }, [loading, error, fetchDashboard])

  if (loading || fetching) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      読み込み中...
    </div>
  )

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA' }}>
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', maxWidth:'320px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🚫</div>
        <p style={{ fontSize:'16px', fontWeight:500, color:'#E24B4A',
          marginBottom:'8px' }}>{error}</p>
        <p style={{ fontSize:'13px', color:'#888780', marginBottom:'24px' }}>
          LINEで「ログイン」と送信して<br />正しいURLからアクセスしてください
        </p>
        <button onClick={() => router.push('/')}
          style={{ padding:'12px 24px', background:'#3B6D11', color:'white',
            border:'none', borderRadius:'10px', fontSize:'14px',
            cursor:'pointer', fontFamily:'inherit' }}>
          トップに戻る
        </button>
      </div>
    </div>
  )

  const today = new Date()
  const dateStr = today.getFullYear() + '年' +
    (today.getMonth()+1) + '月' + today.getDate() + '日'

  // 売上集計
  const stores    = ['西店', '南店']
  let totalAmount = 0
  let totalSouzai = 0
  let totalMochi  = 0
  let totalHana   = 0
  let totalCust   = 0

  stores.forEach((s) => {
    const d = data?.sales[s]
    if (d) {
      totalAmount += d.amount
      totalSouzai += d.souzai
      totalMochi  += d.mochi
      totalHana   += d.hana
      totalCust   += d.customerCount
    }
  })

  // 円グラフ生成
  const makePieChart = (storeName: string) => {
    const d = data?.sales[storeName]
    if (!d || d.amount === 0) return null

    const souzai = d.souzai || 0
    const mochi  = d.mochi  || 0
    const hana   = d.hana   || 0
    const other  = Math.max(0, d.amount - souzai - mochi - hana)
    const total  = souzai + mochi + hana + other
    if (total === 0) return null

    const colors  = ['#639922','#1A5276','#E67E22','#888780']
    const labels  = ['惣菜','餅','花','野菜・果物他']
    const values  = [souzai, mochi, hana, other]
    const cx = 80, cy = 80, r = 60
    let startAngle = -Math.PI / 2
    let paths = ''

    values.forEach((v, i) => {
      if (v <= 0) return
      const angle    = (v / total) * 2 * Math.PI
      const endAngle = startAngle + angle
      const x1 = cx + r * Math.cos(startAngle)
      const y1 = cy + r * Math.sin(startAngle)
      const x2 = cx + r * Math.cos(endAngle)
      const y2 = cy + r * Math.sin(endAngle)
      const la = angle > Math.PI ? 1 : 0
      paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${la},1 ${x2},${y2} Z" fill="${colors[i]}"/>`
      startAngle = endAngle
    })

    const legend = labels.map((l, i) => {
      if (values[i] <= 0) return ''
      const pct = Math.round(values[i] / total * 100)
      return `<div style="display:flex;align-items:center;gap:4px;font-size:10px;">
        <span style="width:8px;height:8px;border-radius:2px;background:${colors[i]};display:inline-block;"></span>
        <span>${l} ${pct}%</span>
        <span style="color:#888780;">¥${values[i].toLocaleString()}</span>
      </div>`
    }).join('')

    return { paths, legend, d }
  }

  const kpiCard = (label: string, value: string, sub: string, ok: boolean) => (
    <div style={{ background: ok ? '#EAF3DE' : '#F5F1EA',
      borderRadius:'12px', padding:'12px 16px' }}>
      <div style={{ fontSize:'11px', color:'#888780', marginBottom:'4px' }}>{label}</div>
      <div style={{ fontSize:'18px', fontWeight:500,
        color: ok ? '#3B6D11' : '#888780' }}>{value}</div>
      {sub && <div style={{ fontSize:'11px', color:'#888780', marginTop:'2px' }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      {/* ヘッダー */}
      <div style={{ background:'linear-gradient(135deg,#2C2C2A,#444441)',
        color:'white', padding:'20px 16px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:'11px', opacity:.8 }}>経営ダッシュボード</div>
            <div style={{ fontSize:'20px', fontWeight:500 }}>📊 社長画面</div>
            <div style={{ fontSize:'12px', opacity:.7, marginTop:'2px' }}>{dateStr}</div>
          </div>
          <button onClick={logout}
            style={{ padding:'8px 14px', background:'rgba(255,255,255,.2)',
              border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
              color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
            終了する
          </button>
        </div>
      </div>

      <BossNav active="/boss" />

      <div style={{ padding:'12px' }}>

        {/* 発注状況KPI */}
        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ fontWeight:500, fontSize:'14px', marginBottom:'12px' }}>
            📦 本日の発注状況
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px',
            marginBottom:'12px' }}>
            {kpiCard('西店', data?.storeStatus.A ? '✅ 送信済' : '⏳ 未送信', '', !!data?.storeStatus.A)}
            {kpiCard('南店', data?.storeStatus.B ? '✅ 送信済' : '⏳ 未送信', '', !!data?.storeStatus.B)}
            {kpiCard('本部', data?.storeStatus.C ? '✅ 送信済' : '⏳ 未送信', '', !!data?.storeStatus.C)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
            {kpiCard('野菜発注', data?.hqStatus.veg   ? '✅ 確定済' : '⏳ 未確定', '', !!data?.hqStatus.veg)}
            {kpiCard('果物発注', data?.hqStatus.fruit ? '✅ 確定済' : '⏳ 未確定', '', !!data?.hqStatus.fruit)}
            {kpiCard('餅・乾物', data?.hqStatus.mochi ? '✅ 確定済' : '⏳ 未確定', '', !!data?.hqStatus.mochi)}
          </div>
        </div>

        {/* 売上実績 全項目 */}
        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ fontWeight:500, fontSize:'14px', marginBottom:'12px' }}>
            💰 本日の売上実績
          </div>
          {stores.map((s) => {
            const d = data?.sales[s] as any
            return (
              <div key={s} style={{ marginBottom:'12px', paddingBottom:'12px',
                borderBottom:'1px solid #F5F1EA' }}>
                <div style={{ fontSize:'13px', fontWeight:500, color:'#2C2C2A',
                  marginBottom:'6px' }}>{s}</div>
                {d ? (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
                    gap:'4px', fontSize:'12px' }}>
                    <FullStat label="売上金額" value={'¥' + d.amount.toLocaleString()} />
                    <FullStat label="客数"     value={d.customerCount + '人'} />
                    <FullStat label="惣菜売上" value={'¥' + d.souzai.toLocaleString()} />
                    <FullStat label="餅売上"   value={'¥' + d.mochi.toLocaleString()} />
                    <FullStat label="花売上"   value={'¥' + d.hana.toLocaleString()} />
                    <FullStat label="客単価"   value={d.customerCount > 0
                      ? '¥' + Math.round(d.amount / d.customerCount).toLocaleString()
                      : '—'} />
                    <FullStat label="出勤前半" value={String(d.staffMorning)} />
                    <FullStat label="出勤後半" value={String(d.staffAfternoon)} />
                    {d.notes && (
                      <div style={{ gridColumn:'1 / -1', padding:'6px 8px',
                        background:'#FAFAFA', borderRadius:'6px',
                        fontSize:'11px', color:'#555' }}>
                        📝 {d.notes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize:'12px', color:'#888780' }}>未入力</div>
                )}
              </div>
            )
          })}
          <div style={{ marginBottom:'8px' }}>
            <div style={{ fontSize:'13px', fontWeight:500, color:'#2C2C2A',
              marginBottom:'6px' }}>🧮 2店合計</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
              gap:'4px', fontSize:'12px' }}>
              <FullStat label="売上金額" value={'¥' + totalAmount.toLocaleString()} />
              <FullStat label="客数"     value={totalCust + '人'} />
              <FullStat label="惣菜売上" value={'¥' + totalSouzai.toLocaleString()} />
              <FullStat label="餅売上"   value={'¥' + totalMochi.toLocaleString()} />
              <FullStat label="花売上"   value={'¥' + totalHana.toLocaleString()} />
              <FullStat label="客単価"   value={totalCust > 0
                ? '¥' + Math.round(totalAmount / totalCust).toLocaleString()
                : '—'} />
            </div>
          </div>
          {/* 円グラフ */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
            {[...stores, '合計'].map((name) => {
              let chartData
              if (name === '合計') {
                const d = {
                  amount: totalAmount, souzai: totalSouzai,
                  mochi : totalMochi,  hana  : totalHana,
                  customerCount: totalCust,
                  staffMorning: 0, staffAfternoon: 0,
                }
                chartData = makePieChart('合計')
                if (!chartData && totalAmount > 0) {
                  // 合計用に再計算
                  const other = Math.max(0, totalAmount - totalSouzai - totalMochi - totalHana)
                  const total = totalSouzai + totalMochi + totalHana + other
                  const colors = ['#639922','#1A5276','#E67E22','#888780']
                  const values = [totalSouzai, totalMochi, totalHana, other]
                  const labels = ['惣菜','餅','花','野菜・果物他']
                  const cx = 80, cy = 80, r = 60
                  let startAngle = -Math.PI / 2
                  let paths = ''
                  values.forEach((v, i) => {
                    if (v <= 0) return
                    const angle    = (v / total) * 2 * Math.PI
                    const endAngle = startAngle + angle
                    const x1 = cx + r * Math.cos(startAngle)
                    const y1 = cy + r * Math.sin(startAngle)
                    const x2 = cx + r * Math.cos(endAngle)
                    const y2 = cy + r * Math.sin(endAngle)
                    const la = angle > Math.PI ? 1 : 0
                    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${la},1 ${x2},${y2} Z" fill="${colors[i]}"/>`
                    startAngle = endAngle
                  })
                  const legend = labels.map((l, i) => {
                    if (values[i] <= 0) return ''
                    const pct = Math.round(values[i] / total * 100)
                    return `<div style="display:flex;align-items:center;gap:4px;font-size:10px;">
                      <span style="width:8px;height:8px;border-radius:2px;background:${colors[i]};display:inline-block;"></span>
                      <span>${l} ${pct}%</span>
                      <span style="color:#888780;">¥${values[i].toLocaleString()}</span>
                    </div>`
                  }).join('')
                  chartData = { paths, legend, d }
                }
              } else {
                chartData = makePieChart(name)
              }

              if (!chartData) return (
                <div key={name} style={{ textAlign:'center', padding:'20px',
                  background:'#F5F1EA', borderRadius:'12px' }}>
                  <div style={{ fontSize:'13px', fontWeight:500, marginBottom:'8px' }}>{name}</div>
                  <div style={{ fontSize:'12px', color:'#888780' }}>未入力</div>
                </div>
              )

              return (
                <div key={name} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'13px', fontWeight:500, marginBottom:'8px' }}>{name}</div>
                  <svg width="160" height="160" viewBox="0 0 160 160"
                    style={{ maxWidth:'100%' }}>
                    <g dangerouslySetInnerHTML={{ __html: chartData.paths }} />
                    <circle cx="80" cy="80" r="35" fill="white" />
                    <text x="80" y="74" textAnchor="middle" fontSize="9" fill="#888780">売上</text>
                    <text x="80" y="86" textAnchor="middle" fontSize="10"
                      fontWeight="500" fill="#2C2C2A">
                      ¥{chartData.d.amount.toLocaleString()}
                    </text>
                    <text x="80" y="98" textAnchor="middle" fontSize="9" fill="#888780">
                      {chartData.d.customerCount}人
                    </text>
                  </svg>
                  <div style={{ marginTop:'4px', textAlign:'left', padding:'0 4px' }}
                    dangerouslySetInnerHTML={{ __html: chartData.legend }} />
                </div>
              )
            })}
          </div>
        </div>

        {/* 売上分析（月次・年次・曜日別） */}
        <SalesAnalytics />

        {/* 入力ログ */}
        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ fontWeight:500, fontSize:'14px', marginBottom:'12px' }}>
            📋 本日の入力状況
          </div>
          {data?.logs && data.logs.length > 0 ? (
            data.logs.map((log, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between',
                padding:'8px 0', borderBottom:'1px solid #F5F1EA',
                fontSize:'13px' }}>
                <span style={{ fontWeight:500 }}>{log.who}</span>
                <span style={{ color:'#888780' }}>
                  {log.time ? new Date(log.time).toLocaleTimeString('ja-JP',
                    { hour:'2-digit', minute:'2-digit' }) : ''}
                </span>
              </div>
            ))
          ) : (
            <div style={{ color:'#888780', fontSize:'13px', textAlign:'center',
              padding:'16px' }}>
              本日の入力はまだありません
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

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
  monthly: { label: string; byStore: Record<string, PeriodBucket> }
  yearly : { label: string; byStore: Record<string, PeriodBucket> }
  dow    : { label: string; byStore: Record<string, DowEntry[]> }
}

function SalesAnalytics() {
  const { authFetch } = useAuth('all')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'month' | 'year' | 'dow'>('month')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const res  = await authFetch('/api/dashboard/sales-summary')
        const json = await res.json()
        if (!cancelled && !json.error) setData(json)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [authFetch])

  const stores = ['西店', '南店']

  return (
    <div style={{ background:'white', borderRadius:'16px', padding:'16px',
      marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
        <div style={{ fontWeight:500, fontSize:'14px' }}>📈 売上分析</div>
        <div style={{ display:'flex', gap:'6px' }}>
          {([
            ['month', '今月'],
            ['year' , '今年'],
            ['dow'  , '曜日別'],
          ] as const).map(([key, label]) => {
            const active = tab === key
            return (
              <button key={key} onClick={() => setTab(key)}
                style={{
                  padding:'6px 14px', borderRadius:'20px', fontSize:'13px',
                  fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                  border: active ? '1.5px solid #2C2C2A' : '1.5px solid #E5E1D8',
                  background: active ? '#2C2C2A' : 'white',
                  color    : active ? 'white'   : '#2C2C2A',
                }}>{label}</button>
            )
          })}
        </div>
      </div>

      {loading && (
        <div style={{ padding:'24px', textAlign:'center', color:'#888780', fontSize:'13px' }}>
          読み込み中...
        </div>
      )}

      {!loading && data && tab === 'month' && (
        <PeriodSummary label={data.monthly.label} byStore={data.monthly.byStore} stores={stores} />
      )}
      {!loading && data && tab === 'year' && (
        <PeriodSummary label={data.yearly.label} byStore={data.yearly.byStore} stores={stores} />
      )}
      {!loading && data && tab === 'dow' && (
        <DowSummary label={data.dow.label} byStore={data.dow.byStore} stores={stores} />
      )}
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
        <span style={{ fontSize:'13px', fontWeight:500, color:'#2C2C2A' }}>{name}</span>
        <span style={{ fontSize:'11px', color:'#888780' }}>{b.days}営業日</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
        gap:'4px', fontSize:'12px' }}>
        <FullStat label="売上合計" value={'¥' + b.amount.toLocaleString()} />
        <FullStat label="客数合計" value={b.customerCount + '人'} />
        <FullStat label="惣菜売上" value={'¥' + b.souzai.toLocaleString()} />
        <FullStat label="餅売上"   value={'¥' + b.mochi.toLocaleString()} />
        <FullStat label="花売上"   value={'¥' + b.hana.toLocaleString()} />
        <FullStat label="客単価"   value={b.customerCount > 0
          ? '¥' + Math.round(b.amount / b.customerCount).toLocaleString() : '—'} />
        <FullStat label="日商平均" value={b.days > 0
          ? '¥' + Math.round(b.amount / b.days).toLocaleString() : '—'} />
        <FullStat label="日次客数" value={b.days > 0
          ? Math.round(b.customerCount / b.days) + '人' : '—'} />
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize:'12px', color:'#888780', marginBottom:'10px' }}>{label}</div>
      {stores.map((s) => render(s, byStore[s] ?? { amount:0, souzai:0, mochi:0, hana:0, customerCount:0, days:0 }))}
      {render('🧮 2店合計', total)}
    </div>
  )
}

function DowSummary({
  label, byStore, stores,
}: { label: string; byStore: Record<string, DowEntry[]>; stores: string[] }) {
  // 2店合計の曜日別を計算
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
      // 平均は集約後に再計算しない（複数店の単純合算）
      t.avgAmount   += e.avgAmount
      t.avgSouzai   += e.avgSouzai
      t.avgMochi    += e.avgMochi
      t.avgHana     += e.avgHana
      t.avgCustomer += e.avgCustomer
    })
  })

  // 最大値（バー幅用）
  const maxAvg = Math.max(
    ...stores.flatMap((s) => (byStore[s] ?? []).map((e) => e.avgAmount)),
    ...totalDow.map((e) => e.avgAmount),
    1,
  )

  const renderStore = (name: string, arr: DowEntry[]) => (
    <div key={name} style={{ marginBottom:'14px', paddingBottom:'12px',
      borderBottom:'1px solid #F5F1EA' }}>
      <div style={{ fontSize:'13px', fontWeight:500, color:'#2C2C2A',
        marginBottom:'8px' }}>{name}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        {arr.map((e) => {
          const widthPct = e.avgAmount > 0 ? (e.avgAmount / maxAvg) * 100 : 0
          const isSun    = e.dow === 0
          const isSat    = e.dow === 6
          const labelColor = isSun ? '#E24B4A' : isSat ? '#1A6FAF' : '#2C2C2A'
          return (
            <div key={e.dow} style={{ display:'grid',
              gridTemplateColumns:'30px 1fr 110px', gap:'8px',
              alignItems:'center', fontSize:'12px' }}>
              <span style={{ fontWeight:500, color: labelColor }}>{e.label}</span>
              <div style={{ background:'#F5F1EA', borderRadius:'4px',
                height:'18px', overflow:'hidden', position:'relative' }}>
                <div style={{ width: widthPct + '%', height:'100%',
                  background:'#639922', transition:'width .25s' }} />
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
      <div style={{ fontSize:'12px', color:'#888780', marginBottom:'10px' }}>
        {label}（バーは平均売上）
      </div>
      {stores.map((s) => renderStore(s, byStore[s] ?? []))}
      {renderStore('🧮 2店合計', totalDow)}
    </div>
  )
}

function FullStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between',
      padding:'5px 8px', background:'#FAFAFA', borderRadius:'6px' }}>
      <span style={{ color:'#888780' }}>{label}</span>
      <span style={{ fontWeight:500, color:'#2C2C2A' }}>{value}</span>
    </div>
  )
}

export default function BossPage() {
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
        読み込み中...
      </div>
    }>
      <BossPageContent />
    </Suspense>
  )
}
