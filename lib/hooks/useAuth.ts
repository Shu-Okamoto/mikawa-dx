'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AuthUser,
  clearStoredAuth,
  getStoredAuth,
  isTokenExpired,
  setStoredAuth,
} from '@/lib/auth-client'

export type { AuthUser }

interface UseAuthOptions {
  // 許可するロール一覧。未指定 = 認証だけ要求(ロール問わず)。
  roles?: string[]
  // 未ログイン時に自動でこのロールで /api/auth/role を叩く。
  autoLoginRole?: string
}

// 旧 API との後方互換用に string | string[] | options も受け付ける。
type UseAuthArg = string | string[] | UseAuthOptions | undefined

function normalize(arg: UseAuthArg, legacyOptions?: { autoLoginRole?: string }): UseAuthOptions {
  if (arg == null) return { autoLoginRole: legacyOptions?.autoLoginRole }
  if (typeof arg === 'string') return { roles: [arg], autoLoginRole: legacyOptions?.autoLoginRole }
  if (Array.isArray(arg))      return { roles: arg,   autoLoginRole: legacyOptions?.autoLoginRole }
  return arg
}

export function useAuth(arg?: UseAuthArg, legacyOptions?: { autoLoginRole?: string }) {
  const { roles, autoLoginRole } = normalize(arg, legacyOptions)

  const router       = useRouter()
  const searchParams = useSearchParams()

  const [user,    setUser]    = useState<AuthUser | null>(null)
  const [token,   setToken]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // 配列を安定したキーに(useEffect 依存に配列そのものを置くと毎回違う参照になる)
  const rolesKey = roles ? roles.join(',') : ''

  useEffect(() => {
    let cancelled = false

    const isAllowed = (role: string) => !roles || roles.length === 0 || roles.includes(role)

    const finishWithError = (msg: string) => {
      if (cancelled) return
      setError(msg)
      setLoading(false)
    }

    const finishWithUser = (t: string, u: AuthUser) => {
      if (cancelled) return
      setStoredAuth(t, u)
      setToken(t)
      setUser(u)
      setLoading(false)
    }

    const callRoleLogin = async (role: string) => {
      try {
        const res  = await fetch('/api/auth/role', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ role }),
        })
        const data = await res.json()
        if (!data.token) {
          finishWithError(data.error || '自動ログインに失敗しました')
          return
        }
        finishWithUser(data.token, data.user)
      } catch {
        finishWithError('サーバーエラーが発生しました')
      }
    }

    const callLineLogin = async (lineUserId: string) => {
      try {
        const res  = await fetch('/api/line', {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ lineUserId }),
        })
        const data = await res.json()
        if (!data.token) {
          finishWithError(data.error || '認証に失敗しました')
          return
        }
        if (!isAllowed(data.user.role)) {
          finishWithError('この画面へのアクセス権限がありません')
          return
        }
        finishWithUser(data.token, data.user)
        // URL から lineUserId を取り除く(他のクエリは保持)
        const params = new URLSearchParams(window.location.search)
        params.delete('lineUserId')
        const qs = params.toString()
        router.replace(window.location.pathname + (qs ? `?${qs}` : ''))
      } catch {
        finishWithError('サーバーエラーが発生しました')
      }
    }

    // 1. URLに lineUserId があれば LINE 経由のログインを優先
    const lineUserId = searchParams.get('lineUserId')
    if (lineUserId) {
      callLineLogin(lineUserId)
      return () => { cancelled = true }
    }

    // 2. localStorage に有効なトークンがあれば使う
    const stored = getStoredAuth()
    if (stored && !isTokenExpired(stored.token)) {
      if (!isAllowed(stored.user.role)) {
        // ロールが合わない: autoLoginRole があれば再ログイン
        if (autoLoginRole) {
          callRoleLogin(autoLoginRole)
          return () => { cancelled = true }
        }
        finishWithError('この画面へのアクセス権限がありません')
        return () => { cancelled = true }
      }
      if (!cancelled) {
        setToken(stored.token)
        setUser(stored.user)
        setLoading(false)
      }
      return () => { cancelled = true }
    }

    // 3. トークン無し or 期限切れ。autoLoginRole があれば自動ログイン。
    if (stored) clearStoredAuth()  // 期限切れトークンは掃除
    if (autoLoginRole) {
      callRoleLogin(autoLoginRole)
      return () => { cancelled = true }
    }

    // 4. それも無いなら入り口画面へ
    router.push('/')
    return () => { cancelled = true }
    // searchParams / router を依存に入れると意図しない再実行が起きるので除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesKey, autoLoginRole])

  // 認証付き fetch。401 は JWT が本当に期限切れの時だけログアウト扱い。
  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const stored = getStoredAuth()
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${stored?.token ?? ''}`,
        ...(options.headers || {}),
      },
    })
    if (res.status === 401 && (!stored || isTokenExpired(stored.token))) {
      clearStoredAuth()
      router.push('/')
    }
    return res
  }, [router])

  const logout = useCallback(() => {
    clearStoredAuth()
    router.push('/')
  }, [router])

  return { user, token, loading, error, authFetch, logout }
}
