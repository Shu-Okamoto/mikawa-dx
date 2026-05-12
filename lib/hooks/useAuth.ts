'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser  = localStorage.getItem('user')

    if (!storedToken || !storedUser) {
      router.push('/auth/line')
      return
    }

    const parsedUser = JSON.parse(storedUser) as AuthUser

    if (requiredRole && parsedUser.role !== requiredRole) {
      router.push('/auth/line')
      return
    }

    setToken(storedToken)
    setUser(parsedUser)
    setLoading(false)
  }, [router, requiredRole])

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
      router.push('/auth/line')
    }
    return res
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/auth/line')
  }

  return { user, token, loading, authFetch, logout }
}
