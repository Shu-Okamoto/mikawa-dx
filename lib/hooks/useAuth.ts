'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface AuthUser {
  id       : number
  name     : string
  role     : string
  store    : string
  storeName: string
  category : string
}

export function useAuth(requiredRole?: string | string[]) {
  const router                = useRouter()
  const searchParams          = useSearchParams()
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const allowedKey = Array.isArray(requiredRole)
    ? requiredRole.join(',')
    : (requiredRole ?? '')

  useEffect(() => {
    const lineUserId  = searchParams.get('lineUserId')
    const storedToken = localStorage.getItem('token')
    const storedUser  = localStorage.getItem('user')

    const checkRole = (role: string): boolean => {
      if (!requiredRole) return true
      const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
      return allowed.includes(role)
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
        setError('この画面へのアクセス権限がありません')
        setLoading(false)
        return
      }
      setToken(storedToken)
      setUser(parsedUser)
      setLoading(false)
      return
    }

    router.push('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedKey])

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const storedToken = localStorage.getItem('token')
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Bearer ${storedToken}`,
        ...(options.headers || {}),
      },
    })
    if (res.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      router.push('/')
    }
    return res
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  return { user, token, loading, error, authFetch, logout }
}
