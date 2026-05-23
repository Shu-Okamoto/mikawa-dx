'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav, Toast, useToast, inputStyle } from '../_shared'

interface OrderProduct {
  id           : number
  productCode  : string
  productName  : string
  category     : string
  price        : number
  availableDays: string
  isActive     : boolean
  memo         : string | null
  displayOrder : number
}

const CATEGORY_SUGGESTIONS = ['弁当', 'おにぎり', '惣菜', '寿司', '法事', 'その他']
const DAYS = ['月','火','水','木','金','土','日']

type Draft = {
  productCode  : string
  productName  : string
  category     : string
  price        : string
  availableDays: string[]
  memo         : string
  isActive     : boolean
}

const EMPTY_DRAFT: Draft = {
  productCode  : '',
  productName  : '',
  category     : '',
  price        : '0',
  availableDays: [],
  memo         : '',
  isActive     : true,
}

function OrderProductsContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const { toast, showToast } = useToast()
  const [items, setItems]     = useState<OrderProduct[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft]     = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving]   = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(true)
  const [dragId, setDragId]         = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const res  = await authFetch('/api/boss/order-products')
    const data = await res.json()
    if (!Array.isArray(data)) {
      showToast('商品の取得に失敗: ' + (data?.error ?? '不明'))
      setItems([])
    } else {
      setItems(data)
    }
  }, [user])

  useEffect(() => {
    if (!loading && !error) fetchAll()
  }, [loading, error, fetchAll])

  const startEdit = (p: OrderProduct) => {
    setEditing(p.id)
    setShowAdd(false)
    setDraft({
      productCode  : p.productCode,
      productName  : p.productName,
      category     : p.category,
      price        : String(p.price),
      availableDays: p.availableDays ? p.availableDays.split(',').filter(Boolean) : [],
      memo         : p.memo ?? '',
      isActive     : p.isActive,
    })
  }

  const cancelEdit = () => { setEditing(null); setDraft(EMPTY_DRAFT) }

  const submit = async (isNew: boolean) => {
    setSaving(true)
    const payload = {
      ...(isNew ? {} : { id: editing }),
      productCode  : draft.productCode.trim(),
      productName  : draft.productName.trim(),
      category     : draft.category.trim(),
      price        : Number(draft.price) || 0,
      availableDays: draft.availableDays.join(','),
      memo         : draft.memo.trim() || null,
      isActive     : draft.isActive,
    }
    const res  = await authFetch('/api/boss/order-products', {
      method: isNew ? 'POST' : 'PATCH',
      body  : JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (data.success) {
      showToast(isNew ? '追加しました' : '保存しました')
      setEditing(null); setShowAdd(false); setDraft(EMPTY_DRAFT)
      fetchAll()
    } else {
      showToast('エラー: ' + (data.error ?? '不明'))
    }
  }

  const deactivate = async (id: number) => {
    if (!window.confirm('この商品を無効化しますか？')) return
    const res = await authFetch(`/api/boss/order-products?id=${id}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    if (data.success) {
      showToast('無効化しました')
      fetchAll()
    } else {
      showToast('エラー: ' + data.error)
    }
  }

  const toggleDay = (day: string) => {
    const has = draft.availableDays.includes(day)
    setDraft({
      ...draft,
      availableDays: has
        ? draft.availableDays.filter((d) => d !== day)
        : [...draft.availableDays, day],
    })
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />

  // データ内のカテゴリ一覧（順序保存）。空カテゴリは '(未分類)' に集約
  const categoryList: string[] = []
  const counts: Record<string, number> = {}
  for (const p of items) {
    const c = p.category || '(未分類)'
    if (!categoryList.includes(c)) categoryList.push(c)
    counts[c] = (counts[c] ?? 0) + 1
  }

  const currentCat = activeCat && categoryList.includes(activeCat)
    ? activeCat
    : (categoryList[0] ?? null)

  const visible = currentCat
    ? items
        .filter((p) => (p.category || '(未分類)') === currentCat)
        .filter((p) => showInactive ? true : p.isActive)
        .slice()
        .sort((a, b) => {
          if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
          return a.productCode.localeCompare(b.productCode)
        })
    : []

  const persistOrder = async (orderedIds: number[]) => {
    setReordering(true)
    const idToOrder = new Map(orderedIds.map((id, i) => [id, i + 1]))
    setItems((prev) => prev.map((p) =>
      idToOrder.has(p.id) ? { ...p, displayOrder: idToOrder.get(p.id)! } : p))

    const payload = orderedIds.map((id, i) => ({ id, displayOrder: i + 1 }))
    const res  = await authFetch('/api/boss/order-products/reorder', {
      method: 'POST',
      body  : JSON.stringify({ items: payload }),
    })
    const data = await res.json()
    setReordering(false)
    if (!data.success) {
      showToast('並び替えの保存に失敗: ' + (data.error ?? '不明'))
      fetchAll()
    }
  }

  const moveRow = (id: number, direction: -1 | 1) => {
    const ids = visible.map((p) => p.id)
    const from = ids.indexOf(id)
    const to   = from + direction
    if (from < 0 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    persistOrder(ids)
  }

  const handleDrop = (targetId: number) => {
    if (dragId == null || dragId === targetId) return
    const ids = visible.map((p) => p.id)
    const from = ids.indexOf(dragId)
    const to   = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    setDragId(null)
    setDragOverId(null)
    persistOrder(ids)
  }

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      <BossHeader title="🍱 オリジナル商品マスタ" subtitle={user?.name} onLogout={logout} />
      <BossNav active="/boss/order-products" />

      <div style={{ padding:'12px' }}>
        <button onClick={() => {
          setShowAdd(!showAdd)
          setEditing(null)
          setDraft(EMPTY_DRAFT)
        }}
          style={{ width:'100%', padding:'12px',
            background: showAdd ? '#888780' : '#3B6D11',
            color:'white', border:'none', borderRadius:'10px',
            fontSize:'14px', fontWeight:500, cursor:'pointer',
            fontFamily:'inherit', marginBottom:'12px' }}>
          {showAdd ? '＋ キャンセル' : '＋ 新規商品を追加'}
        </button>

        {showAdd && (
          <ProductForm draft={draft} onChange={setDraft}
            onToggleDay={toggleDay}
            onSubmit={() => submit(true)}
            onCancel={() => { setShowAdd(false); setDraft(EMPTY_DRAFT) }}
            saving={saving} isNew />
        )}

        {/* カテゴリタブ */}
        {categoryList.length > 0 && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'10px' }}>
            {categoryList.map((cat) => {
              const active = cat === currentCat
              return (
                <button key={cat} onClick={() => setActiveCat(cat)}
                  style={{
                    padding:'8px 14px', borderRadius:'20px', fontSize:'13px',
                    fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                    border: active ? '1.5px solid #3B6D11' : '1.5px solid #E5E1D8',
                    background: active ? '#3B6D11' : 'white',
                    color    : active ? 'white'   : '#2C2C2A',
                  }}>
                  {cat}（{counts[cat] ?? 0}）
                </button>
              )
            })}
          </div>
        )}

        {categoryList.length > 0 && (
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center',
            marginBottom:'10px', padding:'8px 12px', background:'white',
            borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
            <span style={{ fontSize:'12px', color:'#888780' }}>
              ⋮⋮ をドラッグ または ▲▼ で並び替え（カテゴリ内のみ）
            </span>
            {reordering && (
              <span style={{ fontSize:'11px', color:'#3B6D11' }}>保存中...</span>
            )}
            <label style={{ display:'flex', alignItems:'center', gap:'6px',
              fontSize:'12px', color:'#888780', cursor:'pointer', marginLeft:'auto' }}>
              <input type="checkbox" checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)} />
              無効も表示
            </label>
          </div>
        )}

        {currentCat && (
          <div style={{ marginBottom:'12px', background:'white', borderRadius:'16px',
            overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
              fontWeight:500, fontSize:'14px', background:'#FBF8F2' }}>
              {currentCat}（{visible.length}品）
            </div>
            {visible.map((p, idx) => (
              <div key={p.id}>
                {editing === p.id ? (
                  <div style={{ padding:'12px 16px',
                    borderBottom: idx < visible.length-1 ? '1px solid #F5F1EA' : 'none',
                    background:'#FAFAFA' }}>
                    <ProductForm draft={draft} onChange={setDraft}
                      onToggleDay={toggleDay}
                      onSubmit={() => submit(false)}
                      onCancel={cancelEdit} saving={saving} />
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      if (dragId == null || dragId === p.id) return
                      e.preventDefault()
                      if (dragOverId !== p.id) setDragOverId(p.id)
                    }}
                    onDragLeave={() => { if (dragOverId === p.id) setDragOverId(null) }}
                    onDrop={() => handleDrop(p.id)}
                    style={{ padding:'12px 16px',
                    borderBottom: idx < visible.length-1 ? '1px solid #F5F1EA' : 'none',
                    display:'flex', justifyContent:'space-between',
                    alignItems:'center',
                    opacity: p.isActive ? (dragId === p.id ? .4 : 1) : .5,
                    background: dragOverId === p.id ? '#FAFEF6' : 'transparent',
                    borderTop: dragOverId === p.id ? '2px solid #639922' : undefined }}>
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDragId(p.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', String(p.id))
                      }}
                      onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                      title="ドラッグして並び替え"
                      style={{ fontSize:'18px', color:'#A8A69E', cursor:'grab',
                        padding:'4px 8px', userSelect:'none', marginRight:'4px' }}>
                      ⋮⋮
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'2px',
                      marginRight:'10px' }}>
                      <button onClick={() => moveRow(p.id, -1)}
                        disabled={idx === 0 || reordering}
                        style={{ padding:'2px 6px', border:'1.5px solid #E5E1D8',
                          borderRadius:'6px', background:'white',
                          cursor: idx === 0 ? 'not-allowed' : 'pointer',
                          fontSize:'11px', color: idx === 0 ? '#D9D5CC' : '#2C2C2A',
                          fontFamily:'inherit', lineHeight:1 }}>▲</button>
                      <button onClick={() => moveRow(p.id, 1)}
                        disabled={idx === visible.length - 1 || reordering}
                        style={{ padding:'2px 6px', border:'1.5px solid #E5E1D8',
                          borderRadius:'6px', background:'white',
                          cursor: idx === visible.length - 1 ? 'not-allowed' : 'pointer',
                          fontSize:'11px',
                          color: idx === visible.length - 1 ? '#D9D5CC' : '#2C2C2A',
                          fontFamily:'inherit', lineHeight:1 }}>▼</button>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A' }}>
                        {p.productName}
                        {!p.isActive && (
                          <span style={{ fontSize:'10px', marginLeft:'6px',
                            background:'#E5E1D8', padding:'1px 6px',
                            borderRadius:'8px', color:'#888780' }}>無効</span>
                        )}
                      </div>
                      <div style={{ fontSize:'11px', color:'#888780', marginTop:'2px' }}>
                        {p.productCode} / ¥{p.price.toLocaleString()}
                        {p.availableDays && ` / ${p.availableDays}`}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:'4px' }}>
                      <button onClick={() => startEdit(p)}
                        style={{ padding:'6px 12px', background:'white',
                          border:'1.5px solid #E5E1D8', borderRadius:'8px',
                          fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>
                        編集
                      </button>
                      {p.isActive && (
                        <button onClick={() => deactivate(p.id)}
                          style={{ padding:'6px 12px', background:'white',
                            border:'1.5px solid #E5E1D8', borderRadius:'8px',
                            fontSize:'12px', cursor:'pointer', fontFamily:'inherit',
                            color:'#E24B4A' }}>
                          無効化
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {visible.length === 0 && (
              <div style={{ padding:'24px', textAlign:'center', color:'#888780', fontSize:'13px' }}>
                該当する商品がありません
              </div>
            )}
          </div>
        )}

        {items.length === 0 && !showAdd && (
          <div style={{ background:'white', borderRadius:'16px', padding:'24px',
            textAlign:'center', color:'#888780', fontSize:'14px' }}>
            オリジナル商品がまだ登録されていません
          </div>
        )}
      </div>

      <Toast text={toast} />
    </div>
  )
}

function ProductForm({
  draft, onChange, onToggleDay, onSubmit, onCancel, saving, isNew,
}: {
  draft      : Draft
  onChange   : (d: Draft) => void
  onToggleDay: (day: string) => void
  onSubmit   : () => void
  onCancel   : () => void
  saving     : boolean
  isNew?     : boolean
}) {
  return (
    <div style={{ background: isNew ? 'white' : 'transparent',
      borderRadius: isNew ? '16px' : 0,
      padding:'16px', marginBottom: isNew ? '12px' : 0,
      boxShadow: isNew ? '0 2px 8px rgba(0,0,0,.04)' : 'none' }}>
      <Field label="商品コード *">
        <input type="text" value={draft.productCode}
          onChange={(e) => onChange({ ...draft, productCode: e.target.value })}
          style={inputStyle()} placeholder="例: BENTO001" />
      </Field>
      <Field label="商品名 *">
        <input type="text" value={draft.productName}
          onChange={(e) => onChange({ ...draft, productName: e.target.value })}
          style={inputStyle()} placeholder="例: 幕の内弁当" />
      </Field>
      <Field label="カテゴリ *">
        <input type="text" value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value })}
          style={inputStyle()} list="cat-suggestions" placeholder="例: 弁当" />
        <datalist id="cat-suggestions">
          {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
      <Field label="価格">
        <input type="number" value={draft.price}
          onChange={(e) => onChange({ ...draft, price: e.target.value })}
          style={inputStyle()} placeholder="0" />
      </Field>
      <Field label="販売曜日">
        <div style={{ display:'flex', gap:'6px' }}>
          {DAYS.map((d) => {
            const active = draft.availableDays.includes(d)
            return (
              <button key={d} type="button" onClick={() => onToggleDay(d)}
                style={{ flex:1, padding:'8px',
                  background: active ? '#3B6D11' : 'white',
                  color: active ? 'white' : '#2C2C2A',
                  border:'1.5px solid', borderColor: active ? '#3B6D11' : '#E5E1D8',
                  borderRadius:'8px', fontSize:'13px', cursor:'pointer',
                  fontFamily:'inherit' }}>
                {d}
              </button>
            )
          })}
        </div>
      </Field>
      <Field label="メモ">
        <input type="text" value={draft.memo}
          onChange={(e) => onChange({ ...draft, memo: e.target.value })}
          style={inputStyle()} placeholder="(任意)" />
      </Field>
      <label style={{ display:'flex', alignItems:'center', gap:'8px',
        fontSize:'13px', marginBottom:'12px', cursor:'pointer' }}>
        <input type="checkbox" checked={draft.isActive}
          onChange={(e) => onChange({ ...draft, isActive: e.target.checked })} />
        有効
      </label>
      <div style={{ display:'flex', gap:'8px' }}>
        <button onClick={onCancel}
          style={{ flex:1, padding:'10px', background:'white',
            border:'1.5px solid #E5E1D8', borderRadius:'8px',
            fontSize:'14px', cursor:'pointer', fontFamily:'inherit' }}>
          キャンセル
        </button>
        <button onClick={onSubmit} disabled={saving}
          style={{ flex:1, padding:'10px',
            background: saving ? '#888780' : '#3B6D11',
            color:'white', border:'none', borderRadius:'8px',
            fontSize:'14px', fontWeight:500, cursor:'pointer',
            fontFamily:'inherit' }}>
          {saving ? '保存中...' : (isNew ? '追加する' : '保存する')}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:'10px' }}>
      <label style={{ fontSize:'12px', color:'#888780', display:'block',
        marginBottom:'4px' }}>{label}</label>
      {children}
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

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA' }}>
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', maxWidth:'320px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🚫</div>
        <p style={{ fontSize:'16px', fontWeight:500, color:'#E24B4A' }}>{msg}</p>
      </div>
    </div>
  )
}

export default function OrderProductsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrderProductsContent />
    </Suspense>
  )
}
