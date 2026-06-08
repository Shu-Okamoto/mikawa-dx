'use client'

import { useCallback, useEffect, useState } from 'react'

interface StoreData {
  slug         : string
  name         : string
  salesActual  : number | null
  salesForecast: number | null
  customerCount: number | null
  weather      : string | null
  laborHours   : number | null
  salesPerHour : number | null
}
interface ApiData {
  today            : string
  stores           : StoreData[]
  totalActual      : number
  totalHours       : number
  totalSalesPerHour: number | null
}

const WEATHER_EMOJI: Record<string, string> = {
  '晴': '☀️', '曇': '☁️', '雨': '🌧️', '雪': '❄️',
}

function yen(n: number | null): string {
  if (n == null) return '—'
  return '¥' + Math.round(n).toLocaleString('ja-JP')
}

function hours(n: number | null): string {
  if (n == null || n <= 0) return '—'
  return `${n.toFixed(1)}時間`
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()]
  return `${y}年${m}月${d}日 (${dow})`
}

export default function PublicDashboardPage() {
  const [data, setData]           = useState<ApiData | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string>('')

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/public-dashboard', { cache: 'no-store' })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      setData(json)
      setError(null)
      const n = new Date()
      setUpdatedAt(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`)
    } catch {
      setError('読み込みに失敗しました')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div style={{
      minHeight : '100vh',
      background: '#F5F1EA',
      fontFamily: "'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      color     : '#2C2C2A',
      padding   : '24px 16px',
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* ヘッダー */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '15px', color: '#888780', marginBottom: '4px' }}>
            🏪 里の味みかわ
          </div>
          <h1 style={{ fontSize: '30px', fontWeight: 600, margin: '0 0 6px' }}>
            本日の売上
          </h1>
          <div style={{ fontSize: '17px', color: '#555' }}>
            {data ? fmtDate(data.today) : '—'}
          </div>
          {updatedAt && (
            <div style={{ fontSize: '13px', color: '#A8A69E', marginTop: '4px' }}>
              {updatedAt} 更新
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '40px',
            textAlign: 'center', color: '#E24B4A' }}>
            {error}
          </div>
        )}

        {!error && !data && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '40px',
            textAlign: 'center', color: '#888780' }}>
            読み込み中...
          </div>
        )}

        {!error && data && (
          <>
            {/* 店舗カード */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {data.stores.map((s) => (
                <div key={s.slug} style={{
                  flex        : '1 1 240px',
                  background   : 'white',
                  borderRadius : '20px',
                  padding      : '24px',
                  boxShadow    : '0 2px 10px rgba(0,0,0,.05)',
                  textAlign    : 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 600 }}>{s.name}</span>
                    {s.weather && (
                      <span style={{ fontSize: '22px' }} title={s.weather}>
                        {WEATHER_EMOJI[s.weather] ?? ''}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '40px', fontWeight: 700, letterSpacing: '-1px',
                    color: s.salesActual == null ? '#B8B5AC' : '#1A5276',
                  }}>
                    {yen(s.salesActual)}
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '14px', color: '#888780',
                    display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <span>客数 {s.customerCount != null ? `${s.customerCount}人` : '—'}</span>
                    <span>予測 {yen(s.salesForecast)}</span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '14px', color: '#888780',
                    display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <span>時間数 {hours(s.laborHours)}</span>
                    <span>人時売 {yen(s.salesPerHour)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 合計 */}
            <div style={{
              marginTop   : '16px',
              background   : '#1A5276',
              borderRadius : '20px',
              padding      : '20px 24px',
              color        : 'white',
              display      : 'flex',
              alignItems   : 'center',
              justifyContent: 'space-between',
              boxShadow    : '0 2px 10px rgba(0,0,0,.08)',
            }}>
              <span style={{ fontSize: '18px', fontWeight: 600 }}>本部合計</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '34px', fontWeight: 700, letterSpacing: '-1px' }}>
                  {yen(data.totalActual)}
                </div>
                <div style={{ fontSize: '13px', opacity: .85, marginTop: '2px' }}>
                  時間数 {hours(data.totalHours)} ・ 人時売 {yen(data.totalSalesPerHour)}
                </div>
              </div>
            </div>
          </>
        )}

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#A8A69E',
          marginTop: '24px' }}>
          © 2026 里の味みかわ
        </p>
      </div>
    </div>
  )
}
