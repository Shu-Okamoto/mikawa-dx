'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type RoleKey = 'nishi' | 'minami' | 'hq1' | 'hq2' | 'hq3' | 'all'

type Entry = {
  role : RoleKey
  path : string
  label: string
}

// 既ログイン時のデフォルト遷移先（role ごとに 1 つ）
const roleHome: Record<RoleKey, string> = {
  nishi : '/store/nishi',
  minami: '/store/minami',
  hq1   : '/hq',
  hq2   : '/hq',
  hq3   : '/hq',
  all   : '/boss',
}

const entryGroups: { title: string; rows: Entry[][] }[] = [
  {
    title: '在庫発注',
    rows: [[
      { role: 'nishi',  path: '/store/nishi',  label: '西店' },
      { role: 'minami', path: '/store/minami', label: '南店' },
    ]],
  },
  {
    title: '弁当餅注文',
    rows: [[
      { role: 'nishi',  path: '/order/nishi',  label: '西店' },
      { role: 'minami', path: '/order/minami', label: '南店' },
      { role: 'hq1',    path: '/order/honbu',  label: '本部' },
    ]],
  },
  {
    title: '📝 日報',
    rows: [[
      { role: 'nishi',  path: '/nippo/nishi',  label: '西店' },
      { role: 'minami', path: '/nippo/minami', label: '南店' },
    ]],
  },
  {
    title: '週間カレンダー',
    rows: [[
      { role: 'all', path: '/calendar', label: '共通' },
    ]],
  },
  {
    title: '管理',
    rows: [
      [
        { role: 'hq1', path: '/hq', label: '野菜発注調整' },
        { role: 'hq2', path: '/hq', label: '果物発注調整' },
        { role: 'hq3', path: '/hq', label: '菓子類発注調整' },
      ],
      [
        { role: 'all', path: '/boss', label: 'ダッシュボード' },
      ],
    ],
  },
]

export default function HomePage() {
  const router = useRouter()
  const [busy, setBusy]   = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const stored = localStorage.getItem('user')
    if (!token || !stored) return
    try {
      const u = JSON.parse(stored) as { role: RoleKey }
      const dest = roleHome[u.role]
      if (dest) router.push(dest)
    } catch {
      // 壊れた値は無視（ボタンを表示）
    }
  }, [router])

  const login = async (entry: Entry) => {
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
      <div style={{ textAlign: 'center', width: '100%', maxWidth: '420px' }}>

        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🥬</div>
        <h1 style={{ fontSize: '22px', fontWeight: 500, color: '#2C2C2A',
          marginBottom: '8px' }}>
          里の味みかわ
        </h1>
        <p style={{ fontSize: '14px', color: '#888780', marginBottom: '32px' }}>
          業務管理システム
        </p>

        <div style={{
          background  : 'white',
          borderRadius: '16px',
          padding     : '20px',
          boxShadow   : '0 2px 8px rgba(0,0,0,.04)',
          textAlign   : 'left',
        }}>
          <p style={{ fontSize: '13px', color: '#888780', marginBottom: '16px',
            textAlign: 'center' }}>
            入りたい画面を選んでください
          </p>

          {entryGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#888780',
                marginBottom: '6px' }}>{group.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.rows.map((row, rowIdx) => (
                  <div key={rowIdx} style={{ display: 'flex', gap: '8px' }}>
                    {row.map((entry) => {
                      const key = `${entry.role}:${entry.path}`
                      const isBusy = busy === key
                      return (
                        <button
                          key={key}
                          onClick={() => login(entry)}
                          disabled={!!busy}
                          style={{
                            flex        : '1 1 0',
                            minWidth    : '0',
                            padding     : '10px 12px',
                            border      : '1px solid #D9D5CC',
                            borderRadius: '10px',
                            background  : isBusy ? '#EFEAE0' : 'white',
                            color       : '#2C2C2A',
                            fontSize    : '13px',
                            cursor      : busy ? 'not-allowed' : 'pointer',
                            opacity     : busy && !isBusy ? 0.5 : 1,
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
            <p style={{ fontSize: '12px', color: '#E24B4A', marginTop: '12px',
              textAlign: 'center' }}>
              {error}
            </p>
          )}
        </div>

        <p style={{ fontSize: '11px', color: '#A8A69E', marginTop: '24px' }}>
          © 2026 里の味みかわ
        </p>
      </div>
    </div>
  )
}
