'use client'

import { useState } from 'react'

export function BossHeader({
  title,
  subtitle,
  onLogout,
}: {
  title   : string
  subtitle?: string
  onLogout: () => void
}) {
  return (
    <div style={{ background:'linear-gradient(135deg,#2C2C2A,#444441)',
      color:'white', padding:'20px 16px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center' }}>
        <div>
          <div style={{ fontSize:'13px', opacity:.8 }}>管理</div>
          <div style={{ fontSize:'24px', fontWeight:500 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize:'14px', opacity:.7, marginTop:'2px' }}>{subtitle}</div>
          )}
        </div>
        <button onClick={onLogout}
          style={{ padding:'10px 16px', background:'rgba(255,255,255,.2)',
            border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
            color:'white', fontSize:'15px', cursor:'pointer',
            fontFamily:'inherit' }}>
          終了する
        </button>
      </div>
    </div>
  )
}

const NAV_ITEMS = [
  { href: '/boss',                 label: '📊 ダッシュボード' },
  { href: '/boss/analytics',       label: '📈 売上分析' },
  { href: '/boss/analytics/labor', label: '⏱ 人時売' },
  { href: '/boss/users',           label: '👥 ユーザー' },
  { href: '/boss/products',        label: '🥬 商品' },
  { href: '/boss/order-products',  label: '🍱 オリジナル商品' },
  { href: '/boss/vendors',         label: '🏢 仕入先' },
  { href: '/boss/import',          label: '📥 インポート' },
]

export function BossNav({ active }: { active: string }) {
  return (
    <div style={{ background:'white', padding:'12px 16px',
      borderBottom:'1px solid #E5E1D8',
      display:'flex', gap:'8px', overflowX:'auto' }}>
      {NAV_ITEMS.map((n) => {
        const isCurrent = n.href === active
        return (
          <a key={n.href} href={n.href}
            style={{ padding:'10px 16px',
              background: isCurrent ? '#3B6D11' : '#F5F1EA',
              color     : isCurrent ? 'white'   : '#2C2C2A',
              borderRadius:'10px', fontSize:'15px',
              textDecoration:'none', whiteSpace:'nowrap',
              fontFamily:'inherit', fontWeight: isCurrent ? 500 : 400 }}>
            {n.label}
          </a>
        )
      })}
    </div>
  )
}

export function Toast({ text }: { text: string }) {
  if (!text) return null
  return (
    <div style={{ position:'fixed', bottom:'24px', left:'50%',
      transform:'translateX(-50%)',
      background:'rgba(44,44,42,.9)', color:'white',
      padding:'12px 22px', borderRadius:'20px', fontSize:'15px',
      zIndex:100, whiteSpace:'nowrap' }}>
      {text}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }
  return { toast, showToast }
}

export function inputStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    width:'100%', padding:'10px 12px',
    border:'1.5px solid #E5E1D8', borderRadius:'8px',
    fontSize:'15px', fontFamily:'inherit',
    boxSizing:'border-box',
    ...extra,
  }
}
