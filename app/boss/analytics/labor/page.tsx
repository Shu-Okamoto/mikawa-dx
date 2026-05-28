'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav } from '../../_shared'

interface Member {
  staffId     : number | null
  staffName   : string
  storeId     : number
  storeName   : string
  monthly     : Record<string, number | null>
  monthlyHours: Record<string, number>
  yearAvg     : number | null
  yearHours   : number
}

interface ApiData {
  year   : number
  members: Member[]
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function LaborContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const [data, setData]         = useState<ApiData | null>(null)
  const [fetching, setFetching] = useState(true)
  const [year, setYear]         = useState<number>(new Date().getFullYear())
  const [view, setView]         = useState<'month' | 'year'>('month')

  const fetchData = useCallback(async (y: number) => {
    setFetching(true)
    const res  = await authFetch(`/api/boss/analytics/labor?year=${y}`)
    const json = await res.json()
    setData(json)
    setFetching(false)
  }, [authFetch])

  useEffect(() => {
    if (loading || error) return
    fetchData(year)
  }, [loading, error, fetchData, year])

  if (loading) return <Center>読み込み中...</Center>
  if (error)   return <Center error>{error}</Center>

  const yearOptions = (() => {
    const cur = new Date().getFullYear()
    return [cur, cur - 1, cur - 2]
  })()

  // 店舗ごとにグループ
  const byStore: Record<string, Member[]> = {}
  for (const m of data?.members ?? []) {
    if (!byStore[m.storeName]) byStore[m.storeName] = []
    byStore[m.storeName].push(m)
  }
  for (const name of Object.keys(byStore)) {
    byStore[name].sort((a, b) => (b.yearAvg ?? 0) - (a.yearAvg ?? 0))
  }

  return (
    <div style={{ fontFamily:"-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA', minHeight:'100vh', paddingBottom:'24px' }}>

      <BossHeader title="⏱ 人時売分析"
        subtitle={`勤務日重み平均（実績シフト基準）${user?.name ? ' · ' + user.name : ''}`}
        onLogout={logout} />

      <BossNav active="/boss/analytics/labor" />

      <div style={{ padding:'12px' }}>

        <div style={{ background:'white', borderRadius:'16px', padding:'16px',
          marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>

          <div style={{ display:'flex', gap:'8px', marginBottom:'16px',
            flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ fontSize:'14px', color:'#888780', marginRight:'4px' }}>年</div>
            {yearOptions.map((y) => (
              <button key={y} onClick={() => setYear(y)}
                style={{ padding:'8px 14px',
                  background: y === year ? '#3B6D11' : '#F5F1EA',
                  color     : y === year ? 'white'   : '#2C2C2A',
                  border    : 'none', borderRadius:'8px',
                  fontSize  : '15px', cursor:'pointer',
                  fontFamily:'inherit' }}>{y}年</button>
            ))}

            <div style={{ marginLeft:'12px', fontSize:'14px',
              color:'#888780' }}>表示</div>
            <button onClick={() => setView('month')}
              style={tabStyle(view === 'month')}>月別</button>
            <button onClick={() => setView('year')}
              style={tabStyle(view === 'year')}>年間合計のみ</button>
          </div>

          {fetching ? (
            <div style={{ padding:'24px', textAlign:'center',
              color:'#888780', fontSize:'15px' }}>集計中...</div>
          ) : Object.keys(byStore).length === 0 ? (
            <div style={{ padding:'24px', textAlign:'center',
              color:'#888780', fontSize:'15px' }}>
              対象期間の実績シフトと日報がありません
            </div>
          ) : (
            Object.entries(byStore).map(([storeName, members]) => (
              <div key={storeName} style={{ marginBottom:'20px' }}>
                <div style={{ fontSize:'16px', fontWeight:500, marginBottom:'8px',
                  color:'#2C2C2A' }}>🏬 {storeName}</div>

                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse',
                    fontSize:'14px' }}>
                    <thead>
                      <tr style={{ background:'#F5F1EA' }}>
                        <th style={thStyle}>メンバー</th>
                        {view === 'month' && MONTHS.map((m) => (
                          <th key={m} style={thStyle}>{m}月</th>
                        ))}
                        <th style={thStyle}>年間平均</th>
                        <th style={thStyle}>年間時間</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => {
                        const key = `${m.storeId}:${m.staffId ?? m.staffName}`
                        return (
                          <tr key={key} style={{ borderBottom:'1px solid #F5F1EA' }}>
                            <td style={tdLeftStyle}>{m.staffName}</td>
                            {view === 'month' && MONTHS.map((mn) => {
                              const monthKey = `${year}-${String(mn).padStart(2, '0')}`
                              const v = m.monthly[monthKey]
                              const hours = m.monthlyHours[monthKey] ?? 0
                              return (
                                <td key={mn} style={tdStyle}
                                  title={hours > 0 ? `労働 ${hours.toFixed(1)}h` : ''}>
                                  {v == null ? '—' : '¥' + Math.round(v).toLocaleString()}
                                </td>
                              )
                            })}
                            <td style={{ ...tdStyle, fontWeight:500,
                              background:'#FAF8F2' }}>
                              {m.yearAvg == null
                                ? '—'
                                : '¥' + Math.round(m.yearAvg).toLocaleString()}
                            </td>
                            <td style={{ ...tdStyle, color:'#888780' }}>
                              {m.yearHours.toFixed(1)}h
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          <div style={{ marginTop:'16px', padding:'12px',
            background:'#FAF8F2', borderRadius:'8px',
            fontSize:'13px', color:'#555', lineHeight:1.6 }}>
            <div style={{ fontWeight:500, marginBottom:'4px' }}>計算式</div>
            メンバーの平均人時売 = Σ(店舗日次人時売 × メンバー労働時間) ÷ Σメンバー労働時間
            <br />
            ・店舗日次人時売 = 日報の売上 ÷ 実績シフト全員の労働時間合計
            <br />
            ・労働時間 = end - start − 休憩
          </div>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding:'8px 10px', textAlign:'right',
  fontSize:'13px', fontWeight:500, color:'#888780',
  whiteSpace:'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding:'8px 10px', textAlign:'right', whiteSpace:'nowrap',
}
const tdLeftStyle: React.CSSProperties = {
  ...tdStyle, textAlign:'left', fontWeight:500,
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding:'8px 14px',
    background: active ? '#3B6D11' : '#F5F1EA',
    color     : active ? 'white'   : '#2C2C2A',
    border:'none', borderRadius:'8px',
    fontSize:'15px', cursor:'pointer', fontFamily:'inherit',
  }
}

function Center({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh',
      color: error ? '#E24B4A' : '#888780',
      fontFamily:"-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      {children}
    </div>
  )
}

export default function LaborPage() {
  return (
    <Suspense fallback={<Center>読み込み中...</Center>}>
      <LaborContent />
    </Suspense>
  )
}
