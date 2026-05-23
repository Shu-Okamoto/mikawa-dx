'use client'

import { Fragment, useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>

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
  const [view, setView]         = useState<'main' | 'weekly'>('main')

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
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA',
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
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <button onClick={() => setView(view === 'weekly' ? 'main' : 'weekly')}
              style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
              {view === 'weekly' ? '← 本日に戻る' : '📊 週間表示'}
            </button>
            <button onClick={copyForLine}
              style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
              LINEコピー
            </button>
            <button onClick={logout}
              style={{ padding:'8px 12px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
              終了する
            </button>
          </div>
        </div>
        {allCategoryTabs}
      </div>

      <div style={{ padding:'12px' }}>
        {view === 'weekly' ? (
          <WeeklyMatrix
            authFetch={authFetch}
            queryCategory={queryCategory}
            label={headerCategory}
          />
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* フッター */}
      {view !== 'weekly' && orderItems.length > 0 && (
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
                  <div style={{ fontSize:'18px', fontWeight:500, color:'#2C2C2A' }}>
                    {item.productName}
                  </div>
                  <div style={{ fontSize:'12px', color:'#888780', marginTop:'2px' }}>
                    {item.vendor || '仕入先未設定'}
                  </div>
                </div>
              </div>

              <div style={{ display:'grid',
                gridTemplateColumns:'1fr 1fr 70px 96px',
                gap:'6px', alignItems:'center' }}>
                {(['storeA', 'storeB'] as const).map((key, i) => {
                  const s = item[key]
                  const label = i === 0 ? '西' : '南'
                  return (
                    <div key={key} style={{ display:'flex', alignItems:'center',
                      gap:'6px', padding:'6px 10px',
                      background:'#F5F1EA', borderRadius:'8px',
                      fontSize:'16px' }}>
                      <span style={{ color:'#888780', fontSize:'13px' }}>{label}</span>
                      {s ? (
                        <>
                          <span style={{ color: statusColor(s.status), fontSize:'20px',
                            fontWeight:500 }}>{s.status || '―'}</span>
                          {s.qty > 0 && (
                            <span style={{ marginLeft:'auto', fontSize:'16px' }}>
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
                <div style={{ textAlign:'center', fontSize:'14px',
                  fontWeight:500, color:'#2C2C2A' }}>
                  計 {item.totalQty}{item.unit}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                  <input type="number"
                    value={adjusted[item.productId] ?? 0}
                    onChange={(e) => setAdjusted({
                      ...adjusted,
                      [item.productId]: parseInt(e.target.value) || 0,
                    })}
                    style={{ width:'64px', height:'40px', padding:'6px', textAlign:'center',
                      border:'1.5px solid #E5E1D8', borderRadius:'8px',
                      fontSize:'20px', fontWeight:500, fontFamily:'inherit' }}
                    min="0" />
                  <span style={{ fontSize:'12px', color:'#888780' }}>{item.unit}</span>
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
              style={{ padding:'10px 14px',
                borderBottom: idx < list.length-1 ? '1px solid #F5F1EA' : 'none',
                display:'flex', justifyContent:'space-between',
                alignItems:'center', fontSize:'14px' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:'#2C2C2A', fontSize:'16px', fontWeight:500 }}>{item.productName}</div>
                <div style={{ fontSize:'12px', color:'#888780' }}>
                  {item.vendor || '仕入先未設定'}
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', fontSize:'14px' }}>
                {(['storeA', 'storeB'] as const).map((key, i) => {
                  const s = item[key]
                  const label = i === 0 ? '西' : '南'
                  return (
                    <span key={key} style={{
                      padding:'4px 10px', background:'#F5F1EA', borderRadius:'6px',
                      fontWeight:500,
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

function WeeklyMatrix({ authFetch, queryCategory, label }: {
  authFetch    : AuthFetch
  queryCategory: string | null
  label        : string
}) {
  const [data, setData] = useState<Record<string, ProductSummary[]>>({})
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState<string | null>(null)

  const weekDays = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
    const out: { date: Date; dateStr: string; label: string; isToday: boolean }[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const yyyy = d.getFullYear()
      const mm   = String(d.getMonth() + 1).padStart(2, '0')
      const dd   = String(d.getDate()).padStart(2, '0')
      out.push({
        date   : d,
        dateStr: `${yyyy}-${mm}-${dd}`,
        label  : ['月','火','水','木','金','土'][i],
        isToday: d.getTime() === today.getTime(),
      })
    }
    return out
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchAll = async () => {
      setLoading(true)
      const catParam = queryCategory ? `&category=${queryCategory}` : ''
      const results = await Promise.all(weekDays.map(async (wd) => {
        try {
          const res  = await authFetch(`/api/daily-orders/hq?date=${wd.dateStr}${catParam}`)
          const json = await res.json()
          return [wd.dateStr, (json.items ?? []) as ProductSummary[]] as const
        } catch {
          return [wd.dateStr, [] as ProductSummary[]] as const
        }
      }))
      if (cancelled) return
      const map: Record<string, ProductSummary[]> = {}
      results.forEach(([k, v]) => { map[k] = v })
      setData(map)
      setLoading(false)
    }
    fetchAll()
    return () => { cancelled = true }
  }, [authFetch, queryCategory, weekDays])

  // カテゴリ別に商品を整理（カテゴリ → 商品ID → {name, unit}）
  const productByCat = new Map<string, Map<number, { name: string; unit: string }>>()
  Object.values(data).forEach((items) => {
    items.forEach((it) => {
      if (!productByCat.has(it.category)) productByCat.set(it.category, new Map())
      const inner = productByCat.get(it.category)!
      if (!inner.has(it.productId)) inner.set(it.productId, { name: it.productName, unit: it.unit })
    })
  })

  const categories = Array.from(productByCat.keys())
  const currentCat = activeCat && productByCat.has(activeCat) ? activeCat : (categories[0] ?? null)
  const currentProducts = currentCat ? productByCat.get(currentCat) : undefined

  const monday    = weekDays[0]?.date
  const saturday  = weekDays[weekDays.length - 1]?.date
  const rangeText = monday && saturday
    ? `${monday.getMonth()+1}月${monday.getDate()}日 〜 ${saturday.getMonth()+1}月${saturday.getDate()}日`
    : ''

  const statusStyle = (status: string | null | undefined): { bg: string; fg: string } => {
    if (status === '〇') return { bg: '#EAF3DE', fg: '#3B6D11' }
    if (status === '△') return { bg: '#FAEEDA', fg: '#854F0B' }
    if (status === '×') return { bg: '#F5F1EA', fg: '#888780' }
    return { bg: '#FAFAFA', fg: '#C0BDB8' }
  }

  const catIcons: Record<string, string> = {
    '野菜': '🥬', '果物': '🍎', '餅・乾物菓子類': '🍘',
  }

  return (
    <div>
      <div style={{ padding:'0 4px 12px',
        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px' }}>
        <div style={{ fontWeight:500, fontSize:'16px' }}>📊 {label} 週間発注表</div>
        <div style={{ fontSize:'13px', color:'#888780' }}>{rangeText}</div>
      </div>

      {loading && (
        <div style={{ background:'white', borderRadius:'16px',
          padding:'40px', textAlign:'center', color:'#888780', fontSize:'14px',
          boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          読み込み中...
        </div>
      )}

      {!loading && productByCat.size === 0 && (
        <div style={{ background:'white', borderRadius:'16px',
          padding:'40px', textAlign:'center', color:'#888780', fontSize:'14px',
          boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          この週の発注データはありません
        </div>
      )}

      {!loading && categories.length > 1 && (
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'10px' }}>
          {categories.map((cat) => {
            const isActive = cat === currentCat
            return (
              <button key={cat} onClick={() => setActiveCat(cat)}
                style={{
                  padding:'8px 14px', borderRadius:'20px', fontSize:'14px',
                  fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                  border: isActive ? '1.5px solid #1A5276' : '1.5px solid #E5E1D8',
                  background: isActive ? '#1A5276' : 'white',
                  color    : isActive ? 'white'   : '#2C2C2A',
                }}>
                {(catIcons[cat] || '📦') + ' ' + cat}
              </button>
            )
          })}
        </div>
      )}

      {!loading && currentCat && currentProducts && (
        <div style={{ background:'white', borderRadius:'14px', overflow:'hidden',
          boxShadow:'0 2px 8px rgba(0,0,0,.04)', marginBottom:'14px' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
            fontWeight:500, fontSize:'16px' }}>
            {(catIcons[currentCat] || '📦') + ' ' + currentCat}
            <span style={{ marginLeft:'8px', fontSize:'12px', color:'#888780', fontWeight:400 }}>
              （{currentProducts.size}品）
            </span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'600px', fontSize:'13px' }}>
              <thead>
                <tr>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontSize:'13px', color:'#888780',
                    background:'#FAF8F3', borderBottom:'1.5px solid #F0ECE3', minWidth:'120px' }}>商品</th>
                  {weekDays.map((wd) => (
                    <th key={wd.dateStr} colSpan={2} style={{
                      padding:'8px 6px', fontSize:'13px', color: wd.isToday ? '#1A5276' : '#888780',
                      background: wd.isToday ? '#EBF5FB' : '#FAF8F3',
                      borderBottom:'1.5px solid #F0ECE3', textAlign:'center', whiteSpace:'nowrap' }}>
                      <div style={{ fontSize:'15px', fontWeight:500 }}>{wd.label}</div>
                      <div style={{ fontSize:'13px', fontWeight:400 }}>
                        {wd.date.getMonth()+1}/{wd.date.getDate()}
                      </div>
                    </th>
                  ))}
                </tr>
                <tr>
                  <th style={{ background:'#FAF8F3', borderBottom:'1.5px solid #F0ECE3' }} />
                  {weekDays.map((wd) => (
                    <Fragment key={wd.dateStr}>
                      <th style={{ padding:'4px 0', fontSize:'12px',
                        color: wd.isToday ? '#1A5276' : '#888780',
                        background: wd.isToday ? '#EBF5FB' : '#FAF8F3',
                        borderBottom:'1.5px solid #F0ECE3' }}>西</th>
                      <th style={{ padding:'4px 0', fontSize:'12px',
                        color: wd.isToday ? '#1A5276' : '#888780',
                        background: wd.isToday ? '#EBF5FB' : '#FAF8F3',
                        borderBottom:'1.5px solid #F0ECE3' }}>南</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(currentProducts.entries()).map(([pid, info]) => (
                  <tr key={pid}>
                    <td style={{ padding:'8px 10px', fontWeight:500, fontSize:'18px',
                      borderBottom:'1px solid #F5F1EA', whiteSpace:'nowrap' }}>
                      {info.name}
                    </td>
                    {weekDays.map((wd) => {
                      const item = (data[wd.dateStr] ?? []).find((it) => it.productId === pid)
                      const a = item?.storeA
                      const b = item?.storeB
                      const aStyle = statusStyle(a?.status ?? null)
                      const bStyle = statusStyle(b?.status ?? null)
                      const aText = !a || a.status === null ? '—'
                        : a.status + (a.qty > 0 ? ` ${a.qty}` : '')
                      const bText = !b || b.status === null ? '—'
                        : b.status + (b.qty > 0 ? ` ${b.qty}` : '')
                      return (
                        <Fragment key={`${pid}-${wd.dateStr}`}>
                          <td style={{
                            padding:'4px 4px', borderBottom:'1px solid #F5F1EA',
                            borderRight:'1px solid #F5F1EA', textAlign:'center' }}>
                            <span style={{ display:'inline-block', padding:'4px 8px', borderRadius:'4px',
                              fontSize:'18px', fontWeight:500,
                              background: aStyle.bg, color: aStyle.fg, minWidth:'40px' }}>
                              {aText}
                            </span>
                          </td>
                          <td style={{
                            padding:'4px 4px', borderBottom:'1px solid #F5F1EA',
                            borderRight:'1px solid #F5F1EA', textAlign:'center' }}>
                            <span style={{ display:'inline-block', padding:'4px 8px', borderRadius:'4px',
                              fontSize:'18px', fontWeight:500,
                              background: bStyle.bg, color: bStyle.fg, minWidth:'40px' }}>
                              {bText}
                            </span>
                          </td>
                        </Fragment>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && productByCat.size > 0 && (
        <div style={{ padding:'8px 4px', fontSize:'12px', color:'#888780',
          display:'flex', gap:'14px', flexWrap:'wrap' }}>
          <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            <span style={{ padding:'2px 8px', borderRadius:'4px',
              background:'#EAF3DE', color:'#3B6D11', fontWeight:500 }}>〇</span>
            在庫なし
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            <span style={{ padding:'2px 8px', borderRadius:'4px',
              background:'#FAEEDA', color:'#854F0B', fontWeight:500 }}>△</span>
            残り少ない
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            <span style={{ padding:'2px 8px', borderRadius:'4px',
              background:'#F5F1EA', color:'#888780', fontWeight:500 }}>×</span>
            在庫あり
          </span>
        </div>
      )}
    </div>
  )
}

function Loading() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      読み込み中...
    </div>
  )
}

function ErrorBox({ msg, onTop }: { msg: string; onTop: () => void }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA' }}>
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
