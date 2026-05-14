'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

interface ProductSummary {
  productId  : number
  productName: string
  category   : string
  unit       : string
  vendor     : string
  storeA     : { status: string | null; qty: number } | null
  storeB     : { status: string | null; qty: number } | null
  totalQty   : number
  adjustedQty: number
}

interface SalesEntry {
  storeName     : string
  amount        : number
  souzai        : number
  mochi         : number
  hana          : number
  customerCount : number
  staffMorning  : number
  staffAfternoon: number
  notes         : string
}

const ROLE_TO_CATEGORY: Record<string, string> = {
  hq1: '野菜',
  hq2: '果物',
  hq3: '餅・乾物菓子類',
}

const ORDER_STATUSES = new Set(['〇', '△'])

function fmtYen(n: number) { return '¥' + n.toLocaleString('ja-JP') }

function HqPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, error, authFetch, logout } = useAuth(['hq1', 'hq2', 'hq3', 'all'])
  const [items, setItems]       = useState<ProductSummary[]>([])
  const [adjusted, setAdjusted] = useState<Record<number, number>>({})
  const [sales, setSales]       = useState<Record<string, SalesEntry>>({})
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')

  const queryCategory = searchParams.get('category')

  const effectiveCategory: string | null = user
    ? (user.role === 'all'
        ? (queryCategory ? ROLE_TO_CATEGORY[queryCategory] ?? null : null)
        : ROLE_TO_CATEGORY[user.role] ?? null)
    : null

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fetchAll = useCallback(async () => {
    if (!user) return
    const param = queryCategory ? `?category=${queryCategory}` : ''
    const [oRes, sRes] = await Promise.all([
      authFetch(`/api/daily-orders/hq${param}`),
      authFetch('/api/sales'),
    ])
    const oData = await oRes.json()
    const sData = await sRes.json()
    setItems(oData.items || [])
    setSales(sData || {})
    const init: Record<number, number> = {}
    ;(oData.items || []).forEach((item: ProductSummary) => {
      init[item.productId] = 0
    })
    setAdjusted(init)
  }, [user, queryCategory])

  useEffect(() => {
    if (!loading && !error) fetchAll()
  }, [loading, error, fetchAll])

  // 注文対象: いずれかの店舗で 〇 or △
  const orderItems = items.filter((it) =>
    ORDER_STATUSES.has(it.storeA?.status ?? '') ||
    ORDER_STATUSES.has(it.storeB?.status ?? '')
  )

  // 在庫: 上記以外 (× / 未設定)
  const stockItems = items.filter((it) =>
    !ORDER_STATUSES.has(it.storeA?.status ?? '') &&
    !ORDER_STATUSES.has(it.storeB?.status ?? '')
  )

  const handleConfirm = async () => {
    setSaving(true)
    const confirmed = orderItems.map((item) => ({
      productId   : item.productId,
      productName : item.productName,
      category    : item.category,
      storeAQty   : item.storeA?.qty   || 0,
      storeBQty   : item.storeB?.qty   || 0,
      storeAStatus: item.storeA?.status || '-',
      storeBStatus: item.storeB?.status || '-',
      totalQty    : item.totalQty,
      adjustedQty : adjusted[item.productId] || 0,
      vendor      : item.vendor,
    }))

    const res  = await authFetch('/api/confirmed', {
      method: 'POST',
      body  : JSON.stringify({ confirmed }),
    })
    const data = await res.json()
    setSaving(false)

    if (data.success) showToast('発注確定を保存しました')
    else showToast('エラー: ' + data.error)
  }

  const copyForLine = () => {
    const today = new Date()
    const dateStr = (today.getMonth()+1) + '/' + today.getDate()
    const groupByCat = new Map<string, ProductSummary[]>()
    for (const it of orderItems) {
      const arr = groupByCat.get(it.category) ?? []
      arr.push(it)
      groupByCat.set(it.category, arr)
    }
    let text = ''
    for (const [cat, list] of groupByCat.entries()) {
      text += `【${cat}発注】${dateStr}\n`
      for (const it of list) {
        const qty = adjusted[it.productId] || it.totalQty
        if (qty > 0) {
          text += `${it.productName}: ${qty}${it.unit}\n`
        }
      }
      text += '\n'
    }
    navigator.clipboard.writeText(text.trim())
    showToast('LINEコピーしました')
  }

  const statusColor = (s: string | null) => {
    if (s === '〇') return '#E24B4A'
    if (s === '△') return '#E67E22'
    if (s === '×') return '#3B6D11'
    return '#888780'
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} onTop={() => router.push('/')} />

  const isAll = user?.role === 'all'
  const headerCategory = effectiveCategory ?? (isAll ? '全カテゴリ' : '—')

  const allCategoryTabs = isAll && (
    <div style={{ display:'flex', gap:'8px', marginTop:'12px', flexWrap:'wrap' }}>
      {[
        { key: '',    label: '全部' },
        { key: 'hq1', label: '野菜' },
        { key: 'hq2', label: '果物' },
        { key: 'hq3', label: '餅' },
      ].map((tab) => {
        const isCurrent = (queryCategory ?? '') === tab.key
        return (
          <button key={tab.key || 'all'}
            onClick={() => {
              const url = tab.key ? `/hq?category=${tab.key}` : '/hq'
              router.replace(url)
            }}
            style={{ padding:'6px 12px', borderRadius:'20px', fontSize:'13px',
              border:'none', cursor:'pointer', fontFamily:'inherit',
              background: isCurrent ? 'white' : 'rgba(255,255,255,.2)',
              color     : isCurrent ? '#1A5276' : 'white',
              fontWeight: isCurrent ? 500 : 400 }}>
            {tab.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div style={{ fontFamily:'-apple-system,sans-serif', background:'#F5F1EA',
      minHeight:'100vh', paddingBottom: orderItems.length > 0 ? '80px' : '24px' }}>

      {/* ヘッダー */}
      <div style={{ background:'linear-gradient(135deg,#1A5276,#2980B9)',
        color:'white', padding:'20px 16px 16px',
        position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:'11px', opacity:.8 }}>発注調整</div>
            <div style={{ fontSize:'20px', fontWeight:500 }}>
              {headerCategory}
            </div>
            <div style={{ fontSize:'11px', opacity:.8, marginTop:'2px' }}>
              {user?.name}（{user?.role}）
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={copyForLine}
              style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>
              LINEコピー
            </button>
            <button onClick={logout}
              style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>
              終了する
            </button>
          </div>
        </div>
        {allCategoryTabs}
      </div>

      <div style={{ padding:'12px' }}>
        {/* 売上実績 */}
        <SalesSummary sales={sales} />

        {/* 注文（〇・△） */}
        <SectionTitle text={`📋 注文（${orderItems.length}品）`}
          color="#1A5276" subtitle="〇＝在庫なし / △＝在庫少なめ" />
        {orderItems.length === 0 ? (
          <EmptyBox text="注文対象の商品はありません" />
        ) : (
          <OrderCards items={orderItems} adjusted={adjusted} setAdjusted={setAdjusted}
            statusColor={statusColor} />
        )}

        {/* 在庫（× or 未設定） */}
        <SectionTitle text={`📦 在庫あり（${stockItems.length}品）`}
          color="#3B6D11" subtitle="× または未設定（発注不要）" />
        {stockItems.length === 0 ? (
          <EmptyBox text="該当なし" />
        ) : (
          <StockCards items={stockItems} statusColor={statusColor} />
        )}
      </div>

      {/* フッター */}
      {orderItems.length > 0 && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0,
          padding:'12px 16px', background:'white',
          borderTop:'1px solid #E5E1D8', zIndex:10 }}>
          <button onClick={handleConfirm} disabled={saving}
            style={{ width:'100%', padding:'14px',
              background: saving ? '#888780' : '#1A5276',
              color:'white', border:'none', borderRadius:'12px',
              fontSize:'15px', fontWeight:500, cursor:'pointer',
              fontFamily:'inherit' }}>
            {saving ? '保存中...' : '発注確定を保存する'}
          </button>
        </div>
      )}

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

function SalesSummary({ sales }: { sales: Record<string, SalesEntry> }) {
  const stores = ['nishi', 'minami']
  const total = stores.reduce((acc, code) => {
    const s = sales[code]
    if (!s) return acc
    acc.amount        += s.amount
    acc.souzai        += s.souzai
    acc.mochi         += s.mochi
    acc.hana          += s.hana
    acc.customerCount += s.customerCount
    return acc
  }, { amount: 0, souzai: 0, mochi: 0, hana: 0, customerCount: 0 })

  return (
    <div style={{ marginBottom:'16px', background:'white', borderRadius:'16px',
      overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
        fontWeight:500, fontSize:'14px', background:'#FBF8F2' }}>
        💰 本日の売上実績
      </div>
      <div style={{ padding:'12px 16px' }}>
        {stores.map((code) => {
          const s = sales[code]
          return (
            <div key={code} style={{ marginBottom:'10px',
              paddingBottom:'10px', borderBottom:'1px solid #F5F1EA' }}>
              <div style={{ fontSize:'13px', fontWeight:500,
                color:'#2C2C2A', marginBottom:'6px' }}>
                {s?.storeName ?? (code === 'nishi' ? '西店' : '南店')}
              </div>
              {s ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
                  gap:'4px', fontSize:'12px' }}>
                  <Mini label="売上" value={fmtYen(s.amount)} />
                  <Mini label="客数" value={`${s.customerCount}人`} />
                  <Mini label="惣菜" value={fmtYen(s.souzai)} />
                  <Mini label="餅"   value={fmtYen(s.mochi)} />
                  <Mini label="花"   value={fmtYen(s.hana)} />
                  <Mini label="出勤" value={`${s.staffMorning}/${s.staffAfternoon}`} />
                  {s.notes && (
                    <div style={{ gridColumn:'1 / -1', padding:'6px 8px',
                      background:'#FAFAFA', borderRadius:'6px',
                      fontSize:'11px', color:'#555' }}>
                      📝 {s.notes}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize:'12px', color:'#888780' }}>未入力</div>
              )}
            </div>
          )
        })}
        <div>
          <div style={{ fontSize:'13px', fontWeight:500,
            color:'#2C2C2A', marginBottom:'6px' }}>
            🧮 2 店合計
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
            gap:'4px', fontSize:'12px' }}>
            <Mini label="売上" value={fmtYen(total.amount)} />
            <Mini label="客数" value={`${total.customerCount}人`} />
            <Mini label="惣菜" value={fmtYen(total.souzai)} />
            <Mini label="餅"   value={fmtYen(total.mochi)} />
            <Mini label="花"   value={fmtYen(total.hana)} />
            <Mini label="客単価" value={total.customerCount > 0
              ? fmtYen(Math.round(total.amount / total.customerCount))
              : '—'} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between',
      padding:'4px 8px', background:'#FAFAFA', borderRadius:'6px' }}>
      <span style={{ color:'#888780' }}>{label}</span>
      <span style={{ fontWeight:500 }}>{value}</span>
    </div>
  )
}

function SectionTitle({ text, color, subtitle }: {
  text: string; color: string; subtitle?: string
}) {
  return (
    <div style={{ padding:'8px 4px', marginTop:'12px', marginBottom:'8px' }}>
      <div style={{ fontWeight:500, fontSize:'14px', color }}>{text}</div>
      {subtitle && (
        <div style={{ fontSize:'11px', color:'#888780', marginTop:'2px' }}>{subtitle}</div>
      )}
    </div>
  )
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div style={{ background:'white', borderRadius:'16px', padding:'20px',
      textAlign:'center', color:'#888780', fontSize:'13px',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      {text}
    </div>
  )
}

function OrderCards({
  items, adjusted, setAdjusted, statusColor,
}: {
  items     : ProductSummary[]
  adjusted  : Record<number, number>
  setAdjusted: (v: Record<number, number>) => void
  statusColor: (s: string | null) => string
}) {
  const byCat = new Map<string, ProductSummary[]>()
  for (const it of items) {
    const arr = byCat.get(it.category) ?? []
    arr.push(it)
    byCat.set(it.category, arr)
  }

  return (
    <>
      {Array.from(byCat.entries()).map(([cat, list]) => (
        <div key={cat} style={{ marginBottom:'12px' }}>
          <div style={{ fontSize:'12px', fontWeight:500, color:'#888780',
            padding:'4px 8px' }}>
            {cat}（{list.length}品）
          </div>
          {list.map((item) => (
            <div key={item.productId}
              style={{ background:'white', borderRadius:'12px',
                padding:'12px 14px', marginBottom:'8px',
                boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
              <div style={{ display:'flex', justifyContent:'space-between',
                alignItems:'flex-start', marginBottom:'8px' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A' }}>
                    {item.productName}
                  </div>
                  <div style={{ fontSize:'11px', color:'#888780', marginTop:'2px' }}>
                    {item.vendor || '仕入先未設定'}
                  </div>
                </div>
              </div>

              <div style={{ display:'grid',
                gridTemplateColumns:'1fr 1fr 60px 80px',
                gap:'6px', alignItems:'center' }}>
                {(['storeA', 'storeB'] as const).map((key, i) => {
                  const s = item[key]
                  const label = i === 0 ? '西' : '南'
                  return (
                    <div key={key} style={{ display:'flex', alignItems:'center',
                      gap:'4px', padding:'4px 8px',
                      background:'#F5F1EA', borderRadius:'8px',
                      fontSize:'12px' }}>
                      <span style={{ color:'#888780' }}>{label}</span>
                      {s ? (
                        <>
                          <span style={{ color: statusColor(s.status),
                            fontWeight:500 }}>{s.status || '―'}</span>
                          {s.qty > 0 && (
                            <span style={{ marginLeft:'auto' }}>
                              {s.qty}{item.unit}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color:'#E5E1D8' }}>―</span>
                      )}
                    </div>
                  )
                })}
                <div style={{ textAlign:'center', fontSize:'12px',
                  fontWeight:500, color:'#2C2C2A' }}>
                  計 {item.totalQty}{item.unit}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'2px' }}>
                  <input type="number"
                    value={adjusted[item.productId] ?? 0}
                    onChange={(e) => setAdjusted({
                      ...adjusted,
                      [item.productId]: parseInt(e.target.value) || 0,
                    })}
                    style={{ width:'48px', padding:'6px', textAlign:'center',
                      border:'1.5px solid #E5E1D8', borderRadius:'8px',
                      fontSize:'14px', fontFamily:'inherit' }}
                    min="0" />
                  <span style={{ fontSize:'11px', color:'#888780' }}>{item.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function StockCards({
  items, statusColor,
}: {
  items     : ProductSummary[]
  statusColor: (s: string | null) => string
}) {
  const byCat = new Map<string, ProductSummary[]>()
  for (const it of items) {
    const arr = byCat.get(it.category) ?? []
    arr.push(it)
    byCat.set(it.category, arr)
  }

  return (
    <>
      {Array.from(byCat.entries()).map(([cat, list]) => (
        <div key={cat} style={{ marginBottom:'12px',
          background:'white', borderRadius:'12px', overflow:'hidden',
          boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ padding:'8px 14px', borderBottom:'1px solid #F0ECE3',
            fontSize:'12px', color:'#888780', background:'#FBF8F2' }}>
            {cat}（{list.length}品）
          </div>
          {list.map((item, idx) => (
            <div key={item.productId}
              style={{ padding:'8px 14px',
                borderBottom: idx < list.length-1 ? '1px solid #F5F1EA' : 'none',
                display:'flex', justifyContent:'space-between',
                alignItems:'center', fontSize:'13px' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:'#2C2C2A' }}>{item.productName}</div>
                <div style={{ fontSize:'11px', color:'#888780' }}>
                  {item.vendor || '仕入先未設定'}
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', fontSize:'11px' }}>
                {(['storeA', 'storeB'] as const).map((key, i) => {
                  const s = item[key]
                  const label = i === 0 ? '西' : '南'
                  return (
                    <span key={key} style={{
                      padding:'2px 6px', background:'#F5F1EA', borderRadius:'6px',
                      color: s?.status ? statusColor(s.status) : '#888780' }}>
                      {label}: {s?.status ?? '—'}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function Loading() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:'-apple-system,sans-serif' }}>
      読み込み中...
    </div>
  )
}

function ErrorBox({ msg, onTop }: { msg: string; onTop: () => void }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:'-apple-system,sans-serif', background:'#F5F1EA' }}>
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', maxWidth:'320px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🚫</div>
        <p style={{ fontSize:'16px', fontWeight:500, color:'#E24B4A',
          marginBottom:'8px' }}>{msg}</p>
        <button onClick={onTop}
          style={{ padding:'12px 24px', background:'#3B6D11', color:'white',
            border:'none', borderRadius:'10px', fontSize:'14px',
            cursor:'pointer', fontFamily:'inherit' }}>
          トップに戻る
        </button>
      </div>
    </div>
  )
}

export default function HqPage() {
  return (
    <Suspense fallback={<Loading />}>
      <HqPageContent />
    </Suspense>
  )
}
