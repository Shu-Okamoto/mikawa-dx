'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type RoleKey = 'nishi' | 'minami' | 'honbu' | 'hq1' | 'hq2' | 'hq3' | 'all'

type Entry = {
  role     : RoleKey
  path     : string
  label    : string
  external?: boolean
}

const PIN_ROLE_KEY = 'pinRole'

// 既ログイン時のデフォルト遷移先（role ごとに 1 つ）
const roleHome: Record<RoleKey, string> = {
  nishi : '/store/nishi',
  minami: '/store/minami',
  honbu : '/store/honbu',
  hq1   : '/hq',
  hq2   : '/hq',
  hq3   : '/hq',
  all   : '/boss',
}

const entryGroups: { title: string; rows: Entry[][] }[] = [
  {
    title: '🥬 在庫発注',
    rows: [[
      { role: 'nishi',  path: '/store/nishi',  label: '西店' },
      { role: 'minami', path: '/store/minami', label: '南店' },
      { role: 'honbu',  path: '/store/honbu',  label: '本部' },
    ]],
  },
  {
    title: '🍱 弁当餅注文',
    rows: [[
      { role: 'nishi',  path: '/order/nishi',  label: '西店' },
      { role: 'minami', path: '/order/minami', label: '南店' },
      { role: 'honbu',  path: '/order/honbu',  label: '本部' },
    ]],
  },
  {
    title: '📝 日報',
    rows: [[
      { role: 'nishi',  label: '西店',
        path: 'https://nippo.satonoaji-mikawa.net/store/nishi/today',  external: true },
      { role: 'minami', label: '南店',
        path: 'https://nippo.satonoaji-mikawa.net/store/minami/today', external: true },
    ]],
  },
  {
    title: '📅 週間カレンダー',
    rows: [[
      { role: 'all', path: '/calendar', label: '注文リスト' },
    ]],
  },
  {
    title: '管理',
    rows: [[
      { role: 'hq1', path: '/hq', label: '野菜発注' },
      { role: 'hq2', path: '/hq', label: '果物発注' },
      { role: 'hq3', path: '/hq', label: '菓子類発注' },
    ]],
  },
  {
    title: '分析・システム',
    rows: [[
      { role: 'all', path: '/boss', label: 'ダッシュボード' },
    ]],
  },
]

function canAccess(pinRole: RoleKey, entry: Entry): boolean {
  if (pinRole === 'all') return true
  if (pinRole === 'nishi')
    return entry.role === 'nishi' || (entry.role === 'all' && entry.path === '/calendar')
  if (pinRole === 'minami')
    return entry.role === 'minami' || (entry.role === 'all' && entry.path === '/calendar')
  if (pinRole === 'honbu')
    return entry.role === 'honbu' || (entry.role === 'all' && entry.path === '/calendar')
  // hq1 / hq2 / hq3 はそれぞれのロールに完全一致するボタンのみ
  return entry.role === pinRole
}

export default function HomePage() {
  const router = useRouter()
  const [pinRole, setPinRole]   = useState<RoleKey | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy]         = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const stored = localStorage.getItem('user')
    if (token && stored) {
      try {
        const u = JSON.parse(stored) as { role: RoleKey }
        const dest = roleHome[u.role]
        if (dest) {
          router.push(dest)
          return
        }
      } catch { /* 壊れた値は無視 */ }
    }
    const saved = sessionStorage.getItem(PIN_ROLE_KEY)
    if (saved === 'nishi' || saved === 'minami' || saved === 'honbu' ||
        saved === 'hq1'   || saved === 'hq2'    || saved === 'hq3'   ||
        saved === 'all') {
      setPinRole(saved)
    }
    setHydrated(true)
  }, [router])

  const onPinVerified = (role: RoleKey) => {
    sessionStorage.setItem(PIN_ROLE_KEY, role)
    setPinRole(role)
  }

  const resetPin = () => {
    sessionStorage.removeItem(PIN_ROLE_KEY)
    setPinRole(null)
  }

  const login = async (entry: Entry) => {
    if (entry.external) {
      window.location.href = entry.path
      return
    }
    const key = `${entry.role}:${entry.path}`
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/auth/role', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ role: entry.role }),
      })
      const data = await res.json()
      if (!res.ok || !data.token) {
        setError(data.error || 'ログインに失敗しました')
        setBusy(null)
        return
      }
      localStorage.setItem('token', data.token)
      localStorage.setItem('user',  JSON.stringify(data.user))
      router.push(entry.path)
    } catch {
      setError('サーバーエラーが発生しました')
      setBusy(null)
    }
  }

  if (!hydrated) return null
  if (!pinRole) return <PinPad onVerified={onPinVerified} />

  return (
    <div style={{
      minHeight     : '100vh',
      display       : 'flex',
      alignItems    : 'center',
      justifyContent: 'center',
      background    : '#F5F1EA',
      fontFamily    : "'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      padding       : '24px',
    }}>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: '480px' }}>

        <div style={{ fontSize: '60px', marginBottom: '16px' }}>🥬</div>
        <h1 style={{ fontSize: '28px', fontWeight: 500, color: '#2C2C2A',
          marginBottom: '8px' }}>
          里の味みかわ
        </h1>
        <p style={{ fontSize: '17px', color: '#888780', marginBottom: '32px' }}>
          業務管理システム
        </p>

        <div style={{
          background  : 'white',
          borderRadius: '16px',
          padding     : '24px',
          boxShadow   : '0 2px 8px rgba(0,0,0,.04)',
          textAlign   : 'left',
        }}>
          <p style={{ fontSize: '16px', color: '#888780', marginBottom: '20px',
            textAlign: 'center' }}>
            入りたい画面を選んでください
          </p>

          {entryGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '15px', color: '#888780',
                marginBottom: '8px' }}>{group.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {group.rows.map((row, rowIdx) => (
                  <div key={rowIdx} style={{ display: 'flex', gap: '10px' }}>
                    {row.map((entry) => {
                      const key = `${entry.role}:${entry.path}`
                      const isBusy = busy === key
                      const allowed = canAccess(pinRole, entry)
                      const disabled = !allowed || !!busy
                      return (
                        <button
                          key={key}
                          onClick={() => allowed && login(entry)}
                          disabled={disabled}
                          title={allowed ? undefined : '権限がありません'}
                          style={{
                            flex        : '1 1 0',
                            minWidth    : '0',
                            padding     : '14px 14px',
                            border      : '1px solid #D9D5CC',
                            borderRadius: '10px',
                            background  : !allowed ? '#EFEAE0'
                                        : isBusy   ? '#EFEAE0' : 'white',
                            color       : !allowed ? '#B8B5AC' : '#2C2C2A',
                            fontSize    : '17px',
                            cursor      : disabled ? 'not-allowed' : 'pointer',
                            opacity     : !allowed ? 0.55
                                        : (busy && !isBusy) ? 0.5 : 1,
                          }}
                        >
                          {isBusy ? '...' : entry.label}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {error && (
            <p style={{ fontSize: '15px', color: '#E24B4A', marginTop: '12px',
              textAlign: 'center' }}>
              {error}
            </p>
          )}

          <button
            onClick={resetPin}
            style={{
              marginTop : '16px',
              width     : '100%',
              padding   : '10px',
              border    : 'none',
              background: 'transparent',
              color     : '#888780',
              fontSize  : '14px',
              cursor    : 'pointer',
              textDecoration: 'underline',
            }}
          >
            別のPINで入り直す
          </button>
        </div>

        <p style={{ fontSize: '13px', color: '#A8A69E', marginTop: '24px' }}>
          © 2026 里の味みかわ
        </p>
      </div>
    </div>
  )
}

function PinPad({ onVerified }: { onVerified: (role: RoleKey) => void }) {
  const [digits, setDigits] = useState<string>('')
  const [error, setError]   = useState<string | null>(null)
  const [busy, setBusy]     = useState(false)

  const verify = async (pin: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/pin', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ pin }),
      })
      const data = await res.json()
      if (!res.ok || !data.role) {
        setError(data.error || 'PINが正しくありません')
        setDigits('')
        setBusy(false)
        return
      }
      onVerified(data.role as RoleKey)
    } catch {
      setError('サーバーエラーが発生しました')
      setDigits('')
      setBusy(false)
    }
  }

  const push = (d: string) => {
    if (busy) return
    if (digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    setError(null)
    if (next.length === 4) verify(next)
  }

  const back = () => {
    if (busy) return
    setDigits((s) => s.slice(0, -1))
    setError(null)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div style={{
      minHeight     : '100vh',
      display       : 'flex',
      alignItems    : 'center',
      justifyContent: 'center',
      background    : '#F5F1EA',
      fontFamily    : "'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      padding       : '24px',
    }}>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: '320px' }}>
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔒</div>
        <h1 style={{ fontSize: '18px', fontWeight: 500, color: '#2C2C2A',
          marginBottom: '6px' }}>
          PIN を入力してください
        </h1>
        <p style={{ fontSize: '13px', color: '#888780', marginBottom: '22px' }}>
          4桁の数字
        </p>

        <div style={{
          display       : 'flex',
          justifyContent: 'center',
          gap           : '12px',
          marginBottom  : '20px',
        }}>
          {[0,1,2,3].map((i) => (
            <div key={i} style={{
              width       : '14px',
              height      : '14px',
              borderRadius: '50%',
              background  : i < digits.length ? '#2C2C2A' : '#D9D5CC',
            }} />
          ))}
        </div>

        {error && (
          <p style={{ fontSize: '13px', color: '#E24B4A', marginBottom: '12px' }}>
            {error}
          </p>
        )}

        <div style={{
          display            : 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap                : '12px',
        }}>
          {keys.map((k, i) => {
            if (k === '') return <div key={i} />
            const isBack = k === '⌫'
            return (
              <button
                key={i}
                onClick={() => (isBack ? back() : push(k))}
                disabled={busy}
                style={{
                  padding     : '14px 0',
                  fontSize    : '20px',
                  border      : '1px solid #D9D5CC',
                  borderRadius: '12px',
                  background  : 'white',
                  color       : '#2C2C2A',
                  cursor      : busy ? 'not-allowed' : 'pointer',
                }}
              >
                {k}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
