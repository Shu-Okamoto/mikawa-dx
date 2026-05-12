'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LineAuthContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus]   = useState<'loading' | 'error'>('loading')
  const [message, setMessage] = useState('認証中...')

  useEffect(() => {
    const uid = searchParams.get('uid')
    if (!uid) {
      setStatus('error')
      setMessage('認証情報が不正です')
      return
    }

    fetch('/api/auth/line', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ lineUserId: uid }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.token) {
          localStorage.setItem('token', data.token)
          localStorage.setItem('user', JSON.stringify(data.user))
          const role = data.user.role
          if (role === 'store')         router.push('/store')
          else if (role === 'hq')       router.push('/hq')
          else if (role === 'boss')     router.push('/boss')
          else if (role === 'order')    router.push('/order')
          else if (role === 'calendar') router.push('/calendar')
          else {
            setStatus('error')
            setMessage('権限がありません')
          }
        } else {
          setStatus('error')
          setMessage(data.error || '認証に失敗しました')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('サーバーエラーが発生しました')
      })
  }, [searchParams, router])

  return (
    <div style={{
      minHeight     : '100vh',
      display       : 'flex',
      alignItems    : 'center',
      justifyContent: 'center',
      background    : '#F5F1EA',
      fontFamily    : '-apple-system, sans-serif',
    }}>
      <div style={{
        background  : 'white',
        borderRadius: '16px',
        padding     : '40px',
        textAlign   : 'center',
        maxWidth    : '320px',
        width       : '100%',
      }}>
        {status === 'loading' ? (
          <>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
            <p style={{ color: '#2C2C2A', fontSize: '16px' }}>{message}</p>
            <p style={{ color: '#888780', fontSize: '13px', marginTop: '8px' }}>
              しばらくお待ちください
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>❌</div>
            <p style={{ color: '#E24B4A', fontSize: '16px' }}>{message}</p>
            <p style={{ color: '#888780', fontSize: '13px', marginTop: '8px' }}>
              LINEで「登録」と送信して管理者に連絡してください
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function LineAuthPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <LineAuthContent />
    </Suspense>
  )
}
