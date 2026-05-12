'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

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

export default function CalendarPage() {
  const router = useRouter()
  const { user, loading, error, authFetch, logout } = useAuth('calendar')
  const [calData, setCalData]   = useState<CalendarDay[]>([])
  const [fetching, setFetching] = useState(true)
  const [printModal, setPrintModal] = useState<CalendarDay | null>(null)
  const [toast, setToast]       = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fetchCalendar = useCallback(async () => {
    if (!user) return
    setFetching(true)
    const category = user.category || '弁当'
    const res  = await authFetch(
      `/api/calendar?category=${encodeURIComponent(category)}`
    )
    const data = await res.json()
    setCalData(Array.isArray(data) ? data : [])
    setFetching(false)
  }, [user])

  useEffect(() => {
    if (loading) return
    if (error) { setFetching(false); return }
    fetchCalendar()
  }, [loading, error, fetchCalendar])

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
      if (store === '西店') return { bg:'#EAF3DE', color:'#3B6D11' }
      if (store === '南店') return { bg:'#FBEAF0', color:'#72243E' }
      return { bg:'#F3E5F5', color:'#6A1B9A' }
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
        body{font-family:-apple-system,sans-serif;padding:20px;font-size:12px;}
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
      <title>${user?.category}注文 週間カレンダー</title>
      <style>
        body{font-family:-apple-system,sans-serif;padding:20px;font-size:12px;}
        h2{color:#1A5276;font-size:16px;margin-bottom:4px;}
        @media print{div{page-break-inside:avoid;}}
      </style>
    </head><body>
      <h2>${user?.category}注文 週間カレンダー</h2>
      <p style="font-size:11px;color:#888;margin-bottom:16px;">
        ${new Date().toLocaleDateString('ja-JP')} 印刷
      </p>
      ${dayBlocks}
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  const storeClass = (store: string) => {
    if (store === '西店') return { bg:'#EAF3DE', color:'#3B6D11' }
    if (store === '南店') return { bg:'#FBEAF0', color:'#72243E' }
    return { bg:'#F3E5F5', color:'#6A1B9A' }
  }

  const today = new Date().toISOString().split('T')[0]
  const visibleDays = calData.filter((d) =>
    d.orders.length > 0 || d.date === today
  )

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

  return (
    <div style={{ fontFamily:'-apple-system,sans-serif', background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      {/* ヘッダー */}
      <div style={{ background:'linear-gradient(135deg,#1A5276,#2980B9)',
        color:'white', padding:'20px 16px 16px',
        position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:'11px', opacity:.8 }}>週間カレンダー</div>
            <div style={{ fontSize:'20px', fontWeight:500 }}>
              {user?.category === '弁当' ? '🍱' : '🍡'} {user?.category}注文
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={handlePrintAll}
              style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>
              🖨 一覧印刷
            </button>
            <button onClick={logout}
              style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>
              終了する
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding:'12px' }}>

        {/* 日別カレンダー */}
        {visibleDays.length === 0 ? (
          <div style={{ background:'white', borderRadius:'16px', padding:'40px',
            textAlign:'center', color:'#888780', fontSize:'14px',
            marginBottom:'12px' }}>
            今後の注文はありません
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
                <div style={{ padding:'12px 16px', background:'#EBF5FB',
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <span style={{ fontSize:'14px', fontWeight:500, color:'#1A5276' }}>
                      {day.label} {isToday ? '🔵' : ''}
                    </span>
                    <span style={{ fontSize:'12px', padding:'2px 8px',
                      borderRadius:'10px',
                      background: hasOrders ? '#1A5276' : '#E5E1D8',
                      color: hasOrders ? 'white' : '#888780' }}>
                      {hasOrders ? day.orders.length + '件' : '注文なし'}
                    </span>
                    {hasOrders && totalAmount > 0 && (
                      <span style={{ fontSize:'13px', fontWeight:500, color:'#1A5276' }}>
                        ¥{totalAmount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {hasOrders && (
                    <button onClick={() => handlePrint(day)}
                      style={{ background:'none', border:'none', fontSize:'18px',
                        cursor:'pointer', padding:'4px' }}
                      title="印刷">
                      🖨
                    </button>
                  )}
                </div>

                {/* 注文詳細 */}
                {!hasOrders ? (
                  <div style={{ padding:'12px 16px', fontSize:'13px', color:'#888780' }}>
                    注文はありません
                  </div>
                ) : (
                  day.orders.map((o, idx) => {
                    const sc = storeClass(o.store)
                    return (
                      <div key={o.orderId} style={{ padding:'12px 16px',
                        borderBottom: idx < day.orders.length-1
                          ? '1px solid #F5F1EA' : 'none' }}>
                        <div style={{ display:'flex', justifyContent:'space-between',
                          alignItems:'center', marginBottom:'6px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                            <span style={{ background: sc.bg, color: sc.color,
                              fontSize:'11px', padding:'2px 8px', borderRadius:'10px',
                              fontWeight:500 }}>
                              {o.store}
                            </span>
                            <span style={{ fontSize:'14px', fontWeight:500 }}>
                              {o.productName}
                            </span>
                          </div>
                          <span style={{ fontSize:'13px', color:'#1A5276' }}>
                            ¥{Number(o.price||0).toLocaleString()} ×
                            {o.quantity}個 =
                            <span style={{ fontWeight:500 }}>
                              ¥{Number(o.subtotal||0).toLocaleString()}
                            </span>
                          </span>
                        </div>
                        <div style={{ fontSize:'12px', color:'#888780',
                          display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px' }}>
                          <span>お名前: {o.customerName} 様</span>
                          <span>電話: {o.phone}</span>
                          <span>受け取り: {o.deliveryAddress}</span>
                          <span>時間: {o.deliveryTime}</span>
                          {o.receipt === 'yes' && (
                            <span>領収書: あり{o.receiptName ? '('+o.receiptName+')' : ''}</span>
                          )}
                          {o.purpose && (
                            <span>用途: {o.purpose}</span>
                          )}
                          {o.okazu && (
                            <span>おかず: {o.okazu}</span>
                          )}
                          {o.notes && (
                            <span style={{ gridColumn:'1/-1' }}>備考: {o.notes}</span>
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

        {/* 今後の商品別合計 */}
        {Object.keys(totalSummary).length > 0 && (
          <div style={{ background:'white', borderRadius:'16px', padding:'16px',
            boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
            <div style={{ fontWeight:500, fontSize:'14px', marginBottom:'12px' }}>
              📊 今後の商品別合計
            </div>
            {Object.entries(totalSummary).map(([name, v]) => (
              <div key={name} style={{ display:'flex', justifyContent:'space-between',
                padding:'6px 0', borderBottom:'1px solid #F5F1EA', fontSize:'13px' }}>
                <span>{name}</span>
                <span style={{ fontWeight:500, color:'#1A5276' }}>
                  {v.qty}個 / ¥{v.amount.toLocaleString()}
                </span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between',
              padding:'8px 0', fontSize:'13px', fontWeight:500, color:'#1A5276',
              borderTop:'2px solid #1A5276', marginTop:'4px' }}>
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
