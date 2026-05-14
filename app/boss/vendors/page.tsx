'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav, Toast, useToast, inputStyle } from '../_shared'

interface Vendor {
  id         : number
  vendorCode : string
  vendorName : string
  category   : string | null
  contactName: string | null
  phone      : string | null
  memo       : string | null
}

const CATEGORIES = ['野菜', '果物', '餅・乾物菓子類', 'その他']

type Draft = {
  vendorCode : string
  vendorName : string
  category   : string
  contactName: string
  phone      : string
  memo       : string
}

const EMPTY_DRAFT: Draft = {
  vendorCode : '',
  vendorName : '',
  category   : '',
  contactName: '',
  phone      : '',
  memo       : '',
}

function VendorsContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const { toast, showToast } = useToast()
  const [items, setItems]     = useState<Vendor[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft]     = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving]   = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const res = await authFetch('/api/boss/vendors')
    setItems(await res.json())
  }, [user])

  useEffect(() => {
    if (!loading && !error) fetchAll()
  }, [loading, error, fetchAll])

  const startEdit = (v: Vendor) => {
    setEditing(v.id)
    setShowAdd(false)
    setDraft({
      vendorCode : v.vendorCode,
      vendorName : v.vendorName,
      category   : v.category    ?? '',
      contactName: v.contactName ?? '',
      phone      : v.phone       ?? '',
      memo       : v.memo        ?? '',
    })
  }

  const cancelEdit = () => { setEditing(null); setDraft(EMPTY_DRAFT) }

  const submit = async (isNew: boolean) => {
    setSaving(true)
    const payload = {
      ...(isNew ? {} : { id: editing }),
      vendorCode : draft.vendorCode.trim(),
      vendorName : draft.vendorName.trim(),
      category   : draft.category.trim() || null,
      contactName: draft.contactName.trim() || null,
      phone      : draft.phone.trim() || null,
      memo       : draft.memo.trim() || null,
    }
    const res  = await authFetch('/api/boss/vendors', {
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

  const remove = async (id: number) => {
    if (!window.confirm('この仕入先を削除しますか？')) return
    const res = await authFetch(`/api/boss/vendors?id=${id}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    if (data.success) {
      showToast('削除しました')
      fetchAll()
    } else {
      showToast('エラー: ' + data.error)
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />

  const byCategory = new Map<string, Vendor[]>()
  for (const v of items) {
    const key = v.category ?? '(未分類)'
    const arr = byCategory.get(key) ?? []
    arr.push(v)
    byCategory.set(key, arr)
  }

  return (
    <div style={{ fontFamily:'-apple-system,sans-serif', background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      <BossHeader title="🏢 仕入先マスタ" subtitle={user?.name} onLogout={logout} />
      <BossNav active="/boss/vendors" />

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
          {showAdd ? '＋ キャンセル' : '＋ 新規仕入先を追加'}
        </button>

        {showAdd && (
          <VendorForm draft={draft} onChange={setDraft}
            onSubmit={() => submit(true)}
            onCancel={() => { setShowAdd(false); setDraft(EMPTY_DRAFT) }}
            saving={saving} isNew />
        )}

        {Array.from(byCategory.entries()).map(([cat, list]) => (
          <div key={cat} style={{ marginBottom:'12px',
            background:'white', borderRadius:'16px', overflow:'hidden',
            boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
              fontWeight:500, fontSize:'14px', background:'#FBF8F2' }}>
              {cat}（{list.length}社）
            </div>
            {list.map((v, idx) => (
              <div key={v.id}>
                {editing === v.id ? (
                  <div style={{ padding:'12px 16px',
                    borderBottom: idx < list.length-1 ? '1px solid #F5F1EA' : 'none',
                    background:'#FAFAFA' }}>
                    <VendorForm draft={draft} onChange={setDraft}
                      onSubmit={() => submit(false)}
                      onCancel={cancelEdit} saving={saving} />
                  </div>
                ) : (
                  <div style={{ padding:'12px 16px',
                    borderBottom: idx < list.length-1 ? '1px solid #F5F1EA' : 'none',
                    display:'flex', justifyContent:'space-between',
                    alignItems:'flex-start' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A' }}>
                        {v.vendorName}
                      </div>
                      <div style={{ fontSize:'11px', color:'#888780', marginTop:'2px' }}>
                        {v.vendorCode}
                        {v.contactName && ` / ${v.contactName}`}
                        {v.phone && ` / ${v.phone}`}
                      </div>
                      {v.memo && (
                        <div style={{ fontSize:'11px', color:'#888780', marginTop:'2px' }}>
                          📝 {v.memo}
                        </div>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:'4px' }}>
                      <button onClick={() => startEdit(v)}
                        style={{ padding:'6px 12px', background:'white',
                          border:'1.5px solid #E5E1D8', borderRadius:'8px',
                          fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>
                        編集
                      </button>
                      <button onClick={() => remove(v.id)}
                        style={{ padding:'6px 12px', background:'white',
                          border:'1.5px solid #E5E1D8', borderRadius:'8px',
                          fontSize:'12px', cursor:'pointer', fontFamily:'inherit',
                          color:'#E24B4A' }}>
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {items.length === 0 && !showAdd && (
          <div style={{ background:'white', borderRadius:'16px', padding:'24px',
            textAlign:'center', color:'#888780', fontSize:'14px' }}>
            仕入先がまだ登録されていません
          </div>
        )}
      </div>

      <Toast text={toast} />
    </div>
  )
}

function VendorForm({
  draft, onChange, onSubmit, onCancel, saving, isNew,
}: {
  draft   : Draft
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
      <Field label="仕入先コード *">
        <input type="text" value={draft.vendorCode}
          onChange={(e) => onChange({ ...draft, vendorCode: e.target.value })}
          style={inputStyle()} placeholder="例: V001" />
      </Field>
      <Field label="仕入先名 *">
        <input type="text" value={draft.vendorName}
          onChange={(e) => onChange({ ...draft, vendorName: e.target.value })}
          style={inputStyle()} placeholder="例: 八百屋A" />
      </Field>
      <Field label="カテゴリ">
        <select value={draft.category}
          onChange={(e) => onChange({ ...draft, category: e.target.value })}
          style={inputStyle()}>
          <option value="">(未設定)</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
        <Field label="担当者">
          <input type="text" value={draft.contactName}
            onChange={(e) => onChange({ ...draft, contactName: e.target.value })}
            style={inputStyle()} placeholder="例: 田中" />
        </Field>
        <Field label="電話">
          <input type="tel" value={draft.phone}
            onChange={(e) => onChange({ ...draft, phone: e.target.value })}
            style={inputStyle()} placeholder="0900000000" />
        </Field>
      </div>
      <Field label="メモ">
        <input type="text" value={draft.memo}
          onChange={(e) => onChange({ ...draft, memo: e.target.value })}
          style={inputStyle()} placeholder="(任意)" />
      </Field>
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
      minHeight:'100vh', fontFamily:'-apple-system,sans-serif' }}>
      読み込み中...
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:'-apple-system,sans-serif', background:'#F5F1EA' }}>
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', maxWidth:'320px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🚫</div>
        <p style={{ fontSize:'16px', fontWeight:500, color:'#E24B4A' }}>{msg}</p>
      </div>
    </div>
  )
}

export default function VendorsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VendorsContent />
    </Suspense>
  )
}
