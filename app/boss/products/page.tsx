'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav, Toast, useToast, inputStyle } from '../_shared'

interface Product {
  id          : number
  productCode : string
  productName : string
  category    : string
  unit        : string
  weeklyAvg   : number
  vendorId    : number | null
  vendorName  : string | null
  isActive    : boolean
  displayOrder: number
}

interface Vendor {
  id        : number
  vendorCode: string
  vendorName: string
}

const CATEGORIES = ['野菜', '果物', '餅・乾物菓子類']

type Draft = {
  productCode: string
  productName: string
  category   : string
  unit       : string
  weeklyAvg  : string
  vendorId   : string
  isActive   : boolean
}

const EMPTY_DRAFT: Draft = {
  productCode: '',
  productName: '',
  category   : CATEGORIES[0],
  unit       : '',
  weeklyAvg  : '0',
  vendorId   : '',
  isActive   : true,
}

function ProductsContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const { toast, showToast } = useToast()
  const [items, setItems]     = useState<Product[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft]     = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving]   = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [activeCat, setActiveCat] = useState<string>(CATEGORIES[0])
  const [showInactive, setShowInactive] = useState(true)
  const [dragId, setDragId]   = useState<number | null>(null)
  const [reordering, setReordering] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const [pRes, vRes] = await Promise.all([
      authFetch('/api/boss/products'),
      authFetch('/api/boss/vendors'),
    ])
    const pData = await pRes.json()
    const vData = await vRes.json()
    if (!Array.isArray(pData)) {
      showToast('商品の取得に失敗: ' + (pData?.error ?? '不明'))
      setItems([])
    } else {
      setItems(pData)
    }
    setVendors(Array.isArray(vData) ? vData : [])
  }, [user])

  useEffect(() => {
    if (!loading && !error) fetchAll()
  }, [loading, error, fetchAll])

  const startEdit = (p: Product) => {
    setEditing(p.id)
    setShowAdd(false)
    setDraft({
      productCode: p.productCode,
      productName: p.productName,
      category   : p.category,
      unit       : p.unit,
      weeklyAvg  : String(p.weeklyAvg),
      vendorId   : p.vendorId ? String(p.vendorId) : '',
      isActive   : p.isActive,
    })
  }

  const cancelEdit = () => { setEditing(null); setDraft(EMPTY_DRAFT) }

  const submit = async (isNew: boolean) => {
    setSaving(true)
    const payload = {
      ...(isNew ? {} : { id: editing }),
      productCode: draft.productCode.trim(),
      productName: draft.productName.trim(),
      category   : draft.category,
      unit       : draft.unit.trim(),
      weeklyAvg  : Number(draft.weeklyAvg) || 0,
      vendorId   : draft.vendorId ? Number(draft.vendorId) : null,
      isActive   : draft.isActive,
    }
    const res  = await authFetch('/api/boss/products', {
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
    const res = await authFetch(`/api/boss/products?id=${id}`, {
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

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />

  const counts: Record<string, number> = {}
  CATEGORIES.forEach((c) => { counts[c] = items.filter((p) => p.category === c).length })

  // 表示は現在のカテゴリに固定（並び替えはカテゴリ内のみ可）
  const visible = items
    .filter((p) => p.category === activeCat)
    .filter((p) => showInactive ? true : p.isActive)

  const persistOrder = async (orderedIds: number[]) => {
    setReordering(true)
    // ローカル更新（楽観的）
    const idToOrder = new Map(orderedIds.map((id, i) => [id, i + 1]))
    setItems((prev) => prev.map((p) =>
      idToOrder.has(p.id) ? { ...p, displayOrder: idToOrder.get(p.id)! } : p))

    const payload = orderedIds.map((id, i) => ({ id, displayOrder: i + 1 }))
    const res  = await authFetch('/api/boss/products/reorder', {
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

  const handleDrop = (targetId: number) => {
    if (dragId == null || dragId === targetId) return
    const ids = visible.map((p) => p.id)
    const from = ids.indexOf(dragId)
    const to   = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    setDragId(null)
    persistOrder(ids)
  }

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif", background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      <BossHeader title="🥬 商品マスタ" subtitle={user?.name} onLogout={logout} />
      <BossNav active="/boss/products" />

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
          <ProductForm draft={draft} vendors={vendors}
            onChange={setDraft} onSubmit={() => submit(true)}
            onCancel={() => { setShowAdd(false); setDraft(EMPTY_DRAFT) }}
            saving={saving} isNew />
        )}

        {/* カテゴリタブ */}
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'10px' }}>
          {CATEGORIES.map((cat) => {
            const active = activeCat === cat
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

        {/* オプション */}
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center',
          marginBottom:'10px', padding:'8px 12px', background:'white',
          borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <span style={{ fontSize:'12px', color:'#888780' }}>
            ⇅ 行をドラッグして並び替え（カテゴリ内のみ）
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

        <div style={{ marginBottom:'12px', background:'white', borderRadius:'16px',
          overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
            fontWeight:500, fontSize:'14px', background:'#FBF8F2' }}>
            {activeCat}（{visible.length}品）
          </div>
          {visible.map((p, idx) => (
            <div key={p.id}>
              {editing === p.id ? (
                <div style={{ padding:'12px 16px',
                  borderBottom: idx < visible.length-1 ? '1px solid #F5F1EA' : 'none',
                  background:'#FAFAFA' }}>
                  <ProductForm draft={draft} vendors={vendors}
                    onChange={setDraft} onSubmit={() => submit(false)}
                    onCancel={cancelEdit} saving={saving} />
                </div>
              ) : (
                <div
                  draggable
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(p.id)}
                  onDragEnd={() => setDragId(null)}
                  style={{ padding:'12px 16px',
                    borderBottom: idx < visible.length-1 ? '1px solid #F5F1EA' : 'none',
                    display:'flex', justifyContent:'space-between',
                    alignItems:'center', opacity: p.isActive ? (dragId === p.id ? .4 : 1) : .5,
                    background: dragId === p.id ? '#FAF8F3' : 'transparent',
                    cursor: 'grab' }}>
                  <span style={{ color:'#C0BDB8', fontSize:'18px',
                    marginRight:'10px', userSelect:'none' }}>⋮⋮</span>
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
                      {p.productCode} / {p.unit} / 先週平均 {p.weeklyAvg}
                      {p.vendorName && ` / ${p.vendorName}`}
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
      </div>

      <Toast text={toast} />
    </div>
  )
}

function ProductForm({
  draft, vendors, onChange, onSubmit, onCancel, saving, isNew,
}: {
  draft   : Draft
  vendors : Vendor[]
  onChange: (d: Draft) => void
  onSubmit: () => void
  onCancel: () => void
  saving  : boolean
  isNew?  : boolean
}) {
  return (
    <div style={{ background: isNew ? 'white' : 'transparent',
      borderRadius: isNew ? '16px' : 0,
      padding:'16px', marginBottom: isNew ? '12px' : 0,
      boxShadow: isNew ? '0 2px 8px rgba(0,0,0,.04)' : 'none' }}>
      <Field label="商品コード *">
        <input type="text" value={draft.productCode}
          onChange={(e) => onChange({ ...draft, productCode: e.target.value })}
          style={inputStyle()} placeholder="例: VEG001" />
      </Field>
      <Field label="商品名 *">
        <input type="text" value={draft.productName}
          onChange={(e) => onChange({ ...draft, productName: e.target.value })}
          style={inputStyle()} placeholder="例: トマト" />
      </Field>
      <Field label="カテゴリ *">
        <select value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value })}
          style={inputStyle()}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
        <Field label="単位 *">
          <input type="text" value={draft.unit}
            onChange={(e) => onChange({ ...draft, unit: e.target.value })}
            style={inputStyle()} placeholder="例: 箱" />
        </Field>
        <Field label="先週平均">
          <input type="number" value={draft.weeklyAvg}
            onChange={(e) => onChange({ ...draft, weeklyAvg: e.target.value })}
            style={inputStyle()} placeholder="0" />
        </Field>
      </div>
      <Field label="仕入先">
        <select value={draft.vendorId}
          onChange={(e) => onChange({ ...draft, vendorId: e.target.value })}
          style={inputStyle()}>
          <option value="">(未設定)</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.vendorName}</option>
          ))}
        </select>
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

export default function ProductsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProductsContent />
    </Suspense>
  )
}
