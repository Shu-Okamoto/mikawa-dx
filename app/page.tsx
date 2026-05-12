'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // 既にログイン済みの場合は該当画面へ
    const token = localStorage.getItem('token')
    const user  = localStorage.getItem('user')

    if (token && user) {
      const parsedUser = JSON.parse(user)
      const role = parsedUser.role
      if (role === 'store')         router.push('/store')
      else if (role === 'hq')       router.push('/hq')
      else if (role === 'boss')     router.push('/boss')
      else if (role === 'order')    router.push('/order')
      else if (role === 'calendar') router.push('/calendar')
    }
  }, [router])

  return (
    <div style={{
      minHeight      : '100vh',
      display        : 'flex',
      alignItems     : 'center',
      justifyContent : 'center',
      background     : '#F5F1EA',
      fontFamily     : '-apple-system,sans-serif',
    }}>
      <div style={{ textAlign:'center', padding:'40px 20px' }}>

        {/* ロゴ */}
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🥬</div>
        <h1 style={{ fontSize:'22px', fontWeight:500, color:'#2C2C2A',
          marginBottom:'8px' }}>
          里の味みかわ
        </h1>
        <p style={{ fontSize:'14px', color:'#888780', marginBottom:'40px' }}>
          業務管理システム
        </p>

        {/* 案内 */}
        <div style={{ background:'white', borderRadius:'16px', padding:'24px',
          maxWidth:'320px', margin:'0 auto',
          boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>💬</div>
          <p style={{ fontSize:'14px', color:'#2C2C2A', fontWeight:500,
            marginBottom:'8px' }}>
            LINEからアクセスしてください
          </p>
          <p style={{ fontSize:'12px', color:'#888780', lineHeight:1.6 }}>
            公式LINEアカウントで<br />
            「ログイン」と送信すると<br />
            専用URLが届きます
          </p>
        </div>

        <p style={{ fontSize:'11px', color:'#A8A69E', marginTop:'32px' }}>
          © 2026 里の味みかわ
        </p>
      </div>
    </div>
  )
}
