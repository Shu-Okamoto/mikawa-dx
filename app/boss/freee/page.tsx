'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav, Toast, useToast, inputStyle } from '../_shared'
import { todayJstYmd } from '@/lib/serverDate'

interface AccountItem { id: string; name: string; defaultTaxCode: number | null }
interface StoreRef   { storeCode: string; storeName: string }
interface MappingRow { key: string; accountId: string; accountName: string; taxCode: number | null }

interface FreeeStatus {
  configured  : boolean
  connected   : boolean
  companyId  ?: string | null
  redirectUri?: string | null
}

interface Preview {
  storeCode: string
  storeName: string
  total    : number
  cash     : number
  paypay   : number
  voucher  : number
  sent     : boolean
  blockers : string[]
}

// 貸方(売上高)は店舗ごと。借方は決済手段ごとに1つ。
const DEBIT_SLOTS = [
  { key: 'cash',    label: '現金',             hint: '売上金額から PayPay・商品券を引いた分' },
  { key: 'paypay',  label: 'PayPay',           hint: '例: ペイペイ未収入金' },
  { key: 'voucher', label: 'プレミアム商品券', hint: '使っていなければ空欄でも可' },
]

const yen = (n: number) => '¥' + n.toLocaleString()

function FreeeContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const { toast, showToast } = useToast()
  const params = useSearchParams()

  const [status, setStatus]   = useState<FreeeStatus | null>(null)
  const [items, setItems]     = useState<AccountItem[]>([])
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [stores, setStores]   = useState<StoreRef[]>([])
  const [draft, setDraft]     = useState<Record<string, MappingRow>>({})
  const [saved, setSaved]     = useState<Record<string, MappingRow>>({})
  const [saving, setSaving]   = useState(false)

  const [date, setDate]       = useState('')
  const [preview, setPreview] = useState<Preview[] | null>(null)
  const [sending, setSending] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (!user) return
    const res = await authFetch('/api/boss/freee/status')
    setStatus(res.ok ? await res.json() : null)
  }, [user])

  const loadMapping = useCallback(async () => {
    if (!user) return
    const res  = await authFetch('/api/boss/freee/mapping')
    const data = await res.json()
    if (!res.ok) { showToast(data.error ?? '取得に失敗しました'); return }
    setItems(data.accountItems ?? [])
    setItemsError(data.accountsError ?? null)
    setStores(data.stores ?? [])
    const m: Record<string, MappingRow> = {}
    ;(data.mapping ?? []).forEach((r: MappingRow) => { m[r.key] = r })
    setSaved(m)
    setDraft(m)
  }, [user])

  useEffect(() => {
    if (!loading && !error) { loadStatus(); loadMapping(); setDate(todayJstYmd()) }
  }, [loading, error, loadStatus, loadMapping])

  useEffect(() => {
    const r = params.get('freee')
    if (r === 'connected') showToast('freee と連携しました')
    else if (r === 'error') showToast('freee 連携に失敗しました: ' + (params.get('reason') ?? ''))
  }, [params])

  const connect = async () => {
    const res  = await authFetch('/api/boss/freee/connect', { method: 'POST' })
    const data = await res.json()
    if (!res.ok || !data.url) { showToast(data.error ?? '連携を開始できませんでした'); return }
    window.location.href = data.url
  }

  const disconnect = async () => {
    const res = await authFetch('/api/boss/freee/status', { method: 'DELETE' })
    if (!res.ok) { showToast('連携解除に失敗しました'); return }
    showToast('連携を解除しました')
    loadStatus()
  }

  const setSlot = (key: string, accountId: string) => {
    const item = items.find((i) => i.id === accountId)
    setDraft((prev) => ({
      ...prev,
      [key]: {
        key,
        accountId,
        accountName: item?.name ?? '',
        // 売上高(貸方)だけ税区分を持たせる。科目の既定値を初期値にする
        taxCode    : key.startsWith('sales:') ? (item?.defaultTaxCode ?? null) : null,
      },
    }))
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(saved)

  const save = async () => {
    setSaving(true)
    const res  = await authFetch('/api/boss/freee/mapping', {
      method: 'PUT',
      body  : JSON.stringify({
        entries: [...stores.map((s) => `sales:${s.storeCode}`), ...DEBIT_SLOTS.map((d) => d.key)]
          .map((key) => draft[key] ?? { key, accountId: '', accountName: '', taxCode: null }),
      }),
    })
    setSaving(false)
    if (!res.ok) { showToast('保存に失敗しました'); return }
    showToast('保存しました')
    loadMapping()
  }

  const loadPreview = async () => {
    if (!date) return
    const res  = await authFetch(`/api/boss/freee/journal?date=${encodeURIComponent(date)}`)
    const data = await res.json()
    if (!res.ok) { showToast(data.error ?? '取得に失敗しました'); return }
    setPreview(data.stores ?? [])
  }

  const send = async (p: Preview) => {
    setSending(p.storeCode)
    const res  = await authFetch('/api/boss/freee/journal', {
      method: 'POST', body: JSON.stringify({ date, storeCode: p.storeCode }),
    })
    const data = await res.json().catch(() => ({}))
    setSending(null)
    if (!res.ok) { showToast(data.error ?? '登録に失敗しました'); return }
    showToast(data.alreadySent ? '送信済みです' : 'freee に登録しました')
    loadPreview()
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA', minHeight:'100vh', paddingBottom:'32px' }}>

      <BossHeader title="🔗 freee連携" subtitle={user?.name} onLogout={logout} />
      <BossNav active="/boss/freee" />

      <div style={{ padding:'12px' }}>
        {/* 連携状態 */}
        <Card title="連携">
          {!status?.configured ? (
            <Note>
              環境変数（FREEE_CLIENT_ID / FREEE_CLIENT_SECRET / FREEE_COMPANY_ID）が
              未設定です。Vercel に設定してから再読み込みしてください。
            </Note>
          ) : status.connected ? (
            <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:0, fontSize:'14px', color:'#3B6D11' }}>
                連携中{status.companyId ? `（事業所 ${status.companyId}）` : ''}
              </div>
              <button onClick={disconnect} style={btn('#E24B4A', 'white', '#F3C6C4')}>
                連携を解除
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:0, fontSize:'14px', color:'#888780' }}>未連携</div>
              <button onClick={connect} style={btn('white', '#3B6D11')}>freee と連携</button>
            </div>
          )}
          {status?.redirectUri && (
            <Note>
              コールバックURL（freee アプリ管理に登録する値）: {status.redirectUri}
            </Note>
          )}
        </Card>

        {/* 科目マッピング */}
        <Card title="勘定科目の割り当て">
          {itemsError && <Note warn>科目一覧を取得できませんでした: {itemsError}</Note>}
          {items.length === 0 && !itemsError && (
            <Note>連携すると freee の勘定科目を選べるようになります。</Note>
          )}

          <div style={{ fontSize:'12px', color:'#888780', margin:'4px 0 8px' }}>
            貸方（売上高）
          </div>
          {stores.map((s) => (
            <Slot key={s.storeCode} label={s.storeName}
              hint={`${s.storeName}の売上高`}
              value={draft[`sales:${s.storeCode}`]?.accountId ?? ''}
              fallbackName={draft[`sales:${s.storeCode}`]?.accountName}
              items={items} onChange={(v) => setSlot(`sales:${s.storeCode}`, v)} />
          ))}

          <div style={{ fontSize:'12px', color:'#888780', margin:'14px 0 8px' }}>
            借方（受け取り方）
          </div>
          {DEBIT_SLOTS.map((d) => (
            <Slot key={d.key} label={d.label} hint={d.hint}
              value={draft[d.key]?.accountId ?? ''}
              fallbackName={draft[d.key]?.accountName}
              items={items} onChange={(v) => setSlot(d.key, v)} />
          ))}

          <button onClick={save} disabled={!changed || saving}
            style={{ ...btn(changed ? '#3B6D11' : '#E5E1D8', 'white'),
              width:'100%', marginTop:'14px', padding:'12px' }}>
            {saving ? '保存中...' : changed ? '保存' : '変更なし'}
          </button>
        </Card>

        {/* 売上送信 */}
        <Card title="売上を freee に登録">
          <Note>
            実績入力の「売上金額」は総額として扱います。現金分 = 売上金額 −
            PayPay − プレミアム商品券 です。
          </Note>
          <div style={{ display:'flex', gap:'8px', alignItems:'center', marginTop:'8px' }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={inputStyle({ flex: 1 })} />
            <button onClick={loadPreview} style={btn('white', '#2C2C2A')}>表示</button>
          </div>

          {preview && (preview.length === 0 ? (
            <Note>この日の実績はありません。</Note>
          ) : (
            <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'10px' }}>
              {preview.map((p) => (
                <div key={p.storeCode} style={{ border:'1.5px solid #E5E1D8',
                  borderRadius:'10px', padding:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'baseline', marginBottom:'6px' }}>
                    <span style={{ fontSize:'15px', fontWeight:500 }}>{p.storeName}</span>
                    <span style={{ fontSize:'15px', fontWeight:500 }}>{yen(p.total)}</span>
                  </div>
                  <div style={{ fontSize:'12px', color:'#888780' }}>
                    現金 {yen(p.cash)} / PayPay {yen(p.paypay)} / 商品券 {yen(p.voucher)}
                  </div>
                  {p.sent ? (
                    <div style={{ marginTop:'8px', fontSize:'13px', color:'#3B6D11' }}>
                      ✓ freee 登録済み
                    </div>
                  ) : p.blockers.length > 0 ? (
                    <div style={{ marginTop:'8px', fontSize:'12px', color:'#E67E22' }}>
                      {p.blockers.join(' / ')}
                    </div>
                  ) : (
                    <button onClick={() => send(p)} disabled={sending === p.storeCode}
                      style={{ ...btn('#3B6D11', 'white'), width:'100%',
                        marginTop:'10px', padding:'10px' }}>
                      {sending === p.storeCode ? '登録中...' : 'freee に登録'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>

      <Toast text={toast} />
    </div>
  )
}

function Slot({ label, hint, value, fallbackName, items, onChange }: {
  label: string
  hint : string
  value: string
  // 科目一覧を取得できないとき(未連携など)に、保存済みの科目名を見せるため
  fallbackName?: string
  items: AccountItem[]
  onChange: (v: string) => void
}) {
  const missing = !!value && !items.some((i) => i.id === value)
  return (
    <div style={{ marginBottom:'10px' }}>
      <div style={{ fontSize:'13px', color:'#2C2C2A', fontWeight:500 }}>{label}</div>
      <div style={{ fontSize:'11px', color:'#B4B2A9', marginBottom:'4px' }}>{hint}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={inputStyle()} disabled={items.length === 0}>
        <option value="">（未設定）</option>
        {missing && (
          <option value={value}>{fallbackName || `設定済み (ID ${value})`}</option>
        )}
        {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background:'white', borderRadius:'16px', padding:'16px',
      marginBottom:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <div style={{ fontSize:'15px', fontWeight:500, color:'#2C2C2A',
        marginBottom:'10px' }}>{title}</div>
      {children}
    </div>
  )
}

function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div style={{ fontSize:'12px', color: warn ? '#E67E22' : '#888780',
      marginTop:'6px', lineHeight:1.6, wordBreak:'break-all' }}>
      {children}
    </div>
  )
}

function btn(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    padding:'9px 16px', background:bg, color,
    border: border ? `1.5px solid ${border}` : (bg === 'white' ? '1.5px solid #E5E1D8' : 'none'),
    borderRadius:'10px', fontSize:'14px', cursor:'pointer',
    fontFamily:'inherit', fontWeight:500,
  }
}

function Loading() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh',
      fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      読み込み中...
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#F5F1EA',
      fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', maxWidth:'320px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🚫</div>
        <p style={{ fontSize:'16px', fontWeight:500, color:'#E24B4A' }}>{msg}</p>
      </div>
    </div>
  )
}

export default function FreeePage() {
  return (
    <Suspense fallback={<Loading />}>
      <FreeeContent />
    </Suspense>
  )
}
