'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { themeForStoreName } from '@/lib/storeColors'

interface CalendarDay {
  date  : string
  label : string
  orders: {
    orderId        : number
    store          : string
    productName    : string
    quantity       : number
    price          : number
    subtotal       : number
    customerName   : string
    phone          : string
    deliveryAddress: string
    deliveryTime   : string
    receipt        : string
    receiptName    : string
    purpose        : string
    okazu          : string
    notes          : string
  }[]
}

type CategoryKey = '弁当' | '餅'
const CATEGORY_TABS: { key: CategoryKey; label: string; icon: string }[] = [
  { key: '弁当', label: '弁当', icon: '🍱' },
  { key: '餅',   label: '餅',   icon: '🍡' },
]

function CalendarPageContent() {
  const router = useRouter()
  const { user, loading, error, authFetch, logout } = useAuth(['nishi', 'minami', 'honbu', 'hq1', 'hq2', 'hq3', 'all'])
  const [calData, setCalData]   = useState<CalendarDay[]>([])
  const [fetching, setFetching] = useState(true)
  const [printModal, setPrintModal] = useState<CalendarDay | null>(null)
  const [toast, setToast]       = useState('')
  const [category, setCategory] = useState<CategoryKey>('弁当')
  const [range, setRange]       = useState<'future' | 'past'>('future')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fetchCalendar = useCallback(async () => {
    if (!user) return
    setFetching(true)
    const res  = await authFetch(
      `/api/calendar?category=${encodeURIComponent(category)}&range=${range}`)
    const data = await res.json()
    setCalData(Array.isArray(data) ? data : [])
    setFetching(false)
  }, [user, category, range])

  useEffect(() => {
    if (loading) return
    if (error) { setFetching(false); return }
    fetchCalendar()
  }, [loading, error, fetchCalendar])

  const currentTab = CATEGORY_TABS.find((t) => t.key === category) ?? CATEGORY_TABS[0]

  // 商品別合計
  const totalSummary = calData.reduce((acc, day) => {
    day.orders.forEach((o) => {
      if (!acc[o.productName]) acc[o.productName] = { qty: 0, amount: 0 }
      acc[o.productName].qty    += o.quantity
      acc[o.productName].amount += o.subtotal || 0
    })
    return acc
  }, {} as Record<string, { qty: number; amount: number }>)

  const grandTotal = Object.values(totalSummary)
    .reduce((sum, v) => sum + v.amount, 0)

  // 印刷
  const handlePrint = (day: CalendarDay) => {
    const w = window.open('', '_blank')
    if (!w) { showToast('ポップアップをブロックされました'); return }

    const storeColor = (store: string) => {
      const t = themeForStoreName(store)
      return { bg: t.bg, color: t.text }
    }

    const rows = day.orders.map((o) => {
      const sc = storeColor(o.store)
      return `<tr>
        <td><span style="background:${sc.bg};color:${sc.color};
          padding:2px 8px;border-radius:10px;font-size:11px;">${o.store}</span></td>
        <td>${o.productName}</td>
        <td style="text-align:center;font-weight:500;">${o.quantity}</td>
        <td>${o.customerName} 様</td>
        <td>${o.phone}</td>
        <td>${o.deliveryAddress}</td>
        <td>${o.deliveryTime || ''}</td>
        <td>${o.purpose || ''}</td>
        <td>${o.okazu || ''}</td>
        <td>${o.receipt === 'yes' ? 'あり' + (o.receiptName ? '('+o.receiptName+')' : '') : ''}</td>
        <td>${o.notes || ''}</td>
      </tr>`
    }).join('')

    const totalAmount = day.orders.reduce((s, o) => s + (o.subtotal||0), 0)

    w.document.write(`<!DOCTYPE html><html lang="ja"><head>
      <meta charset="UTF-8"><title>${day.label} 注文一覧</title>
      <style>
        body{font-family:'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif;padding:20px;font-size:12px;}
        h2{color:#1A5276;font-size:16px;margin-bottom:4px;}
        p{font-size:11px;color:#888;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;}
        th{background:#1A5276;color:white;padding:8px;text-align:left;font-size:11px;}
        td{padding:7px 8px;border-bottom:1px solid #E5E1D8;font-size:11px;}
        tr:nth-child(even) td{background:#F5F1EA;}
        tfoot td{font-weight:500;color:#1A5276;background:#EBF5FB;}
        @media print{body{padding:10px;}}
      </style>
    </head><body>
      <h2>惣菜注文一覧</h2>
      <p>${day.label} · ${new Date().toLocaleDateString('ja-JP')} 印刷</p>
      <table>
        <thead><tr>
          <th>店舗</th><th>商品</th><th>数量</th>
          <th>お名前</th><th>電話</th><th>受け取り</th>
          <th>時間</th><th>用途</th><th>おかず</th>
          <th>領収書</th><th>備考</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="2" style="text-align:right;">合計金額</td>
          <td colspan="9">¥${totalAmount.toLocaleString()}</td>
        </tr></tfoot>
      </table>
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  // 一覧印刷
  const handlePrintAll = () => {
    const w = window.open('', '_blank')
    if (!w) { showToast('ポップアップをブロックされました'); return }

    const visibleDays = calData.filter((d) => d.orders.length > 0)
    const dayBlocks = visibleDays.map((day) => {
      const rows = day.orders.map((o) => `
        <div style="padding:8px 0;border-bottom:1px solid #F0ECE3;font-size:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <div style="font-weight:500;">${o.store} / ${o.productName} ×${o.quantity}</div>
            <div style="color:#888;">${o.deliveryTime || ''}</div>
          </div>
          <div style="color:#555;">${o.customerName} 様 / ${o.phone}</div>
          <div style="color:#555;">${o.deliveryAddress}</div>
          ${o.notes ? `<div style="color:#888;">備考: ${o.notes}</div>` : ''}
        </div>`).join('')

      const totalAmount = day.orders.reduce((s, o) => s + (o.subtotal||0), 0)
      return `<div style="margin-bottom:20px;page-break-inside:avoid;">
        <div style="background:#EBF5FB;padding:10px 14px;border-radius:8px 8px 0 0;
          display:flex;justify-content:space-between;">
          <span style="font-weight:500;color:#1A5276;">${day.label}</span>
          <span style="font-size:12px;color:#1A5276;">
            ${day.orders.length}件 / ¥${totalAmount.toLocaleString()}
          </span>
        </div>
        <div style="border:1px solid #E5E1D8;border-top:none;
          border-radius:0 0 8px 8px;padding:0 14px;">
          ${rows}
        </div>
      </div>`
    }).join('')

    w.document.write(`<!DOCTYPE html><html lang="ja"><head>
      <meta charset="UTF-8">
      <title>${category}注文 週間カレンダー</title>
      <style>
        body{font-family:'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif;padding:20px;font-size:12px;}
        h2{color:#1A5276;font-size:16px;margin-bottom:4px;}
        @media print{div{page-break-inside:avoid;}}
      </style>
    </head><body>
      <h2>${category}注文 週間カレンダー</h2>
      <p style="font-size:11px;color:#888;margin-bottom:16px;">
        ${new Date().toLocaleDateString('ja-JP')} 印刷
      </p>
      ${dayBlocks}
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  const storeClass = (store: string) => {
    const t = themeForStoreName(store)
    return { bg: t.bg, color: t.text }
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
  // 過去ビューは注文ありの日のみ。今後ビューは注文あり + 今日（注文なしでも表示）
  const visibleDays = range === 'past'
    ? calData.filter((d) => d.orders.length > 0).slice().reverse() // 新しい日付が上
    : calData.filter((d) => d.orders.length > 0 || d.date === today)

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

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      {/* ヘッダー */}
      <div style={{ background:'linear-gradient(135deg,#1A5276,#2980B9)',
        color:'white', padding:'20px 16px 0',
        position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between',
          alignItems:'center', paddingBottom:'12px' }}>
          <div>
            <div style={{ fontSize:'14px', opacity:.85 }}>
              {range === 'past' ? '過去30日' : '今後30日'}
            </div>
            <div style={{ fontSize:'22px', fontWeight:500 }}>
              {currentTab.icon} {currentTab.label}注文
            </div>
            {user?.name && (
              <div style={{ fontSize:'12px', opacity:.85, marginTop:'2px' }}>
                {user.name}
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <button onClick={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
              style={{ padding:'10px 14px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'16px', fontWeight:500,
                cursor:'pointer', fontFamily:'inherit' }}>
              {viewMode === 'list' ? '📆 カレンダー' : '📋 リスト'}
            </button>
            <button onClick={() => setRange(range === 'future' ? 'past' : 'future')}
              style={{ padding:'10px 14px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'16px', fontWeight:500,
                cursor:'pointer', fontFamily:'inherit' }}>
              {range === 'future' ? '🕘 過去を見る' : '🔜 今後を見る'}
            </button>
            <button onClick={handlePrintAll}
              style={{ padding:'10px 14px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'16px', fontWeight:500,
                cursor:'pointer', fontFamily:'inherit' }}>
              🖨 一覧印刷
            </button>
            <button onClick={logout}
              style={{ padding:'10px 14px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'16px', fontWeight:500,
                cursor:'pointer', fontFamily:'inherit' }}>
              終了する
            </button>
          </div>
        </div>
        {/* カテゴリタブ */}
        <div style={{ display:'flex', gap:'4px' }}>
          {CATEGORY_TABS.map((t) => {
            const active = t.key === category
            return (
              <button key={t.key} onClick={() => setCategory(t.key)}
                style={{ flex:1, padding:'12px 8px',
                  background: active ? 'white' : 'rgba(255,255,255,.15)',
                  color: active ? '#1A5276' : 'white',
                  border:'none', borderRadius:'10px 10px 0 0',
                  fontSize:'18px', fontWeight:500,
                  cursor:'pointer', fontFamily:'inherit' }}>
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding:'12px' }}>

        {viewMode === 'calendar' ? (
          <CalendarGrid
            calData={calData}
            range={range}
            storeClass={storeClass}
            onPrint={handlePrint}
            today={today}
          />
        ) : (
        <>
        {/* 日別カレンダー */}
        {visibleDays.length === 0 ? (
          <div style={{ background:'white', borderRadius:'16px', padding:'40px',
            textAlign:'center', color:'#888780', fontSize:'18px',
            marginBottom:'12px' }}>
            {range === 'past' ? '過去30日の注文はありません' : '今後の注文はありません'}
          </div>
        ) : (
          visibleDays.map((day) => {
            const isToday     = day.date === today
            const hasOrders   = day.orders.length > 0
            const totalAmount = day.orders.reduce((s, o) => s + (o.subtotal||0), 0)

            return (
              <div key={day.date} style={{ background:'white', borderRadius:'16px',
                overflow:'hidden', marginBottom:'12px',
                boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>

                {/* 日付ヘッダー */}
                <div style={{ padding:'14px 16px', background:'#EBF5FB',
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px',
                    flexWrap:'wrap' }}>
                    <span style={{ fontSize:'18px', fontWeight:500, color:'#1A5276' }}>
                      {day.label} {isToday ? '🔵' : ''}
                    </span>
                    <span style={{ fontSize:'16px', padding:'3px 10px',
                      borderRadius:'20px', fontWeight:500,
                      background: hasOrders ? '#1A5276' : '#E5E1D8',
                      color: hasOrders ? 'white' : '#888780' }}>
                      {hasOrders ? day.orders.length + '件' : '注文なし'}
                    </span>
                    {hasOrders && totalAmount > 0 && (
                      <span style={{ fontSize:'18px', fontWeight:500, color:'#1A5276' }}>
                        ¥{totalAmount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {hasOrders && (
                    <button onClick={() => handlePrint(day)}
                      style={{ background:'none', border:'none', fontSize:'22px',
                        cursor:'pointer', padding:'4px' }}
                      title="印刷">
                      🖨
                    </button>
                  )}
                </div>

                {/* 注文詳細 */}
                {!hasOrders ? (
                  <div style={{ padding:'14px 16px', fontSize:'16px',
                    color:'#A8A69E', fontStyle:'italic' }}>
                    注文はありません
                  </div>
                ) : (
                  day.orders.map((o, idx) => {
                    const sc = storeClass(o.store)
                    return (
                      <div key={o.orderId} style={{ padding:'14px 16px',
                        borderBottom: idx < day.orders.length-1
                          ? '1px solid #F5F1EA' : 'none' }}>
                        <div style={{ display:'flex', justifyContent:'space-between',
                          alignItems:'center', marginBottom:'8px', gap:'10px',
                          flexWrap:'wrap' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px',
                            flexWrap:'wrap' }}>
                            <span style={{ background: sc.bg, color: sc.color,
                              fontSize:'16px', padding:'3px 10px', borderRadius:'10px',
                              fontWeight:500 }}>
                              {o.store}
                            </span>
                            <span style={{ fontSize:'20px', fontWeight:500 }}>
                              {o.productName}
                            </span>
                          </div>
                          <span style={{ fontSize:'18px', color:'#1A5276',
                            fontWeight:500, whiteSpace:'nowrap' }}>
                            ¥{Number(o.price||0).toLocaleString()} ×{o.quantity}個{' = '}
                            <span style={{ fontWeight:600 }}>
                              ¥{Number(o.subtotal||0).toLocaleString()}
                            </span>
                          </span>
                        </div>
                        <div style={{ fontSize:'16px', color:'#5F5E5A',
                          display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px' }}>
                          <span><span style={{ color:'#A8A69E' }}>お名前: </span>
                            {o.customerName} 様</span>
                          <span><span style={{ color:'#A8A69E' }}>電話: </span>
                            {o.phone}</span>
                          <span style={{ gridColumn:'1/-1', display:'flex',
                            alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                            {o.deliveryAddress === '来店' ? (
                              <span style={{ padding:'2px 10px', borderRadius:'10px',
                                background:'#EBF5FB', color:'#1A5276', fontWeight:500,
                                fontSize:'13px' }}>来店</span>
                            ) : (
                              <>
                                <span style={{ padding:'2px 10px', borderRadius:'10px',
                                  background:'#FCEBDC', color:'#854F0B', fontWeight:500,
                                  fontSize:'13px' }}>配達</span>
                                <span>{o.deliveryAddress}</span>
                                {o.deliveryTime && (
                                  <span style={{ color:'#888780' }}>{o.deliveryTime}</span>
                                )}
                              </>
                            )}
                          </span>
                          {o.purpose && (
                            <span><span style={{ color:'#A8A69E' }}>用途: </span>
                              {o.purpose}</span>
                          )}
                          {o.okazu && (
                            <span><span style={{ color:'#A8A69E' }}>おかず: </span>
                              {o.okazu}</span>
                          )}
                          <span style={{ gridColumn:'1/-1' }}>
                            <span style={{ color:'#A8A69E' }}>領収書: </span>
                            {o.receipt === 'yes' ? 'あり' : 'なし'}
                            {o.receipt === 'yes' && (
                              <>
                                <span style={{ color:'#A8A69E', marginLeft:'12px' }}>宛名: </span>
                                {o.receiptName ? o.receiptName : 'なし'}
                              </>
                            )}
                          </span>
                          {o.notes && (
                            <span style={{ gridColumn:'1/-1' }}>
                              <span style={{ color:'#A8A69E' }}>備考: </span>
                              {o.notes}</span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })
        )}

        </>
        )}

        {/* 今後の商品別合計 */}
        {Object.keys(totalSummary).length > 0 && (
          <div style={{ background:'white', borderRadius:'16px', padding:'18px 16px',
            boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
            <div style={{ fontWeight:500, fontSize:'20px', marginBottom:'12px',
              color:'#1A5276' }}>
              📊 {range === 'past' ? '過去30日' : '今後'}の商品別合計
            </div>
            {Object.entries(totalSummary).map(([name, v]) => (
              <div key={name} style={{ display:'flex', justifyContent:'space-between',
                padding:'10px 0', borderBottom:'1px solid #F5F1EA', fontSize:'20px' }}>
                <span>{name}</span>
                <span style={{ fontWeight:500, color:'#1A5276' }}>
                  {v.qty}個 / ¥{v.amount.toLocaleString()}
                </span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between',
              padding:'12px 0 4px', fontSize:'20px', fontWeight:500, color:'#1A5276',
              borderTop:'2px solid #1A5276', marginTop:'6px' }}>
              <span>合計</span>
              <span>¥{grandTotal.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* トースト */}
      {toast && (
        <div style={{ position:'fixed', bottom:'24px', left:'50%',
          transform:'translateX(-50%)',
          background:'rgba(44,44,42,.9)', color:'white',
          padding:'10px 20px', borderRadius:'20px', fontSize:'13px',
          zIndex:100, whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function CalendarGrid({
  calData, range, storeClass, onPrint, today,
}: {
  calData   : CalendarDay[]
  range     : 'future' | 'past'
  storeClass: (s: string) => { bg: string; color: string }
  onPrint   : (d: CalendarDay) => void
  today     : string
}) {
  if (calData.length === 0) {
    return (
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', color:'#888780', fontSize:'16px',
        marginBottom:'12px' }}>
        {range === 'past' ? '過去30日の注文はありません' : '今後の注文はありません'}
      </div>
    )
  }

  // 日付→日データのマップ
  const dayMap = new Map<string, CalendarDay>()
  calData.forEach((d) => dayMap.set(d.date, d))

  // 取得範囲の先頭日を含む週の日曜から、末尾日を含む週の土曜までを埋める
  const firstStr = calData[0].date
  const lastStr  = calData[calData.length - 1].date
  const [fy, fm, fd] = firstStr.split('-').map(Number)
  const [ly, lm, ld] = lastStr.split('-').map(Number)
  const first = new Date(fy, fm - 1, fd)
  const last  = new Date(ly, lm - 1, ld)

  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay()) // 日曜
  const gridEnd = new Date(last)
  gridEnd.setDate(last.getDate() + (6 - last.getDay())) // 土曜

  const days: { date: Date; dateStr: string; inRange: boolean; data?: CalendarDay }[] = []
  const cur = new Date(gridStart)
  while (cur <= gridEnd) {
    const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
    const data = dayMap.get(ds)
    days.push({
      date   : new Date(cur),
      dateStr: ds,
      inRange: data !== undefined,
      data,
    })
    cur.setDate(cur.getDate() + 1)
  }

  // 週ごとに分割
  const weeks: typeof days[] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  const dayHeaders = ['日','月','火','水','木','金','土']

  return (
    <div style={{ background:'white', borderRadius:'16px', overflow:'hidden',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)', marginBottom:'12px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)',
        background:'#EBF5FB', borderBottom:'1.5px solid #D6E9F5' }}>
        {dayHeaders.map((d, i) => (
          <div key={d} style={{ padding:'8px 4px', textAlign:'center',
            fontSize:'13px', fontWeight:500,
            color: i === 0 ? '#E24B4A' : i === 6 ? '#1A6FAF' : '#1A5276' }}>
            {d}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)',
          borderBottom: wi < weeks.length - 1 ? '1px solid #F0ECE3' : 'none' }}>
          {week.map((cell, ci) => {
            const isToday = cell.dateStr === today
            const hasOrders = cell.data?.orders?.length ?? 0
            const dayColor = ci === 0 ? '#E24B4A' : ci === 6 ? '#1A6FAF' : '#2C2C2A'
            const totalAmount = cell.data?.orders.reduce(
              (s, o) => s + (o.subtotal || 0), 0) ?? 0

            return (
              <div key={cell.dateStr}
                onClick={() => cell.data && hasOrders > 0 && onPrint(cell.data!)}
                style={{
                  minHeight: '100px', padding:'4px 5px',
                  borderRight: ci < 6 ? '1px solid #F0ECE3' : 'none',
                  background: !cell.inRange ? '#FBFAF6'
                            : isToday ? '#FFFBE6' : 'white',
                  opacity: cell.inRange ? 1 : .55,
                  cursor: hasOrders > 0 ? 'pointer' : 'default',
                  display:'flex', flexDirection:'column', gap:'2px',
                  overflow:'hidden',
                }}>
                <div style={{ display:'flex', justifyContent:'space-between',
                  alignItems:'center', marginBottom:'2px' }}>
                  <span style={{ fontSize:'13px', fontWeight: isToday ? 600 : 500,
                    color: dayColor }}>
                    {cell.date.getDate()}
                  </span>
                  {hasOrders > 0 && (
                    <span style={{ fontSize:'9px', padding:'1px 5px',
                      background:'#1A5276', color:'white', borderRadius:'8px' }}>
                      {hasOrders}
                    </span>
                  )}
                </div>
                {cell.data?.orders.slice(0, 4).map((o) => {
                  const sc = storeClass(o.store)
                  return (
                    <div key={o.orderId} style={{ fontSize:'10px', lineHeight:1.3,
                      color:'#2C2C2A', overflow:'hidden', textOverflow:'ellipsis',
                      whiteSpace:'nowrap',
                      borderLeft: `2px solid ${sc.color}`, paddingLeft:'4px' }}>
                      {o.productName}({o.customerName}様)×{o.quantity}個
                    </div>
                  )
                })}
                {(cell.data?.orders.length ?? 0) > 4 && (
                  <div style={{ fontSize:'9px', color:'#888780' }}>
                    +{(cell.data!.orders.length - 4)}件
                  </div>
                )}
                {totalAmount > 0 && (
                  <div style={{ fontSize:'9px', color:'#1A5276', marginTop:'auto',
                    fontWeight:500, textAlign:'right' }}>
                    ¥{totalAmount.toLocaleString()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
        読み込み中...
      </div>
    }>
      <CalendarPageContent />
    </Suspense>
  )
}
