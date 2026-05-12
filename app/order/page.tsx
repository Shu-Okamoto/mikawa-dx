'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'

interface OrderProduct {
  id          : number
  productCode : string
  productName : string
  category    : string
  price       : number
  availableDays: string
}

interface InstoreOrder {
  id             : number
  orderCode      : string
  deliveryDate   : string
  productName    : string
  quantity       : number
  customerName   : string
  phone          : string
  deliveryAddress: string
  deliveryTime   : string
  receipt        : string
  receiptName    : string
  purpose        : string
  okazu          : string
  notes          : string
  status         : string
}

type Screen = 'list' | 'date' | 'product' | 'form' | 'complete'

const PURPOSES = ['贈答用','自家用','法事','その他']
const DELIVERY_TIMES = [
  '9:00','9:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30',
]

export default function OrderPage() {
  const { user, loading, authFetch, logout } = useAuth('order')
  const [screen, setScreen]         = useState<Screen>('list')
  const [orders, setOrders]         = useState<InstoreOrder[]>([])
  const [products, setProducts]     = useState<OrderProduct[]>([])
  const [availDates, setAvailDates] = useState<string[]>([])
  const [toast, setToast]           = useState('')
  const [confirm, setConfirm]       = useState<{ msg: string; onOk: () => void } | null>(null)

  // フォーム状態
  const [selectedDate, setSelectedDate]       = useState('')
  const [selectedProduct, setSelectedProduct] = useState<OrderProduct | null>(null)
  const [quantities, setQuantities]           = useState<Record<number, number>>({})
  const [form, setForm] = useState({
    customerName   : '',
    phone          : '',
    deliveryMode   : '',
    address        : '',
    timeStart      : '',
    timeEnd        : '',
    receipt        : 'no',
    receiptName    : '',
    purposes       : [] as string[],
    okazu          : '',
    notes          : '',
  })
  const [submitting, setSubmitting] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const showConfirm = (msg: string, onOk: () => void) => {
    setConfirm({ msg, onOk })
  }

  // 注文一覧取得
  const fetchOrders = useCallback(async () => {
    if (!user) return
    const res  = await authFetch('/api/orders')
    const data = await res.json()
    setOrders(Array.isArray(data) ? data : [])
  }, [user])

  // 利用可能日付取得（今日から30日）
  const buildAvailDates = useCallback(() => {
    const dates = []
    const days  = ['日','月','火','水','木','金','土']
    for (let i = 1; i <= 30; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const str = d.getFullYear() + '/' +
        ('0'+(d.getMonth()+1)).slice(-2) + '/' +
        ('0'+d.getDate()).slice(-2)
      const label = (d.getMonth()+1) + '月' + d.getDate() +
        '日(' + days[d.getDay()] + ')'
      dates.push({ value: str, label })
    }
    setAvailDates(dates as any)
  }, [])

  useEffect(() => {
    if (!loading) {
      fetchOrders()
      buildAvailDates()
    }
  }, [loading, fetchOrders, buildAvailDates])

  // 日付選択後に商品取得
  const handleDateSelect = async (date: string) => {
    setSelectedDate(date)
    const res  = await authFetch(
      `/api/order-products?deliveryDate=${encodeURIComponent(date)}`
    )
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
    setQuantities({})
    setScreen('product')
  }

  // 注文送信
  const handleSubmit = async () => {
    const { customerName, phone, deliveryMode,
            address, timeStart, timeEnd,
            receipt, receiptName, purposes, okazu, notes } = form

    if (!customerName) { showToast('お名前を入力してください'); return }
    if (!phone)        { showToast('電話番号を入力してください'); return }
    if (!/^[0-9]{10,11}$/.test(phone)) {
      showToast('電話番号はハイフンなし10〜11桁で入力してください'); return
    }
    if (!deliveryMode) { showToast('お受け取り方法を選択してください'); return }
    if (deliveryMode === 'delivery' && !address) {
      showToast('配達先住所を入力してください'); return
    }
    if (deliveryMode === 'delivery') {
      if (!timeStart || !timeEnd) {
        showToast('配達時間を選択してください'); return
      }
      const toNum = (t: string) => {
        const [h, m] = t.split(':').map(Number)
        return h + m / 60
      }
      if (toNum(timeEnd) <= toNum(timeStart)) {
        showToast('終了時間は開始時間より後にしてください'); return
      }
    }

    const orderItems = products.filter((p) => (quantities[p.id] || 0) > 0)
    if (orderItems.length === 0) { showToast('商品を選択してください'); return }

    setSubmitting(true)
    let hasError = false
    for (const p of orderItems) {
      const res = await authFetch('/api/orders', {
        method: 'POST',
        body  : JSON.stringify({
          deliveryDate   : selectedDate,
          productId      : p.id,
          productName    : p.productName,
          quantity       : quantities[p.id],
          customerName,
          phone,
          deliveryAddress: deliveryMode === 'visit' ? '来店' : address,
          deliveryTime   : deliveryMode === 'visit' ? '来店' :
                           timeStart + '〜' + timeEnd,
          receipt,
          receiptName    : receipt === 'yes' ? receiptName : '',
          purpose        : purposes.join('・'),
          okazu,
          notes,
        }),
      })
      const data = await res.json()
      if (!data.success) hasError = true
    }

    setSubmitting(false)
    if (!hasError) {
      setScreen('complete')
      fetchOrders()
    } else {
      showToast('エラーが発生しました')
    }
  }

  // キャンセル
  const handleCancel = (orderId: number) => {
    showConfirm('この注文をキャンセルしますか？', async () => {
      const res  = await authFetch(`/api/orders/${orderId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        showToast('キャンセルしました')
        fetchOrders()
      } else {
        showToast('エラー: ' + data.error)
      }
    })
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:'-apple-system,sans-serif' }}>
      読み込み中...
    </div>
  )

  const headerStyle = (color1: string, color2: string) => ({
    background: `linear-gradient(135deg,${color1},${color2})`,
    color: 'white', padding: '20px 16px 16px',
    position: 'sticky' as const, top: 0, zIndex: 10,
  })

  return (
    <div style={{ fontFamily:'-apple-system,sans-serif', background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      {/* 注文一覧画面 */}
      {screen === 'list' && (
        <>
          <div style={headerStyle('#72243E','#A93226')}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>惣菜注文受付</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>{user?.storeName}</div>
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={() => setScreen('date')}
                  style={{ padding:'8px 14px', background:'white',
                    color:'#72243E', border:'none', borderRadius:'10px',
                    fontSize:'13px', fontWeight:500, cursor:'pointer',
                    fontFamily:'inherit' }}>
                  ＋ 新規注文
                </button>
                <button onClick={logout}
                  style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                    border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                    color:'white', fontSize:'13px', cursor:'pointer',
                    fontFamily:'inherit' }}>
                  終了
                </button>
              </div>
            </div>
          </div>

          <div style={{ padding:'12px' }}>
            {orders.length === 0 ? (
              <div style={{ background:'white', borderRadius:'16px', padding:'40px',
                textAlign:'center', color:'#888780', fontSize:'14px' }}>
                注文はありません
              </div>
            ) : (
              orders.map((o) => (
                <div key={o.id} style={{ background:'white', borderRadius:'16px',
                  padding:'16px', marginBottom:'12px',
                  boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between',
                    marginBottom:'8px' }}>
                    <div style={{ fontSize:'13px', fontWeight:500, color:'#2C2C2A' }}>
                      {new Date(o.deliveryDate).toLocaleDateString('ja-JP')} {o.productName}
                    </div>
                    <span style={{ fontSize:'12px', background:'#EAF3DE',
                      color:'#3B6D11', padding:'2px 8px', borderRadius:'10px' }}>
                      ×{o.quantity}
                    </span>
                  </div>
                  <div style={{ fontSize:'12px', color:'#888780', marginBottom:'4px' }}>
                    {o.customerName} 様 / {o.phone}
                  </div>
                  <div style={{ fontSize:'12px', color:'#888780', marginBottom:'8px' }}>
                    {o.deliveryAddress} {o.deliveryTime}
                  </div>
                  <button onClick={() => handleCancel(o.id)}
                    style={{ padding:'6px 12px', background:'white',
                      border:'1.5px solid #E5E1D8', borderRadius:'8px',
                      fontSize:'12px', color:'#888780', cursor:'pointer',
                      fontFamily:'inherit' }}>
                    キャンセル
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* 日付選択 */}
      {screen === 'date' && (
        <>
          <div style={headerStyle('#72243E','#A93226')}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>配達日を選択</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>日付選択</div>
              </div>
              <button onClick={() => setScreen('list')}
                style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                  border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                  color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
                戻る
              </button>
            </div>
          </div>

          <div style={{ padding:'12px' }}>
            <div style={{ background:'white', borderRadius:'16px', overflow:'hidden',
              boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
              {(availDates as any[]).map((d: any, idx) => (
                <button key={d.value} onClick={() => handleDateSelect(d.value)}
                  style={{ width:'100%', padding:'14px 16px', textAlign:'left',
                    background:'white', border:'none',
                    borderBottom: idx < availDates.length-1
                      ? '1px solid #F5F1EA' : 'none',
                    fontSize:'14px', cursor:'pointer', fontFamily:'inherit',
                    color:'#2C2C2A', display:'flex', justifyContent:'space-between' }}>
                  <span>{d.label}</span>
                  <span style={{ color:'#888780' }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 商品選択 */}
      {screen === 'product' && (
        <>
          <div style={headerStyle('#72243E','#A93226')}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>商品を選択</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>{selectedDate}</div>
              </div>
              <button onClick={() => setScreen('date')}
                style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                  border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                  color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
                戻る
              </button>
            </div>
          </div>

          <div style={{ padding:'12px' }}>
            {products.length === 0 ? (
              <div style={{ background:'white', borderRadius:'16px', padding:'40px',
                textAlign:'center', color:'#888780', fontSize:'14px' }}>
                この日に注文できる商品がありません
              </div>
            ) : (
              <>
                <div style={{ background:'white', borderRadius:'16px',
                  overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.04)',
                  marginBottom:'12px' }}>
                  {products.map((p, idx) => (
                    <div key={p.id} style={{ padding:'12px 16px',
                      borderBottom: idx < products.length-1
                        ? '1px solid #F5F1EA' : 'none',
                      display:'flex', justifyContent:'space-between',
                      alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:'14px', fontWeight:500 }}>
                          {p.productName}
                        </div>
                        <div style={{ fontSize:'12px', color:'#888780' }}>
                          ¥{Number(p.price).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        <button onClick={() => setQuantities({
                          ...quantities,
                          [p.id]: Math.max(0, (quantities[p.id]||0) - 1)
                        })}
                          style={{ width:'32px', height:'32px', borderRadius:'50%',
                            border:'1.5px solid #E5E1D8', background:'white',
                            fontSize:'16px', cursor:'pointer', fontFamily:'inherit' }}>
                          -
                        </button>
                        <span style={{ minWidth:'24px', textAlign:'center',
                          fontSize:'16px', fontWeight:500 }}>
                          {quantities[p.id] || 0}
                        </span>
                        <button onClick={() => setQuantities({
                          ...quantities,
                          [p.id]: (quantities[p.id]||0) + 1
                        })}
                          style={{ width:'32px', height:'32px', borderRadius:'50%',
                            border:'1.5px solid #E5E1D8', background:'white',
                            fontSize:'16px', cursor:'pointer', fontFamily:'inherit' }}>
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    if (products.filter((p) => (quantities[p.id]||0) > 0).length === 0) {
                      showToast('商品を選択してください')
                      return
                    }
                    setScreen('form')
                  }}
                  style={{ width:'100%', padding:'14px', background:'#72243E',
                    color:'white', border:'none', borderRadius:'12px',
                    fontSize:'15px', fontWeight:500, cursor:'pointer',
                    fontFamily:'inherit' }}>
                  お客様情報を入力する
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* お客様情報入力 */}
      {screen === 'form' && (
        <>
          <div style={headerStyle('#72243E','#A93226')}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>お客様情報</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>{selectedDate}</div>
              </div>
              <button onClick={() => setScreen('product')}
                style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                  border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                  color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
                戻る
              </button>
            </div>
          </div>

          <div style={{ padding:'12px' }}>
            <div style={{ background:'white', borderRadius:'16px', padding:'16px',
              marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>

              {/* お名前 */}
              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'12px', color:'#888780', display:'block',
                  marginBottom:'4px' }}>お名前 *</label>
                <input type="text" value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  style={{ width:'100%', padding:'10px 12px',
                    border:'1.5px solid #E5E1D8', borderRadius:'8px',
                    fontSize:'14px', fontFamily:'inherit', boxSizing:'border-box' }}
                  placeholder="山田 太郎" />
              </div>

              {/* 電話番号 */}
              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'12px', color:'#888780', display:'block',
                  marginBottom:'4px' }}>電話番号（ハイフンなし）*</label>
                <input type="tel" value={form.phone} inputMode="numeric"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  style={{ width:'100%', padding:'10px 12px',
                    border:'1.5px solid #E5E1D8', borderRadius:'8px',
                    fontSize:'14px', fontFamily:'inherit', boxSizing:'border-box' }}
                  placeholder="09012345678" />
              </div>

              {/* 受け取り方法 */}
              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'12px', color:'#888780', display:'block',
                  marginBottom:'8px' }}>お受け取り方法 *</label>
                <div style={{ display:'flex', gap:'8px' }}>
                  {['visit','delivery'].map((mode) => (
                    <button key={mode}
                      onClick={() => setForm({ ...form, deliveryMode: mode })}
                      style={{ flex:1, padding:'10px',
                        background: form.deliveryMode === mode ? '#72243E' : 'white',
                        color: form.deliveryMode === mode ? 'white' : '#2C2C2A',
                        border: '1.5px solid',
                        borderColor: form.deliveryMode === mode ? '#72243E' : '#E5E1D8',
                        borderRadius:'8px', fontSize:'14px', cursor:'pointer',
                        fontFamily:'inherit' }}>
                      {mode === 'visit' ? '来店' : '配達'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 配達の場合 */}
              {form.deliveryMode === 'delivery' && (
                <>
                  <div style={{ marginBottom:'12px' }}>
                    <label style={{ fontSize:'12px', color:'#888780', display:'block',
                      marginBottom:'4px' }}>配達先住所 *</label>
                    <input type="text" value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      style={{ width:'100%', padding:'10px 12px',
                        border:'1.5px solid #E5E1D8', borderRadius:'8px',
                        fontSize:'14px', fontFamily:'inherit', boxSizing:'border-box' }}
                      placeholder="住所を入力" />
                  </div>

                  <div style={{ marginBottom:'12px' }}>
                    <label style={{ fontSize:'12px', color:'#888780', display:'block',
                      marginBottom:'4px' }}>配達時間 *</label>
                    <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                      <select value={form.timeStart}
                        onChange={(e) => setForm({ ...form, timeStart: e.target.value })}
                        style={{ flex:1, padding:'10px', border:'1.5px solid #E5E1D8',
                          borderRadius:'8px', fontSize:'14px', fontFamily:'inherit' }}>
                        <option value="">開始</option>
                        {DELIVERY_TIMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span style={{ color:'#888780' }}>〜</span>
                      <select value={form.timeEnd}
                        onChange={(e) => setForm({ ...form, timeEnd: e.target.value })}
                        style={{ flex:1, padding:'10px', border:'1.5px solid #E5E1D8',
                          borderRadius:'8px', fontSize:'14px', fontFamily:'inherit' }}>
                        <option value="">終了</option>
                        {DELIVERY_TIMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* 用途 */}
              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'12px', color:'#888780', display:'block',
                  marginBottom:'8px' }}>用途</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                  {PURPOSES.map((p) => (
                    <button key={p}
                      onClick={() => {
                        const ps = form.purposes.includes(p)
                          ? form.purposes.filter((x) => x !== p)
                          : [...form.purposes, p]
                        setForm({ ...form, purposes: ps })
                      }}
                      style={{ padding:'6px 12px',
                        background: form.purposes.includes(p) ? '#72243E' : 'white',
                        color: form.purposes.includes(p) ? 'white' : '#2C2C2A',
                        border: '1.5px solid',
                        borderColor: form.purposes.includes(p) ? '#72243E' : '#E5E1D8',
                        borderRadius:'20px', fontSize:'13px', cursor:'pointer',
                        fontFamily:'inherit' }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* おかず */}
              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'12px', color:'#888780', display:'block',
                  marginBottom:'4px' }}>おかず・オプション</label>
                <input type="text" value={form.okazu}
                  onChange={(e) => setForm({ ...form, okazu: e.target.value })}
                  style={{ width:'100%', padding:'10px 12px',
                    border:'1.5px solid #E5E1D8', borderRadius:'8px',
                    fontSize:'14px', fontFamily:'inherit', boxSizing:'border-box' }}
                  placeholder="例: 唐揚げ追加" />
              </div>

              {/* 領収書 */}
              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'12px', color:'#888780', display:'block',
                  marginBottom:'8px' }}>領収書</label>
                <div style={{ display:'flex', gap:'8px' }}>
                  {[{v:'no',l:'不要'},{v:'yes',l:'必要'}].map(({ v, l }) => (
                    <button key={v}
                      onClick={() => setForm({ ...form, receipt: v })}
                      style={{ flex:1, padding:'10px',
                        background: form.receipt === v ? '#72243E' : 'white',
                        color: form.receipt === v ? 'white' : '#2C2C2A',
                        border: '1.5px solid',
                        borderColor: form.receipt === v ? '#72243E' : '#E5E1D8',
                        borderRadius:'8px', fontSize:'14px', cursor:'pointer',
                        fontFamily:'inherit' }}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.receipt === 'yes' && (
                  <input type="text" value={form.receiptName}
                    onChange={(e) => setForm({ ...form, receiptName: e.target.value })}
                    style={{ width:'100%', padding:'10px 12px', marginTop:'8px',
                      border:'1.5px solid #E5E1D8', borderRadius:'8px',
                      fontSize:'14px', fontFamily:'inherit', boxSizing:'border-box' }}
                    placeholder="宛名を入力" />
                )}
              </div>

              {/* 備考 */}
              <div style={{ marginBottom:'16px' }}>
                <label style={{ fontSize:'12px', color:'#888780', display:'block',
                  marginBottom:'4px' }}>備考</label>
                <textarea value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  style={{ width:'100%', padding:'10px 12px',
                    border:'1.5px solid #E5E1D8', borderRadius:'8px',
                    fontSize:'14px', fontFamily:'inherit', boxSizing:'border-box',
                    resize:'none', minHeight:'60px' }}
                  placeholder="その他ご要望" />
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                style={{ width:'100%', padding:'14px',
                  background: submitting ? '#888780' : '#72243E',
                  color:'white', border:'none', borderRadius:'12px',
                  fontSize:'15px', fontWeight:500, cursor:'pointer',
                  fontFamily:'inherit' }}>
                {submitting ? '送信中...' : '注文を送信する'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 完了画面 */}
      {screen === 'complete' && (
        <>
          <div style={headerStyle('#72243E','#A93226')}>
            <div style={{ fontSize:'20px', fontWeight:500 }}>注文完了</div>
          </div>
          <div style={{ padding:'40px', textAlign:'center' }}>
            <div style={{ fontSize:'48px', marginBottom:'16px' }}>✅</div>
            <div style={{ fontSize:'18px', fontWeight:500, marginBottom:'8px' }}>
              注文を受け付けました
            </div>
            <div style={{ fontSize:'13px', color:'#888780', marginBottom:'32px' }}>
              {selectedDate} のご注文
            </div>
            <button onClick={() => {
              setScreen('list')
              setForm({
                customerName:'', phone:'', deliveryMode:'',
                address:'', timeStart:'', timeEnd:'',
                receipt:'no', receiptName:'', purposes:[], okazu:'', notes:'',
              })
              setQuantities({})
            }}
              style={{ padding:'14px 32px', background:'#72243E',
                color:'white', border:'none', borderRadius:'12px',
                fontSize:'15px', fontWeight:500, cursor:'pointer',
                fontFamily:'inherit' }}>
              注文一覧に戻る
            </button>
          </div>
        </>
      )}

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

      {/* 確認モーダル */}
      {confirm && (
        <div style={{ position:'fixed', inset:0,
          background:'rgba(0,0,0,.5)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:'16px',
            padding:'24px', margin:'20px', maxWidth:'320px', width:'100%',
            textAlign:'center' }}>
            <p style={{ fontSize:'15px', fontWeight:500, marginBottom:'20px',
              color:'#2C2C2A' }}>{confirm.msg}</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setConfirm(null)}
                style={{ flex:1, padding:'12px', border:'1.5px solid #E5E1D8',
                  borderRadius:'10px', background:'white', fontSize:'14px',
                  cursor:'pointer', fontFamily:'inherit' }}>
                キャンセル
              </button>
              <button onClick={() => { confirm.onOk(); setConfirm(null) }}
                style={{ flex:1, padding:'12px', border:'none',
                  background:'#E24B4A', color:'white', borderRadius:'10px',
                  fontSize:'14px', fontWeight:500, cursor:'pointer',
                  fontFamily:'inherit' }}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
