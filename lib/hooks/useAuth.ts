'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface AuthUser {
  id       : number
  name     : string
  role     : string
  store    : string
  storeName: string
  category : string
}

function isTokenExpired(token: string | null): boolean {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number }
    if (typeof payload.exp !== 'number') return false
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export function useAuth(
  requiredRole?: string | string[],
  options?: { autoLoginRole?: string },
) {
  const router                = useRouter()
  const searchParams          = useSearchParams()
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const allowedKey = Array.isArray(requiredRole)
    ? requiredRole.join(',')
    : (requiredRole ?? '')
  const autoLoginRole = options?.autoLoginRole ?? ''

  useEffect(() => {
    const lineUserId  = searchParams.get('lineUserId')
    const storedToken = localStorage.getItem('token')
    const storedUser  = localStorage.getItem('user')

    const checkRole = (role: string): boolean => {
      if (!requiredRole) return true
      const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
      return allowed.includes(role)
    }

    const doAutoLogin = (role: string) => {
      fetch('/api/auth/role', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ role }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.token) {
            setError(data.error || '自動ログインに失敗しました')
            setLoading(false)
            return
          }
          localStorage.setItem('token', data.token)
          localStorage.setItem('user',  JSON.stringify(data.user))
          setToken(data.token)
          setUser(data.user)
          setLoading(false)
        })
        .catch(() => {
          setError('サーバーエラーが発生しました')
          setLoading(false)
        })
    }

    if (lineUserId) {
      fetch('/api/line', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ lineUserId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.token) {
            setError(data.error || '認証に失敗しました')
            setLoading(false)
            return
          }
          if (!checkRole(data.user.role)) {
            setError('この画面へのアクセス権限がありません')
            setLoading(false)
            return
          }
          localStorage.setItem('token', data.token)
          localStorage.setItem('user', JSON.stringify(data.user))
          setToken(data.token)
          setUser(data.user)
          setLoading(false)
          // URL から lineUserId を取り除く（他のクエリは保持）
          const params = new URLSearchParams(window.location.search)
          params.delete('lineUserId')
          const qs = params.toString()
          router.replace(window.location.pathname + (qs ? `?${qs}` : ''))
        })
        .catch(() => {
          setError('サーバーエラーが発生しました')
          setLoading(false)
        })
      return
    }

    if (storedToken && storedUser) {
      const parsedUser = JSON.parse(storedUser) as AuthUser
      if (!checkRole(parsedUser.role)) {
        // ロールが合わない: autoLoginRole が指定されていれば自動で再ログイン
        if (autoLoginRole) {
          doAutoLogin(autoLoginRole)
          return
        }
        setError('この画面へのアクセス権限がありません')
        setLoading(false)
        return
      }
      setToken(storedToken)
      setUser(parsedUser)
      setLoading(false)
      return
    }

    // 未ログイン: autoLoginRole が指定されていれば自動ログイン、なければ入り口へ
    if (autoLoginRole) {
      doAutoLogin(autoLoginRole)
      return
    }

    router.push('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKey, autoLoginRole])

  // 参照を毎レンダー安定化させる。これがないと呼び出し側の useEffect 依存が
  // 毎レンダー変化し、fetch が再発火して直前の入力状態が上書きされる。
  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const storedToken = localStorage.getItem('token')
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${storedToken}`,
        ...(options.headers || {}),
      },
    })
    // 401 はトークンが本当に期限切れ/不正な場合のみログアウト扱いにする。
    // 期限内なら一時的なサーバーエラーの可能性が高いので localStorage は消さない。
    if (res.status === 401 && isTokenExpired(storedToken)) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      router.push('/')
    }
    return res
  }, [router])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }, [router])

  return { user, token, loading, error, authFetch, logout }
}
