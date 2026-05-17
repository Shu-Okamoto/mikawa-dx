'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type RoleKey = 'nishi' | 'minami' | 'hq1' | 'hq2' | 'hq3' | 'all'

const roleHome: Record<RoleKey, string> = {
  nishi : '/store/nishi',
  minami: '/store/minami',
  hq1   : '/hq',
  hq2   : '/hq',
  hq3   : '/hq',
  all   : '/boss',
}

const roleGroups: { title: string; options: { role: RoleKey; label: string }[] }[] = [
  {
    title: '店舗',
    options: [
      { role: 'nishi',  label: '西店' },
      { role: 'minami', label: '南店' },
    ],
  },
  {
    title: '本部',
    options: [
      { role: 'hq1', label: '野菜担当' },
      { role: 'hq2', label: '果物担当' },
      { role: 'hq3', label: '餅・乾物担当' },
    ],
  },
  {
    title: 'オーナー',
    options: [
      { role: 'all', label: '全権限' },
    ],
  },
]

export default function HomePage() {
  const router = useRouter()
  const [busy, setBusy]   = useState<RoleKey | null>(null)
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

  const login = async (role: RoleKey) => {
    setBusy(role)
    setError(null)
    try {
      const res = await fetch('/api/auth/role', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ role }),
      })
      const data = await res.json()
      if (!res.ok || !data.token) {
        setError(data.error || 'ログインに失敗しました')
        setBusy(null)
        return
      }
      localStorage.setItem('token', data.token)
      localStorage.setItem('user',  JSON.stringify(data.user))
      router.push(roleHome[role])
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
      fontFamily    : '-apple-system,sans-serif',
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
            ログインする役割を選んでください
          </p>

          {roleGroups.map((group) => (
            <div key={group.title} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#888780',
                marginBottom: '6px' }}>{group.title}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {group.options.map((opt) => {
                  const isBusy = busy === opt.role
                  return (
                    <button
                      key={opt.role}
                      onClick={() => login(opt.role)}
                      disabled={!!busy}
                      style={{
                        flex        : '1 1 auto',
                        minWidth    : '88px',
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
                      {isBusy ? '...' : opt.label}
                    </button>
                  )
                })}
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
