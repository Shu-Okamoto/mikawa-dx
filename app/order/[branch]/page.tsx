'use client'

import { useEffect, useState, useCallback, Suspense, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { themeForBranch } from '@/lib/storeColors'
import { canOrderFor } from '@/lib/orderDeadline'

interface OrderProduct {
  id           : number
  productCode  : string
  productName  : string
  category     : string
  price        : number
  availableDays: string
  lateOrderOk  : boolean
}

interface InstoreOrder {
  id             : number
  orderCode      : string
  deliveryDate   : string
  productId      : number | null
  productName    : string
  quantity       : number
  price          : number
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

type EditDraft = {
  quantity       : number
  customerName   : string
  phone          : string
  deliveryAddress: string
  timeStart      : string
  timeEnd        : string
  receipt        : string
  receiptName    : string
  purposes       : string[]
  okazu          : string
  notes          : string
}

type Screen = 'list' | 'date' | 'product' | 'form' | 'complete'

const PURPOSES = ['自家用','会議','法事','スポーツ','お年寄り','子供','袋付き']
const DELIVERY_TIMES = [
  '9:00','9:30','10:00','10:30','11:00','11:30',
  '12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30',
]

const VALID_BRANCHES = new Set(['nishi', 'minami', 'honbu'])
const BRANCH_LABELS: Record<string, string> = {
  nishi : '西店',
  minami: '南店',
  honbu : '本部',
}
const HQ_ROLES = new Set(['hq1', 'hq2', 'hq3'])

function canRoleAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  if (branch === 'honbu') return HQ_ROLES.has(role)
  return role === branch
}

function OrderPageContent({ branch }: { branch: string }) {
  const router = useRouter()
  const { user, loading, error, authFetch, logout } = useAuth(
    ['nishi', 'minami', 'hq1', 'hq2', 'hq3', 'all'],
    { autoLoginRole: VALID_BRANCHES.has(branch)
        ? (branch === 'honbu' ? 'hq1' : branch)
        : undefined },
  )
  const [screen, setScreen]         = useState<Screen>('list')
  const [orders, setOrders]         = useState<InstoreOrder[]>([])
  const [products, setProducts]     = useState<OrderProduct[]>([])
  const [availDates, setAvailDates] = useState<{ value: string; label: string }[]>([])
  const [toast, setToast]           = useState('')
  const [confirm, setConfirm]       = useState<{ msg: string; onOk: () => void } | null>(null)

  const [selectedDate, setSelectedDate]       = useState('')
  const [quantities, setQuantities]           = useState<Record<number, number>>({})
  const [customProducts, setCustomProducts]   = useState<OrderProduct[]>([])
  const [customModal, setCustomModal]         =
    useState<{ name: string; price: string; qty: number; category: string } | null>(null)
  const [form, setForm] = useState({
    customerName: '',
    phone       : '',
    deliveryMode: '',
    address     : '',
    timeStart   : '',
    timeEnd     : '',
    receipt     : 'no',
    receiptName : '',
    purposes    : [] as string[],
    okazu       : '',
    notes       : '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing]       = useState<InstoreOrder | null>(null)
  const [editDraft, setEditDraft]   = useState<EditDraft | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (loading || error || !user) return
    if (!VALID_BRANCHES.has(branch)) {
      router.replace('/')
      return
    }
    if (!canRoleAccessBranch(user.role, branch)) {
      router.replace('/')
    }
  }, [branch, user, loading, error, router])

  const branchLabel = BRANCH_LABELS[branch] ?? branch

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const showConfirm = (msg: string, onOk: () => void) => {
    setConfirm({ msg, onOk })
  }

  const fetchOrders = useCallback(async () => {
    if (!user) return
    if (!VALID_BRANCHES.has(branch)) return
    if (!canRoleAccessBranch(user.role, branch)) return
    const res  = await authFetch(`/api/orders?branch=${branch}`)
    const data = await res.json()
    setOrders(Array.isArray(data) ? data : [])
  }, [user, branch, authFetch])

  const buildAvailDates = useCallback(() => {
    const dates: { value: string; label: string }[] = []
    const days  = ['日','月','火','水','木','金','土']
    for (let i = 1; i <= 30; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      if (d.getDay() === 0) continue // 日曜は除外
      const str = d.getFullYear() + '/' +
        ('0'+(d.getMonth()+1)).slice(-2) + '/' +
        ('0'+d.getDate()).slice(-2)
      const label = (d.getMonth()+1) + '月' + d.getDate() +
        '日(' + days[d.getDay()] + ')'
      dates.push({ value: str, label })
    }
    setAvailDates(dates)
  }, [])

  useEffect(() => {
    if (!loading && !error) {
      fetchOrders()
      buildAvailDates()
    }
  }, [loading, error, fetchOrders, buildAvailDates])

  const handleDateSelect = async (date: string) => {
    setSelectedDate(date)
    const res  = await authFetch(
      `/api/order-products?deliveryDate=${encodeURIComponent(date)}`,
    )
    const data = await res.json()
    // 締切過ぎの商品は非表示
    const now = new Date()
    const filtered = Array.isArray(data)
      ? data.filter((p: OrderProduct) => canOrderFor(date, !!p.lateOrderOk, now))
      : []
    setProducts(filtered)
    setQuantities({})
    setCustomProducts([])
    setScreen('product')
  }

  const addCustomProduct = () => {
    if (!customModal) return
    const name  = customModal.name.trim()
    if (!name) { showToast('商品名を入力してください'); return }
    const price = parseInt(customModal.price, 10) || 0
    const qty   = customModal.qty > 0 ? customModal.qty : 1
    const id    = -Date.now()
    setCustomProducts((prev) => [...prev, {
      id,
      productCode  : '',
      productName  : name,
      category     : customModal.category,
      price,
      availableDays: '',
      lateOrderOk  : false,
    }])
    setQuantities((q) => ({ ...q, [id]: qty }))
    setCustomModal(null)
    showToast(name + ' を追加しました')
  }

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

    const allItems   = [...products, ...customProducts]
    const orderItems = allItems.filter((p) => (quantities[p.id] || 0) > 0)
    if (orderItems.length === 0) { showToast('商品を選択してください'); return }

    setSubmitting(true)
    let hasError = false
    for (const p of orderItems) {
      const res = await authFetch('/api/orders', {
        method: 'POST',
        body  : JSON.stringify({
          branch,
          deliveryDate   : selectedDate,
          productId      : p.id > 0 ? p.id : null,
          productName    : p.productName,
          category       : p.category || null,
          quantity       : quantities[p.id],
          price          : Number(p.price) || 0,
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

  const openEdit = (order: InstoreOrder) => {
    const [s, e] = (order.deliveryTime || '').split('〜')
    setEditing(order)
    setEditDraft({
      quantity       : Number(order.quantity) || 1,
      customerName   : order.customerName || '',
      phone          : order.phone || '',
      deliveryAddress: order.deliveryAddress || '',
      timeStart      : order.deliveryAddress === '来店' ? '' : (s || ''),
      timeEnd        : order.deliveryAddress === '来店' ? '' : (e || ''),
      receipt        : order.receipt || 'no',
      receiptName    : order.receiptName || '',
      purposes       : order.purpose ? order.purpose.split('・').filter(Boolean) : [],
      okazu          : order.okazu || '',
      notes          : order.notes || '',
    })
  }

  const closeEdit = () => {
    setEditing(null)
    setEditDraft(null)
  }

  const submitEdit = async () => {
    if (!editing || !editDraft) return
    if (!editDraft.customerName) { showToast('お名前を入力してください'); return }
    if (!editDraft.phone)        { showToast('電話番号を入力してください'); return }
    if (!/^[0-9]{10,11}$/.test(editDraft.phone)) {
      showToast('電話番号はハイフンなし10〜11桁で入力してください'); return
    }
    const isVisit = editDraft.deliveryAddress === '来店'
    let deliveryTime: string
    if (isVisit) {
      deliveryTime = '来店'
    } else {
      if (!editDraft.timeStart || !editDraft.timeEnd) {
        showToast('配達時間を選択してください'); return
      }
      const toNum = (t: string) => {
        const [h, m] = t.split(':').map(Number)
        return h + m / 60
      }
      if (toNum(editDraft.timeEnd) <= toNum(editDraft.timeStart)) {
        showToast('終了時間は開始時間より後にしてください'); return
      }
      deliveryTime = editDraft.timeStart + '〜' + editDraft.timeEnd
    }

    setEditSaving(true)
    const res = await authFetch(`/api/orders/${editing.id}`, {
      method: 'PATCH',
      body  : JSON.stringify({
        quantity       : editDraft.quantity,
        customerName   : editDraft.customerName,
        phone          : editDraft.phone,
        deliveryAddress: editDraft.deliveryAddress,
        deliveryTime,
        receipt        : editDraft.receipt,
        receiptName    : editDraft.receipt === 'yes' ? editDraft.receiptName : '',
        purpose        : editDraft.purposes.join('・'),
        okazu          : editDraft.okazu,
        notes          : editDraft.notes,
      }),
    })
    const data = await res.json()
    setEditSaving(false)
    if (data.success) {
      showToast('更新しました')
      closeEdit()
      fetchOrders()
    } else {
      showToast('エラー: ' + (data.error ?? '不明'))
    }
  }

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

  const theme       = themeForBranch(branch)
  const headerStyle = () => ({
    background: `linear-gradient(135deg,${theme.from},${theme.to})`,
    color: 'white', padding: '20px 16px 16px',
    position: 'sticky' as const, top: 0, zIndex: 10,
  })

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      {/* 注文一覧画面 */}
      {screen === 'list' && (
        <>
          <div style={headerStyle()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>惣菜注文受付</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>{branchLabel}</div>
                {user?.name && (
                  <div style={{ fontSize:'12px', opacity:.85, marginTop:'2px' }}>
                    {user.name}
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={() => setScreen('date')}
                  style={{ padding:'10px 16px', background:'white',
                    color:theme.accent, border:'none', borderRadius:'10px',
                    fontSize:'16px', fontWeight:500, cursor:'pointer',
                    fontFamily:'inherit' }}>
                  ＋ 新規注文
                </button>
                <button onClick={logout}
                  style={{ padding:'10px 14px', background:'rgba(255,255,255,.2)',
                    border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                    color:'white', fontSize:'16px', cursor:'pointer',
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
                    alignItems:'center', marginBottom:'10px' }}>
                    <div style={{ fontSize:'18px', fontWeight:500, color:'#2C2C2A' }}>
                      {new Date(o.deliveryDate).toLocaleDateString('ja-JP')} {o.productName}
                    </div>
                    <span style={{ fontSize:'16px', background:'#EAF3DE',
                      color:'#3B6D11', padding:'3px 10px', borderRadius:'12px',
                      fontWeight:500 }}>
                      {Number(o.quantity)}個
                    </span>
                  </div>
                  <div style={{ fontSize:'15px', color:'#2C2C2A', marginBottom:'4px' }}>
                    {o.customerName} 様 / {o.phone}
                  </div>
                  <div style={{ fontSize:'15px', color:'#2C2C2A', marginBottom:'4px',
                    display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
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
                  </div>
                  <div style={{ fontSize:'15px', color:'#2C2C2A', marginBottom:'6px' }}>
                    単価{Number(o.price || 0).toLocaleString()}円
                    ×{Number(o.quantity || 0)}個
                    <span style={{ color:'#888780' }}>
                      {' / '}合計{(Number(o.price || 0) * Number(o.quantity || 0)).toLocaleString()}円
                    </span>
                  </div>
                  {o.purpose && (
                    <div style={{ fontSize:'14px', color:'#5F5E5A', marginBottom:'3px' }}>
                      <span style={{ color:'#A8A69E' }}>用途: </span>{o.purpose}
                    </div>
                  )}
                  {o.okazu && (
                    <div style={{ fontSize:'14px', color:'#5F5E5A', marginBottom:'3px' }}>
                      <span style={{ color:'#A8A69E' }}>おかず: </span>{o.okazu}
                    </div>
                  )}
                  {o.notes && (
                    <div style={{ fontSize:'14px', color:'#5F5E5A', marginBottom:'3px' }}>
                      <span style={{ color:'#A8A69E' }}>備考: </span>{o.notes}
                    </div>
                  )}
                  <div style={{ fontSize:'14px', color:'#5F5E5A', marginBottom:'10px' }}>
                    <span style={{ color:'#A8A69E' }}>領収書: </span>
                    {o.receipt === 'yes' ? 'あり' : 'なし'}
                    {o.receipt === 'yes' && (
                      <>
                        <span style={{ color:'#A8A69E', marginLeft:'12px' }}>宛名: </span>
                        {o.receiptName ? o.receiptName : 'なし'}
                      </>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <button onClick={() => openEdit(o)}
                      style={{ flex:1, padding:'10px', background:'#72243E',
                        color:'white', border:'none', borderRadius:'10px',
                        fontSize:'16px', fontWeight:500, cursor:'pointer',
                        fontFamily:'inherit' }}>
                      ✏️ 編集
                    </button>
                    <button onClick={() => handleCancel(o.id)}
                      style={{ flex:1, padding:'10px', background:'white',
                        border:'1.5px solid #E24B4A', borderRadius:'10px',
                        fontSize:'16px', color:'#E24B4A', fontWeight:500,
                        cursor:'pointer', fontFamily:'inherit' }}>
                      キャンセル
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* 日付選択 */}
      {screen === 'date' && (
        <>
          <div style={headerStyle()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>配達日を選択</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>日付選択</div>
              </div>
              <button onClick={() => setScreen('list')}
                style={{ padding:'10px 16px', background:'rgba(255,255,255,.2)',
                  border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                  color:'white', fontSize:'16px', cursor:'pointer', fontFamily:'inherit' }}>
                戻る
              </button>
            </div>
          </div>

          <div style={{ padding:'12px' }}>
            <div style={{ background:'white', borderRadius:'16px', overflow:'hidden',
              boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
              {availDates.map((d, idx) => (
                <button key={d.value} onClick={() => handleDateSelect(d.value)}
                  style={{ width:'100%', padding:'18px 16px', textAlign:'left',
                    background:'white', border:'none',
                    borderBottom: idx < availDates.length-1
                      ? '1px solid #F5F1EA' : 'none',
                    fontSize:'20px', cursor:'pointer', fontFamily:'inherit',
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
          <div style={headerStyle()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>商品を選択</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>{selectedDate}</div>
              </div>
              <button onClick={() => setScreen('date')}
                style={{ padding:'10px 16px', background:'rgba(255,255,255,.2)',
                  border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                  color:'white', fontSize:'16px', cursor:'pointer', fontFamily:'inherit' }}>
                戻る
              </button>
            </div>
          </div>

          <div style={{ padding:'12px' }}>
            {(() => {
              const allProducts = [...products, ...customProducts]
              const STD_CATS    = ['弁当', '餅']
              const CAT_ICONS: Record<string, string> = {
                '弁当': '🍱', '餅': '🍡',
              }
              const extraCats   = Array.from(new Set(
                allProducts.map((p) => p.category).filter(
                  (c) => c && !STD_CATS.includes(c),
                ),
              ))
              const categories  = [...STD_CATS, ...extraCats]
              const hasAnyQty   = allProducts.some((p) => (quantities[p.id] || 0) > 0)

              return (
              <>
                {categories.map((cat) => {
                  const items = allProducts.filter((p) => p.category === cat)
                  const icon  = CAT_ICONS[cat] || '📦'
                  return (
                  <div key={cat} style={{ marginBottom:'12px' }}>
                    <div style={{ fontSize:'15px', fontWeight:500,
                      padding:'4px 4px 8px', color:'#2C2C2A',
                      display:'flex', alignItems:'center', gap:'6px' }}>
                      <span style={{ fontSize:'18px' }}>{icon}</span>
                      {cat}
                      <span style={{ fontSize:'12px', color:'#888780', fontWeight:400 }}>
                        ({items.length}品目)
                      </span>
                    </div>

                    <div style={{ background:'white', borderRadius:'16px',
                      overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
                      {items.length === 0 ? (
                        <div style={{ padding:'20px', textAlign:'center',
                          color:'#B4B2A9', fontSize:'13px' }}>
                          この日に注文できる{cat}はありません
                        </div>
                      ) : items.map((p, idx) => {
                        const qty      = quantities[p.id] || 0
                        const isCustom = p.id < 0
                        return (
                        <div key={p.id} style={{ padding:'14px 16px',
                          borderBottom: idx < items.length-1
                            ? '1px solid #F5F1EA' : 'none',
                          display:'flex', justifyContent:'space-between',
                          alignItems:'center' }}>
                          <div>
                            <div style={{ fontSize:'20px', fontWeight:500,
                              display:'flex', alignItems:'center', gap:'8px' }}>
                              {p.productName}
                              {isCustom && (
                                <span style={{ fontSize:'11px', fontWeight:500,
                                  padding:'2px 8px', borderRadius:'8px',
                                  background:'#FBF8F2', color:'#888780',
                                  border:'1px solid #E5E1D8' }}>マスタ外</span>
                              )}
                            </div>
                            <div style={{ fontSize:'15px', color:'#888780' }}>
                              ¥{Number(p.price).toLocaleString()}
                            </div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                            <button onClick={() => setQuantities({
                              ...quantities,
                              [p.id]: Math.max(0, qty - 1)
                            })}
                              style={{ width:'36px', height:'36px', borderRadius:'50%',
                                border:'1.5px solid #E5E1D8', background:'white',
                                fontSize:'20px', cursor:'pointer', fontFamily:'inherit' }}>
                              -
                            </button>
                            <span style={{ minWidth:'28px', textAlign:'center',
                              fontSize:'20px', fontWeight:500 }}>
                              {qty}
                            </span>
                            <button onClick={() => setQuantities({
                              ...quantities,
                              [p.id]: qty + 1
                            })}
                              style={{ width:'36px', height:'36px', borderRadius:'50%',
                                border: qty > 0 ? '1.5px solid #72243E' : '1.5px solid #E5E1D8',
                                background: qty > 0 ? '#72243E' : 'white',
                                color: qty > 0 ? 'white' : '#2C2C2A',
                                fontSize:'20px', cursor:'pointer', fontFamily:'inherit' }}>
                              +
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>

                    <button
                      onClick={() => setCustomModal({
                        name:'', price:'', qty:1, category: cat,
                      })}
                      style={{ width:'100%', padding:'10px', background:'white',
                        color:'#888780', border:'1.5px dashed #D6D2C7',
                        borderRadius:'10px', fontSize:'14px',
                        cursor:'pointer', fontFamily:'inherit',
                        marginTop:'8px' }}>
                      ＋ {cat}を追加（マスタ外）
                    </button>
                  </div>
                  )
                })}

                <button
                  onClick={() => {
                    if (!hasAnyQty) {
                      showToast('商品を選択してください')
                      return
                    }
                    setScreen('form')
                  }}
                  style={{ width:'100%', padding:'16px',
                    background: hasAnyQty ? '#72243E' : '#B4B2A9',
                    color:'white', border:'none', borderRadius:'12px',
                    fontSize:'20px', fontWeight:500,
                    cursor: hasAnyQty ? 'pointer' : 'not-allowed',
                    fontFamily:'inherit', marginTop:'4px' }}>
                  お客様情報を入力する
                </button>
              </>
              )
            })()}
          </div>
        </>
      )}

      {/* お客様情報入力 */}
      {screen === 'form' && (
        <>
          <div style={headerStyle()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>お客様情報</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>{selectedDate}</div>
              </div>
              <button onClick={() => setScreen('product')}
                style={{ padding:'10px 16px', background:'rgba(255,255,255,.2)',
                  border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                  color:'white', fontSize:'16px', cursor:'pointer', fontFamily:'inherit' }}>
                戻る
              </button>
            </div>
          </div>

          <div style={{ padding:'12px' }}>
            <div style={{ background:'white', borderRadius:'16px', padding:'16px',
              marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>

              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                  display:'block', marginBottom:'6px' }}>お名前 *</label>
                <input type="text" value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  style={{ width:'100%', padding:'12px 14px',
                    border:'1.5px solid #E5E1D8', borderRadius:'10px',
                    fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }}
                  placeholder="山田 太郎" />
              </div>

              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                  display:'block', marginBottom:'6px' }}>電話番号（ハイフンなし）*</label>
                <input type="tel" value={form.phone} inputMode="numeric"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  style={{ width:'100%', padding:'12px 14px',
                    border:'1.5px solid #E5E1D8', borderRadius:'10px',
                    fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }}
                  placeholder="09012345678" />
              </div>

              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                  display:'block', marginBottom:'8px' }}>お受け取り方法 *</label>
                <div style={{ display:'flex', gap:'8px' }}>
                  {['visit','delivery'].map((mode) => (
                    <button key={mode}
                      onClick={() => setForm({ ...form, deliveryMode: mode })}
                      style={{ flex:1, padding:'14px',
                        background: form.deliveryMode === mode ? '#72243E' : 'white',
                        color: form.deliveryMode === mode ? 'white' : '#2C2C2A',
                        border: '1.5px solid',
                        borderColor: form.deliveryMode === mode ? '#72243E' : '#E5E1D8',
                        borderRadius:'10px', fontSize:'20px', fontWeight:500,
                        cursor:'pointer', fontFamily:'inherit' }}>
                      {mode === 'visit' ? '🏪 来店' : '🚗 配達'}
                    </button>
                  ))}
                </div>
              </div>

              {form.deliveryMode === 'delivery' && (
                <>
                  <div style={{ marginBottom:'12px' }}>
                    <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                      display:'block', marginBottom:'6px' }}>配達先住所 *</label>
                    <input type="text" value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      style={{ width:'100%', padding:'12px 14px',
                        border:'1.5px solid #E5E1D8', borderRadius:'10px',
                        fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }}
                      placeholder="住所を入力" />
                  </div>

                  <div style={{ marginBottom:'12px' }}>
                    <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                      display:'block', marginBottom:'6px' }}>配達時間 *</label>
                    <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                      <select value={form.timeStart}
                        onChange={(e) => setForm({ ...form, timeStart: e.target.value })}
                        style={{ flex:1, padding:'12px', border:'1.5px solid #E5E1D8',
                          borderRadius:'10px', fontSize:'20px', fontFamily:'inherit' }}>
                        <option value="">開始</option>
                        {DELIVERY_TIMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <span style={{ color:'#888780' }}>〜</span>
                      <select value={form.timeEnd}
                        onChange={(e) => setForm({ ...form, timeEnd: e.target.value })}
                        style={{ flex:1, padding:'12px', border:'1.5px solid #E5E1D8',
                          borderRadius:'10px', fontSize:'20px', fontFamily:'inherit' }}>
                        <option value="">終了</option>
                        {DELIVERY_TIMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                  display:'block', marginBottom:'8px' }}>用途</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                  {PURPOSES.map((p) => (
                    <button key={p}
                      onClick={() => {
                        const ps = form.purposes.includes(p)
                          ? form.purposes.filter((x) => x !== p)
                          : [...form.purposes, p]
                        setForm({ ...form, purposes: ps })
                      }}
                      style={{ padding:'10px 16px',
                        background: form.purposes.includes(p) ? '#72243E' : 'white',
                        color: form.purposes.includes(p) ? 'white' : '#2C2C2A',
                        border: '1.5px solid',
                        borderColor: form.purposes.includes(p) ? '#72243E' : '#E5E1D8',
                        borderRadius:'20px', fontSize:'17px', cursor:'pointer',
                        fontFamily:'inherit' }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                  display:'block', marginBottom:'6px' }}>おかず・オプション</label>
                <input type="text" value={form.okazu}
                  onChange={(e) => setForm({ ...form, okazu: e.target.value })}
                  style={{ width:'100%', padding:'12px 14px',
                    border:'1.5px solid #E5E1D8', borderRadius:'10px',
                    fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }}
                  placeholder="例: 唐揚げ追加" />
              </div>

              <div style={{ marginBottom:'12px' }}>
                <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                  display:'block', marginBottom:'8px' }}>領収書</label>
                <div style={{ display:'flex', gap:'8px' }}>
                  {[{v:'no',l:'不要'},{v:'yes',l:'必要'}].map(({ v, l }) => (
                    <button key={v}
                      onClick={() => setForm({ ...form, receipt: v })}
                      style={{ flex:1, padding:'14px',
                        background: form.receipt === v ? '#72243E' : 'white',
                        color: form.receipt === v ? 'white' : '#2C2C2A',
                        border: '1.5px solid',
                        borderColor: form.receipt === v ? '#72243E' : '#E5E1D8',
                        borderRadius:'10px', fontSize:'20px', fontWeight:500,
                        cursor:'pointer', fontFamily:'inherit' }}>
                      {l}
                    </button>
                  ))}
                </div>
                {form.receipt === 'yes' && (
                  <input type="text" value={form.receiptName}
                    onChange={(e) => setForm({ ...form, receiptName: e.target.value })}
                    style={{ width:'100%', padding:'12px 14px', marginTop:'8px',
                      border:'1.5px solid #E5E1D8', borderRadius:'10px',
                      fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }}
                    placeholder="宛名を入力" />
                )}
              </div>

              <div style={{ marginBottom:'16px' }}>
                <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                  display:'block', marginBottom:'6px' }}>備考</label>
                <textarea value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  style={{ width:'100%', padding:'12px 14px',
                    border:'1.5px solid #E5E1D8', borderRadius:'10px',
                    fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box',
                    resize:'none', minHeight:'72px' }}
                  placeholder="その他ご要望" />
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                style={{ width:'100%', padding:'16px',
                  background: submitting ? '#888780' : '#72243E',
                  color:'white', border:'none', borderRadius:'12px',
                  fontSize:'20px', fontWeight:500, cursor:'pointer',
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
          <div style={headerStyle()}>
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
              setCustomProducts([])
            }}
              style={{ padding:'16px 32px', background:'#72243E',
                color:'white', border:'none', borderRadius:'12px',
                fontSize:'20px', fontWeight:500, cursor:'pointer',
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

      {/* 編集モーダル */}
      {editing && editDraft && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
          zIndex:200, display:'flex', alignItems:'flex-start',
          justifyContent:'center', overflowY:'auto', padding:'20px 12px' }}>
          <div style={{ background:'white', borderRadius:'16px',
            padding:'20px', maxWidth:'480px', width:'100%' }}>
            <div style={{ fontSize:'20px', fontWeight:500, marginBottom:'16px',
              color:'#2C2C2A' }}>
              ✏️ 注文を編集
            </div>
            <div style={{ fontSize:'16px', color:'#888780', marginBottom:'16px' }}>
              {editing.productName}
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                display:'block', marginBottom:'6px' }}>数量</label>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <button onClick={() => setEditDraft({
                  ...editDraft, quantity: Math.max(1, editDraft.quantity - 1),
                })}
                  style={{ width:'40px', height:'40px', borderRadius:'50%',
                    border:'1.5px solid #E5E1D8', background:'white',
                    fontSize:'20px', cursor:'pointer', fontFamily:'inherit' }}>
                  -
                </button>
                <span style={{ minWidth:'36px', textAlign:'center',
                  fontSize:'22px', fontWeight:500 }}>{editDraft.quantity}</span>
                <button onClick={() => setEditDraft({
                  ...editDraft, quantity: editDraft.quantity + 1,
                })}
                  style={{ width:'40px', height:'40px', borderRadius:'50%',
                    border:'1.5px solid #72243E', background:'#72243E',
                    color:'white', fontSize:'20px', cursor:'pointer',
                    fontFamily:'inherit' }}>
                  +
                </button>
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                display:'block', marginBottom:'6px' }}>お名前 *</label>
              <input type="text" value={editDraft.customerName}
                onChange={(e) => setEditDraft({ ...editDraft, customerName: e.target.value })}
                style={{ width:'100%', padding:'12px 14px',
                  border:'1.5px solid #E5E1D8', borderRadius:'10px',
                  fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }} />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                display:'block', marginBottom:'6px' }}>電話番号 *</label>
              <input type="tel" inputMode="numeric" value={editDraft.phone}
                onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                style={{ width:'100%', padding:'12px 14px',
                  border:'1.5px solid #E5E1D8', borderRadius:'10px',
                  fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }} />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                display:'block', marginBottom:'8px' }}>お受け取り方法 *</label>
              <div style={{ display:'flex', gap:'8px' }}>
                {[
                  { v:'visit', l:'🏪 来店' },
                  { v:'delivery', l:'🚗 配達' },
                ].map(({ v, l }) => {
                  const isVisit = editDraft.deliveryAddress === '来店'
                  const active = (v === 'visit') === isVisit
                  return (
                    <button key={v}
                      onClick={() => setEditDraft({
                        ...editDraft,
                        deliveryAddress: v === 'visit' ? '来店' : (
                          editDraft.deliveryAddress === '来店' ? '' : editDraft.deliveryAddress
                        ),
                        timeStart: v === 'visit' ? '' : editDraft.timeStart,
                        timeEnd  : v === 'visit' ? '' : editDraft.timeEnd,
                      })}
                      style={{ flex:1, padding:'14px',
                        background: active ? '#72243E' : 'white',
                        color: active ? 'white' : '#2C2C2A',
                        border: '1.5px solid',
                        borderColor: active ? '#72243E' : '#E5E1D8',
                        borderRadius:'10px', fontSize:'20px', fontWeight:500,
                        cursor:'pointer', fontFamily:'inherit' }}>
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>

            {editDraft.deliveryAddress !== '来店' && (
              <>
                <div style={{ marginBottom:'14px' }}>
                  <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                    display:'block', marginBottom:'6px' }}>配達先住所 *</label>
                  <input type="text" value={editDraft.deliveryAddress}
                    onChange={(e) => setEditDraft({ ...editDraft, deliveryAddress: e.target.value })}
                    style={{ width:'100%', padding:'12px 14px',
                      border:'1.5px solid #E5E1D8', borderRadius:'10px',
                      fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }} />
                </div>

                <div style={{ marginBottom:'14px' }}>
                  <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                    display:'block', marginBottom:'6px' }}>配達時間 *</label>
                  <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                    <select value={editDraft.timeStart}
                      onChange={(e) => setEditDraft({ ...editDraft, timeStart: e.target.value })}
                      style={{ flex:1, padding:'12px', border:'1.5px solid #E5E1D8',
                        borderRadius:'10px', fontSize:'20px', fontFamily:'inherit' }}>
                      <option value="">開始</option>
                      {DELIVERY_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span style={{ color:'#888780' }}>〜</span>
                    <select value={editDraft.timeEnd}
                      onChange={(e) => setEditDraft({ ...editDraft, timeEnd: e.target.value })}
                      style={{ flex:1, padding:'12px', border:'1.5px solid #E5E1D8',
                        borderRadius:'10px', fontSize:'20px', fontFamily:'inherit' }}>
                      <option value="">終了</option>
                      {DELIVERY_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                display:'block', marginBottom:'8px' }}>用途</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                {PURPOSES.map((p) => {
                  const active = editDraft.purposes.includes(p)
                  return (
                    <button key={p}
                      onClick={() => setEditDraft({
                        ...editDraft,
                        purposes: active
                          ? editDraft.purposes.filter((x) => x !== p)
                          : [...editDraft.purposes, p],
                      })}
                      style={{ padding:'10px 16px',
                        background: active ? '#72243E' : 'white',
                        color: active ? 'white' : '#2C2C2A',
                        border: '1.5px solid',
                        borderColor: active ? '#72243E' : '#E5E1D8',
                        borderRadius:'20px', fontSize:'17px', cursor:'pointer',
                        fontFamily:'inherit' }}>
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                display:'block', marginBottom:'6px' }}>おかず・オプション</label>
              <input type="text" value={editDraft.okazu}
                onChange={(e) => setEditDraft({ ...editDraft, okazu: e.target.value })}
                style={{ width:'100%', padding:'12px 14px',
                  border:'1.5px solid #E5E1D8', borderRadius:'10px',
                  fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }} />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                display:'block', marginBottom:'8px' }}>領収書</label>
              <div style={{ display:'flex', gap:'8px' }}>
                {[{v:'no',l:'不要'},{v:'yes',l:'必要'}].map(({ v, l }) => (
                  <button key={v}
                    onClick={() => setEditDraft({ ...editDraft, receipt: v })}
                    style={{ flex:1, padding:'14px',
                      background: editDraft.receipt === v ? '#72243E' : 'white',
                      color: editDraft.receipt === v ? 'white' : '#2C2C2A',
                      border: '1.5px solid',
                      borderColor: editDraft.receipt === v ? '#72243E' : '#E5E1D8',
                      borderRadius:'10px', fontSize:'20px', fontWeight:500,
                      cursor:'pointer', fontFamily:'inherit' }}>
                    {l}
                  </button>
                ))}
              </div>
              {editDraft.receipt === 'yes' && (
                <input type="text" value={editDraft.receiptName}
                  onChange={(e) => setEditDraft({ ...editDraft, receiptName: e.target.value })}
                  style={{ width:'100%', padding:'12px 14px', marginTop:'8px',
                    border:'1.5px solid #E5E1D8', borderRadius:'10px',
                    fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box' }}
                  placeholder="宛名を入力" />
              )}
            </div>

            <div style={{ marginBottom:'18px' }}>
              <label style={{ fontSize:'16px', color:'#2C2C2A', fontWeight:500,
                display:'block', marginBottom:'6px' }}>備考</label>
              <textarea value={editDraft.notes}
                onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                style={{ width:'100%', padding:'12px 14px',
                  border:'1.5px solid #E5E1D8', borderRadius:'10px',
                  fontSize:'20px', fontFamily:'inherit', boxSizing:'border-box',
                  resize:'none', minHeight:'72px' }} />
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={closeEdit} disabled={editSaving}
                style={{ flex:1, padding:'14px', border:'1.5px solid #E5E1D8',
                  borderRadius:'10px', background:'white', fontSize:'18px',
                  fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>
                キャンセル
              </button>
              <button onClick={submitEdit} disabled={editSaving}
                style={{ flex:1, padding:'14px', border:'none',
                  background: editSaving ? '#888780' : '#72243E',
                  color:'white', borderRadius:'10px',
                  fontSize:'18px', fontWeight:500, cursor:'pointer',
                  fontFamily:'inherit' }}>
                {editSaving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
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

      {/* カスタム商品 追加モーダル */}
      {customModal && (
        <div style={{ position:'fixed', inset:0,
          background:'rgba(0,0,0,.5)', zIndex:200,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:'16px',
            padding:'24px', margin:'20px', maxWidth:'360px', width:'100%' }}>
            <div style={{ fontSize:'18px', fontWeight:500, marginBottom:'16px' }}>
              {customModal.category}を追加
            </div>

            <div style={{ marginBottom:'12px' }}>
              <div style={{ fontSize:'13px', color:'#888780', marginBottom:'4px' }}>
                商品名 <span style={{ color:'#E24B4A' }}>必須</span>
              </div>
              <input type="text" value={customModal.name}
                onChange={(e) => setCustomModal({ ...customModal, name: e.target.value })}
                placeholder="例: 松花堂弁当"
                style={{ width:'100%', padding:'12px',
                  border:'1.5px solid #E5E1D8', borderRadius:'10px',
                  fontSize:'16px', fontFamily:'inherit', boxSizing:'border-box' }} />
            </div>

            <div style={{ marginBottom:'12px' }}>
              <div style={{ fontSize:'13px', color:'#888780', marginBottom:'4px' }}>
                単価（円）
              </div>
              <input type="number" inputMode="numeric"
                value={customModal.price}
                onChange={(e) => setCustomModal({ ...customModal, price: e.target.value })}
                placeholder="0"
                style={{ width:'100%', padding:'12px',
                  border:'1.5px solid #E5E1D8', borderRadius:'10px',
                  fontSize:'16px', fontFamily:'inherit', textAlign:'right',
                  boxSizing:'border-box' }} />
            </div>

            <div style={{ marginBottom:'20px' }}>
              <div style={{ fontSize:'13px', color:'#888780', marginBottom:'4px' }}>
                数量
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
                <button onClick={() => setCustomModal({
                  ...customModal, qty: Math.max(1, customModal.qty - 1),
                })}
                  style={{ width:'40px', height:'40px', borderRadius:'50%',
                    border:'1.5px solid #E5E1D8', background:'white',
                    fontSize:'20px', cursor:'pointer', fontFamily:'inherit' }}>
                  -
                </button>
                <span style={{ minWidth:'32px', textAlign:'center',
                  fontSize:'20px', fontWeight:500 }}>
                  {customModal.qty}
                </span>
                <button onClick={() => setCustomModal({
                  ...customModal, qty: customModal.qty + 1,
                })}
                  style={{ width:'40px', height:'40px', borderRadius:'50%',
                    border:'1.5px solid #72243E', background:'#72243E',
                    color:'white', fontSize:'20px',
                    cursor:'pointer', fontFamily:'inherit' }}>
                  +
                </button>
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setCustomModal(null)}
                style={{ flex:1, padding:'12px',
                  border:'1.5px solid #E5E1D8', borderRadius:'10px',
                  background:'white', fontSize:'15px',
                  cursor:'pointer', fontFamily:'inherit' }}>
                キャンセル
              </button>
              <button onClick={addCustomProduct}
                style={{ flex:1, padding:'12px',
                  background:'#72243E', color:'white', border:'none',
                  borderRadius:'10px', fontSize:'15px', fontWeight:500,
                  cursor:'pointer', fontFamily:'inherit' }}>
                追加する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrderBranchPage({
  params,
}: {
  params: Promise<{ branch: string }>
}) {
  const { branch } = use(params)
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
        読み込み中...
      </div>
    }>
      <OrderPageContent branch={branch} />
    </Suspense>
  )
}
