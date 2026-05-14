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

const ROLE_TO_CATEGORY: Record<string, string> = {
  hq1: '野菜',
  hq2: '果物',
  hq3: '餅・乾物菓子類',
}

const CATEGORY_TO_ROLE: Record<string, string> = {
  '野菜'        : 'hq1',
  '果物'        : 'hq2',
  '餅・乾物菓子類': 'hq3',
}

function HqPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, error, authFetch, logout } = useAuth(['hq1', 'hq2', 'hq3', 'all'])
  const [items, setItems]       = useState<ProductSummary[]>([])
  const [adjusted, setAdjusted] = useState<Record<number, number>>({})
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')

  const queryCategory = searchParams.get('category')

  // 見出し用カテゴリ
  const effectiveCategory: string | null = user
    ? (user.role === 'all'
        ? (queryCategory ? ROLE_TO_CATEGORY[queryCategory] ?? null : null)
        : ROLE_TO_CATEGORY[user.role] ?? null)
    : null

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fetchOrders = useCallback(async () => {
    if (!user) return
    const param = queryCategory
      ? `?category=${queryCategory}`
      : ''
    const res  = await authFetch(`/api/daily-orders/hq${param}`)
    const data = await res.json()
    setItems(data.items || [])
    const init: Record<number, number> = {}
    ;(data.items || []).forEach((item: ProductSummary) => {
      init[item.productId] = 0
    })
    setAdjusted(init)
  }, [user, queryCategory])

  useEffect(() => {
    if (!loading && !error) fetchOrders()
  }, [loading, error, fetchOrders])

  const handleConfirm = async () => {
    setSaving(true)
    const confirmed = items.map((item) => ({
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
    for (const it of items) {
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

  const isAll = user?.role === 'all'
  const headerCategory = effectiveCategory ?? (isAll ? '全カテゴリ' : '—')

  // all 用カテゴリタブ
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
      minHeight:'100vh', paddingBottom:'80px' }}>

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

      {/* 商品リスト */}
      <div style={{ padding:'12px' }}>
        {items.length === 0 ? (
          <div style={{ background:'white', borderRadius:'16px', padding:'40px',
            textAlign:'center', color:'#888780', fontSize:'14px' }}>
            本日の発注データがありません
          </div>
        ) : (
          renderItemsByCategory(items, adjusted, setAdjusted, statusColor, isAll)
        )}
      </div>

      {/* フッター */}
      {items.length > 0 && (
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

function renderItemsByCategory(
  items     : ProductSummary[],
  adjusted  : Record<number, number>,
  setAdj    : (updater: (prev: Record<number, number>) => Record<number, number>) => void,
  statusColor: (s: string | null) => string,
  showHeader: boolean,
) {
  const grouped = new Map<string, ProductSummary[]>()
  for (const item of items) {
    const arr = grouped.get(item.category) ?? []
    arr.push(item)
    grouped.set(item.category, arr)
  }

  return Array.from(grouped.entries()).map(([cat, list]) => (
    <div key={cat} style={{ marginBottom:'12px',
      background:'white', borderRadius:'16px',
      overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      {showHeader && (
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
          fontWeight:500, fontSize:'14px', background:'#FBF8F2' }}>
          {cat}（{list.length}品）
        </div>
      )}
      <div style={{ display:'grid',
        gridTemplateColumns:'1fr 60px 60px 60px 70px',
        gap:'8px', padding:'10px 16px',
        background:'#F5F1EA', fontSize:'11px', color:'#888780',
        fontWeight:500 }}>
        <span>商品名</span>
        <span style={{ textAlign:'center' }}>西店</span>
        <span style={{ textAlign:'center' }}>南店</span>
        <span style={{ textAlign:'center' }}>合計</span>
        <span style={{ textAlign:'center' }}>調整後</span>
      </div>

      {list.map((item, idx) => (
        <div key={item.productId}
          style={{ display:'grid',
            gridTemplateColumns:'1fr 60px 60px 60px 70px',
            gap:'8px', padding:'12px 16px', alignItems:'center',
            borderBottom: idx < list.length-1
              ? '1px solid #F5F1EA' : 'none' }}>
          <div>
            <div style={{ fontSize:'13px', fontWeight:500, color:'#2C2C2A' }}>
              {item.productName}
            </div>
            <div style={{ fontSize:'11px', color:'#888780' }}>
              {item.vendor}
            </div>
          </div>

          <div style={{ textAlign:'center' }}>
            {item.storeA ? (
              <>
                <div style={{ fontSize:'13px', fontWeight:500,
                  color: statusColor(item.storeA.status) }}>
                  {item.storeA.status || '―'}
                </div>
                {item.storeA.qty > 0 && (
                  <div style={{ fontSize:'11px', color:'#888780' }}>
                    {item.storeA.qty}{item.unit}
                  </div>
                )}
              </>
            ) : (
              <span style={{ color:'#E5E1D8', fontSize:'13px' }}>―</span>
            )}
          </div>

          <div style={{ textAlign:'center' }}>
            {item.storeB ? (
              <>
                <div style={{ fontSize:'13px', fontWeight:500,
                  color: statusColor(item.storeB.status) }}>
                  {item.storeB.status || '―'}
                </div>
                {item.storeB.qty > 0 && (
                  <div style={{ fontSize:'11px', color:'#888780' }}>
                    {item.storeB.qty}{item.unit}
                  </div>
                )}
              </>
            ) : (
              <span style={{ color:'#E5E1D8', fontSize:'13px' }}>―</span>
            )}
          </div>

          <div style={{ textAlign:'center', fontSize:'13px', fontWeight:500 }}>
            {item.totalQty}{item.unit}
          </div>

          <div style={{ textAlign:'center' }}>
            <input type="number"
              value={adjusted[item.productId] ?? 0}
              onChange={(e) => setAdj((prev) => ({
                ...prev,
                [item.productId]: parseInt(e.target.value) || 0,
              }))}
              style={{ width:'56px', padding:'6px', textAlign:'center',
                border:'1.5px solid #E5E1D8', borderRadius:'8px',
                fontSize:'14px', fontFamily:'inherit' }}
              min="0" />
          </div>
        </div>
      ))}
    </div>
  ))
}

export default function HqPage() {
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        minHeight:'100vh', fontFamily:'-apple-system,sans-serif' }}>
        読み込み中...
      </div>
    }>
      <HqPageContent />
    </Suspense>
  )
}
