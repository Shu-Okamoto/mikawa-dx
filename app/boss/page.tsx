'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

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
      minHeight:'100vh', fontFamily:'-apple-system,sans-serif' }}>
      読み込み中...
    </div>
  )

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:'-apple-system,sans-serif', background:'#F5F1EA' }}>
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
    <div style={{ fontFamily:'-apple-system,sans-serif', background:'#F5F1EA',
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

        {/* 売上KPI */}
        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ fontWeight:500, fontSize:'14px', marginBottom:'12px' }}>
            💰 本日の売上
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px',
            marginBottom:'16px' }}>
            {stores.map((s) => {
              const d = data?.sales[s]
              return kpiCard(
                s,
                d ? '¥' + d.amount.toLocaleString() : '未入力',
                d ? '客数:' + d.customerCount + '人' : '',
                !!d?.amount
              )
            })}
            {kpiCard(
              '2店合計',
              '¥' + totalAmount.toLocaleString(),
              '客数:' + totalCust + '人',
              totalAmount > 0
            )}
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

export default function BossPage() {
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        minHeight:'100vh', fontFamily:'-apple-system,sans-serif' }}>
        読み込み中...
      </div>
    }>
      <BossPageContent />
    </Suspense>
  )
}
