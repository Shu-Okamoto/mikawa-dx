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

export function useAuth(requiredRole?: string) {
  const router                = useRouter()
  const searchParams          = useSearchParams()
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const lineUserId  = searchParams.get('lineUserId')
    const storedToken = localStorage.getItem('token')
    const storedUser  = localStorage.getItem('user')

    // LINE IDがURLにある場合はAPI認証
    if (lineUserId) {
      fetch('/api/auth/line', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ lineUserId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.token) {
            // role確認
            if (requiredRole && data.user.role !== requiredRole) {
              setError('この画面へのアクセス権限がありません')
              setLoading(false)
              return
            }
            localStorage.setItem('token', data.token)
            localStorage.setItem('user', JSON.stringify(data.user))
            setToken(data.token)
            setUser(data.user)
            setLoading(false)
            // URLからlineUserIdを除去
            router.replace(window.location.pathname)
          } else {
            setError(data.error || '認証に失敗しました')
            setLoading(false)
          }
        })
        .catch(() => {
          setError('サーバーエラーが発生しました')
          setLoading(false)
        })
      return
    }

    // 既存のJWTがある場合
    if (storedToken && storedUser) {
      const parsedUser = JSON.parse(storedUser) as AuthUser
      if (requiredRole && parsedUser.role !== requiredRole) {
        setError('この画面へのアクセス権限がありません')
        setLoading(false)
        return
      }
      setToken(storedToken)
      setUser(parsedUser)
      setLoading(false)
      return
    }

    // 未認証
    router.push('/')
  }, [])

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