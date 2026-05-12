'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

interface Product {
  id          : number
  productCode : string
  productName : string
  category    : string
  unit        : string
  weeklyAvg   : number
  vendor      : { vendorName: string } | null
}

interface OrderState {
  status : string | null
  qty    : string
}

const CATEGORIES = ['野菜', '果物', '餅・乾物菓子類']

function StorePageContent() {
  const router = useRouter()
  const { user, loading, error, authFetch, logout } = useAuth('store')
  const [products, setProducts]     = useState<Product[]>([])
  const [orderState, setOrderState] = useState<Record<number, OrderState>>({})
  const [currentCat, setCurrentCat] = useState('野菜')
  const [screen, setScreen]         = useState<'input' | 'submitted'>('input')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast]           = useState('')

  const fetchProducts = useCallback(async () => {
    if (!user) return
    const res  = await authFetch('/api/products')
    const data = await res.json()
    setProducts(data)
    const init: Record<number, OrderState> = {}
    data.forEach((p: Product) => {
      init[p.id] = { status: null, qty: '' }
    })
    setOrderState(init)
  }, [user])

  useEffect(() => {
    if (!loading && !error) fetchProducts()
  }, [loading, error, fetchProducts])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const setStatus = (id: number, status: string) => {
    setOrderState((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        status: prev[id]?.status === status ? null : status,
      },
    }))
  }

  const setQty = (id: number, qty: string) => {
    setOrderState((prev) => ({
      ...prev,
      [id]: { ...prev[id], qty },
    }))
  }

  const handleSubmit = async () => {
    const orders = products
      .filter((p) => {
        const st = orderState[p.id]
        if (!st) return false
        if (st.status === '〇' || st.status === '△') return true
        if (!st.status && st.qty && Number(st.qty) > 0) return true
        return false
      })
      .map((p) => ({
        productId  : p.id,
        productName: p.productName,
        category   : p.category,
        unit       : p.unit,
        status     : orderState[p.id]?.status || '―',
        qty        : orderState[p.id]?.qty || 0,
      }))

    if (orders.length === 0) {
      showToast('送信する項目がありません')
      return
    }

    setSubmitting(true)
    const res  = await authFetch('/api/daily-orders', {
      method: 'POST',
      body  : JSON.stringify({ orders }),
    })
    const data = await res.json()
    setSubmitting(false)

    if (data.success) {
      setScreen('submitted')
      showToast('送信しました（' + orders.length + '件）')
    } else {
      showToast('エラー: ' + data.error)
    }
  }

  const filteredProducts  = products.filter((p) => p.category === currentCat)
  const submittedOrders   = products.filter((p) => {
    const st = orderState[p.id]
    if (!st) return false
    if (st.status === '〇' || st.status === '△') return true
    if (!st.status && st.qty && Number(st.qty) > 0) return true
    return false
  })

  const statusColors: Record<string, string> = {
    '〇': '#E24B4A', '△': '#E67E22', '×': '#3B6D11',
  }

  if (loading) return (
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
      minHeight:'100vh', paddingBottom:'80px' }}>

      {/* ヘッダー */}
      {screen === 'input' && (
        <div style={{ background:'linear-gradient(135deg,#3B6D11,#639922)',
          color:'white', padding:'20px 16px 16px',
          position:'sticky', top:0, zIndex:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:'11px', opacity:.8 }}>発注入力</div>
              <div style={{ fontSize:'20px', fontWeight:500 }}>{user?.storeName}</div>
            </div>
            <button onClick={logout}
              style={{ padding:'8px 14px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
              終了する
            </button>
          </div>
          <div style={{ display:'flex', gap:'8px', marginTop:'12px' }}>
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setCurrentCat(cat)}
                style={{ padding:'6px 12px', borderRadius:'20px', fontSize:'13px',
                  border:'none', cursor:'pointer', fontFamily:'inherit',
                  background: currentCat === cat ? 'white' : 'rgba(255,255,255,.2)',
                  color     : currentCat === cat ? '#3B6D11' : 'white',
                  fontWeight: currentCat === cat ? 500 : 400 }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 送信済み画面 */}
      {screen === 'submitted' && (
        <div>
          <div style={{ background:'linear-gradient(135deg,#3B6D11,#639922)',
            color:'white', padding:'20px 16px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'11px', opacity:.8 }}>送信済み</div>
                <div style={{ fontSize:'20px', fontWeight:500 }}>{user?.storeName}</div>
              </div>
              <button onClick={logout}
                style={{ padding:'8px 14px', background:'rgba(255,255,255,.2)',
                  border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                  color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
                終了する
              </button>
            </div>
          </div>

          <div style={{ padding:'16px' }}>
            <div style={{ background:'white', borderRadius:'16px', overflow:'hidden',
              boxShadow:'0 2px 8px rgba(0,0,0,.04)', marginBottom:'12px' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #F0ECE3',
                fontWeight:500, fontSize:'14px' }}>
                ✅ 送信完了（{submittedOrders.length}件）
              </div>
              {submittedOrders.map((p) => {
                const st = orderState[p.id]
                return (
                  <div key={p.id} style={{ padding:'10px 16px',
                    borderBottom:'1px solid #F5F1EA', fontSize:'13px',
                    display:'flex', justifyContent:'space-between' }}>
                    <span>{p.productName}</span>
                    <div style={{ display:'flex', gap:'8px' }}>
                      {st?.status && (
                        <span style={{ color: statusColors[st.status], fontWeight:500 }}>
                          {st.status}
                        </span>
                      )}
                      {st?.qty && <span>{st.qty}{p.unit}</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            <button onClick={() => setScreen('input')}
              style={{ width:'100%', padding:'14px', background:'white',
                border:'1.5px solid #E5E1D8', borderRadius:'10px',
                fontSize:'15px', fontWeight:500, cursor:'pointer',
                fontFamily:'inherit', marginBottom:'12px' }}>
              修正する
            </button>

            <SalesInput user={user} authFetch={authFetch} showToast={showToast} />
          </div>
        </div>
      )}

      {/* 商品リスト */}
      {screen === 'input' && (
        <div style={{ padding:'12px' }}>
          {filteredProducts.length === 0 ? (
            <div style={{ background:'white', borderRadius:'16px', padding:'40px',
              textAlign:'center', color:'#888780', fontSize:'14px' }}>
              商品がありません
            </div>
          ) : (
            <div style={{ background:'white', borderRadius:'16px',
              overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
              {filteredProducts.map((p, idx) => {
                const st = orderState[p.id] || { status: null, qty: '' }
                return (
                  <div key={p.id} style={{ padding:'12px 16px',
                    borderBottom: idx < filteredProducts.length-1
                      ? '1px solid #F5F1EA' : 'none',
                    display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ flex:1, marginRight:'12px' }}>
                      <div style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A' }}>
                        {p.productName}
                      </div>
                      <div style={{ fontSize:'11px', color:'#888780', marginTop:'2px' }}>
                        先週平均 {Number(p.weeklyAvg)}{p.unit}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ display:'flex', gap:'4px' }}>
                        {['〇','△','×'].map((mark) => (
                          <button key={mark} onClick={() => setStatus(p.id, mark)}
                            style={{ width:'32px', height:'32px', borderRadius:'8px',
                              border:'1.5px solid',
                              borderColor: st.status === mark
                                ? statusColors[mark] : '#E5E1D8',
                              background : st.status === mark
                                ? statusColors[mark] : 'white',
                              color      : st.status === mark ? 'white' : '#888780',
                              fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
                            {mark}
                          </button>
                        ))}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:'2px' }}>
                        <input type="number" value={st.qty}
                          onChange={(e) => setQty(p.id, e.target.value)}
                          style={{ width:'48px', padding:'6px', textAlign:'right',
                            border:'1.5px solid #E5E1D8', borderRadius:'8px',
                            fontSize:'14px', fontFamily:'inherit' }}
                          placeholder="0" min="0" max="999" />
                        <span style={{ fontSize:'11px', color:'#888780' }}>{p.unit}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* フッター送信ボタン */}
      {screen === 'input' && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0,
          padding:'12px 16px', background:'white',
          borderTop:'1px solid #E5E1D8', zIndex:10 }}>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ width:'100%', padding:'14px',
              background: submitting ? '#888780' : '#3B6D11',
              color:'white', border:'none', borderRadius:'12px',
              fontSize:'15px', fontWeight:500, cursor:'pointer',
              fontFamily:'inherit' }}>
            {submitting ? '送信中...' : 'この内容で送信する'}
          </button>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div style={{ position:'fixed', bottom:'80px', left:'50%',
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

export default function StorePage() {
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        minHeight:'100vh', fontFamily:'-apple-system,sans-serif' }}>
        読み込み中...
      </div>
    }>
      <StorePageContent />
    </Suspense>
  )
}

function SalesInput({ user, authFetch, showToast }: any) {
  const [sales, setSales] = useState({
    amount:'', souzai:'', mochi:'', hana:'',
    customerCount:'', staffMorning:'', staffAfternoon:'',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    authFetch('/api/sales')
      .then((res: any) => res.json())
      .then((data: any) => {
        if (data && user?.storeName && data[user.storeName]) {
          const s = data[user.storeName]
          setSales({
            amount        : s.amount         || '',
            souzai        : s.souzai         || '',
            mochi         : s.mochi          || '',
            hana          : s.hana           || '',
            customerCount : s.customerCount  || '',
            staffMorning  : s.staffMorning   || '',
            staffAfternoon: s.staffAfternoon || '',
          })
          setSaved(true)
        }
      })
  }, [user])

  const handleSave = async () => {
    setSaving(true)
    const res  = await authFetch('/api/sales', {
      method: 'POST',
      body  : JSON.stringify(sales),
    })
    const data = await res.json()
    setSaving(false)
    if (data.success) {
      setSaved(true)
      showToast('実績を登録しました')
    } else {
      showToast('エラー: ' + data.error)
    }
  }

  const inputStyle = {
    width:'100%', padding:'8px', border:'1.5px solid #E5E1D8',
    borderRadius:'8px', fontSize:'14px', fontFamily:'inherit',
    textAlign:'right' as const, boxSizing:'border-box' as const,
  }

  return (
    <div style={{ background:'white', borderRadius:'16px',
      overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid #F0ECE3',
        fontWeight:500, fontSize:'14px' }}>
        💰 本日の実績入力
      </div>
      <div style={{ padding:'16px' }}>
        <div style={{ fontSize:'12px', color:'#888780', marginBottom:'8px' }}>売上</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
          gap:'8px', marginBottom:'12px' }}>
          {[
            { key:'amount', label:'売上金額' },
            { key:'souzai', label:'惣菜売上' },
            { key:'mochi',  label:'餅売上'   },
            { key:'hana',   label:'花売上'   },
          ].map(({ key, label }) => (
            <div key={key}>
              <div style={{ fontSize:'11px', color:'#888780', marginBottom:'4px' }}>
                {label}
              </div>
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:'10px', top:'50%',
                  transform:'translateY(-50%)', color:'#888780', fontSize:'13px' }}>¥</span>
                <input type="number" inputMode="numeric"
                  value={(sales as any)[key]}
                  onChange={(e) => setSales({ ...sales, [key]: e.target.value })}
                  style={{ ...inputStyle, paddingLeft:'24px' }} placeholder="0" />
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize:'12px', color:'#888780', marginBottom:'8px' }}>人数</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
          gap:'8px', marginBottom:'16px' }}>
          {[
            { key:'customerCount',  label:'客数'    },
            { key:'staffMorning',   label:'出勤前半' },
            { key:'staffAfternoon', label:'出勤後半' },
          ].map(({ key, label }) => (
            <div key={key}>
              <div style={{ fontSize:'11px', color:'#888780', marginBottom:'4px' }}>
                {label}
              </div>
              <input type="number" inputMode="numeric"
                value={(sales as any)[key]}
                onChange={(e) => setSales({ ...sales, [key]: e.target.value })}
                style={inputStyle} placeholder="0" />
            </div>
          ))}
        </div>

        <button onClick={handleSave} disabled={saving}
          style={{ width:'100%', padding:'14px',
            background: saving ? '#888780' : '#3B6D11',
            color:'white', border:'none', borderRadius:'10px',
            fontSize:'15px', fontWeight:500, cursor:'pointer',
            fontFamily:'inherit' }}>
          {saving ? '登録中...' : saved ? '実績を修正する' : '実績を登録する'}
        </button>
      </div>
    </div>
  )
}
