'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav, Toast, useToast } from '../_shared'

interface ManagedUser {
  id         : number
  name       : string
  email      : string | null
  role       : string
  lineUserId : string | null
  displayName: string | null
  pictureUrl : string | null
  isActive   : boolean
  storeCode  : string | null
  storeName  : string | null
  createdAt  : string
}

const ROLE_OPTIONS = [
  { value: 'pending', label: '保留中' },
  { value: 'nishi',   label: '西店' },
  { value: 'minami',  label: '南店' },
  { value: 'hq1',     label: '本部 (野菜)' },
  { value: 'hq2',     label: '本部 (果物)' },
  { value: 'hq3',     label: '本部 (餅乾物)' },
  { value: 'all',     label: 'all (管理者)' },
]

function UsersContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const { toast, showToast } = useToast()
  const [users, setUsers]   = useState<ManagedUser[]>([])
  const [drafts, setDrafts] = useState<Record<number, { role: string; isActive: boolean }>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!user) return
    const res  = await authFetch('/api/boss/users')
    const data: ManagedUser[] = await res.json()
    setUsers(data)
    const d: Record<number, { role: string; isActive: boolean }> = {}
    data.forEach((u) => { d[u.id] = { role: u.role, isActive: u.isActive } })
    setDrafts(d)
  }, [user])

  useEffect(() => {
    if (!loading && !error) fetchUsers()
  }, [loading, error, fetchUsers])

  const save = async (target: ManagedUser) => {
    const d = drafts[target.id]
    if (!d) return
    setSavingId(target.id)
    const res  = await authFetch('/api/boss/users', {
      method: 'PATCH',
      body  : JSON.stringify({
        id      : target.id,
        role    : d.role,
        isActive: d.isActive,
      }),
    })
    const data = await res.json()
    setSavingId(null)
    if (data.success) {
      showToast(data.notified
        ? '保存しました（LINE に通知済）'
        : '保存しました')
      fetchUsers()
    } else {
      showToast('エラー: ' + (data.error ?? '不明'))
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />

  const pending = users.filter((u) => u.role === 'pending')
  const active  = users.filter((u) => u.role !== 'pending')

  return (
    <div style={{ fontFamily:'-apple-system,sans-serif', background:'#F5F1EA',
      minHeight:'100vh', paddingBottom:'24px' }}>

      <BossHeader title="👥 ユーザー管理" subtitle={user?.name} onLogout={logout} />
      <BossNav active="/boss/users" />

      <div style={{ padding:'12px' }}>
        {pending.length > 0 && (
          <>
            <SectionTitle text={`⏳ 承認待ち (${pending.length})`} color="#E67E22" />
            {pending.map((u) => (
              <UserCard key={u.id} user={u} draft={drafts[u.id]}
                onChange={(d) => setDrafts((prev) => ({ ...prev, [u.id]: d }))}
                onSave={() => save(u)} saving={savingId === u.id} />
            ))}
          </>
        )}

        <SectionTitle text={`👤 登録済み (${active.length})`} color="#3B6D11" />
        {active.length === 0 ? (
          <div style={{ background:'white', borderRadius:'16px', padding:'24px',
            textAlign:'center', color:'#888780', fontSize:'14px' }}>
            登録済みユーザーがいません
          </div>
        ) : active.map((u) => (
          <UserCard key={u.id} user={u} draft={drafts[u.id]}
            onChange={(d) => setDrafts((prev) => ({ ...prev, [u.id]: d }))}
            onSave={() => save(u)} saving={savingId === u.id} />
        ))}
      </div>

      <Toast text={toast} />
    </div>
  )
}

function SectionTitle({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ fontWeight:500, fontSize:'14px', padding:'8px 4px',
      color, marginTop:'8px' }}>
      {text}
    </div>
  )
}

function UserCard({
  user, draft, onChange, onSave, saving,
}: {
  user   : ManagedUser
  draft  : { role: string; isActive: boolean } | undefined
  onChange: (d: { role: string; isActive: boolean }) => void
  onSave : () => void
  saving : boolean
}) {
  const current = draft ?? { role: user.role, isActive: user.isActive }
  const changed = current.role !== user.role || current.isActive !== user.isActive

  return (
    <div style={{ background:'white', borderRadius:'16px',
      padding:'16px', marginBottom:'12px',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px',
        marginBottom:'12px' }}>
        {user.pictureUrl ? (
          <img src={user.pictureUrl} alt={user.displayName ?? ''}
            style={{ width:'48px', height:'48px', borderRadius:'50%',
              objectFit:'cover' }} />
        ) : (
          <div style={{ width:'48px', height:'48px', borderRadius:'50%',
            background:'#F5F1EA', display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:'20px' }}>👤</div>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A' }}>
            {user.displayName ?? user.name}
          </div>
          <div style={{ fontSize:'11px', color:'#888780',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            登録: {new Date(user.createdAt).toLocaleDateString('ja-JP')}
            {user.lineUserId && ` / ${user.lineUserId.slice(-8)}`}
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr auto',
        gap:'8px', alignItems:'center', marginBottom:'8px' }}>
        <select value={current.role}
          onChange={(e) => onChange({ ...current, role: e.target.value })}
          style={{ width:'100%', padding:'8px', border:'1.5px solid #E5E1D8',
            borderRadius:'8px', fontSize:'14px', fontFamily:'inherit' }}>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label style={{ display:'flex', alignItems:'center', gap:'6px',
          fontSize:'12px', color:'#888780', cursor:'pointer' }}>
          <input type="checkbox" checked={current.isActive}
            onChange={(e) => onChange({ ...current, isActive: e.target.checked })} />
          有効
        </label>
      </div>

      <button onClick={onSave} disabled={!changed || saving}
        style={{ width:'100%', padding:'10px',
          background: !changed ? '#E5E1D8' : (saving ? '#888780' : '#3B6D11'),
          color:'white', border:'none', borderRadius:'10px',
          fontSize:'14px', fontWeight:500,
          cursor: !changed || saving ? 'default' : 'pointer',
          fontFamily:'inherit' }}>
        {saving ? '保存中...' : changed ? '保存（LINE通知）' : '変更なし'}
      </button>
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

export default function UsersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <UsersContent />
    </Suspense>
  )
}
