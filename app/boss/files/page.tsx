'use client'

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav, Toast, useToast } from '../_shared'

interface FileEntry {
  path      : string
  branch    : string
  size      : number
  uploadedAt: string
  date      : string | null
  linked    : boolean
  sentToFreee: boolean
}

interface FreeeStatus {
  configured  : boolean
  connected   : boolean
  companyId  ?: string | null
  connectedBy?: string | null
  redirectUri?: string | null
}

interface BranchFolder {
  storeCode: string
  storeName: string
  count    : number
}

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`

const DAYS = ['日', '月', '火', '水', '木', '金', '土']

// 表示・月分けに使う日付(日本時間の 'YYYY-MM-DD')。
// パスに入っている日付は既に日本時間基準なのでそのまま使い、
// 読み取れないファイルだけアップロード日時を日本時間に直す。
function jstYmd(f: FileEntry): string {
  if (f.date) return f.date
  return new Date(f.uploadedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
}

// 'YYYY-MM-DD' → '10/9(金)'。Date のローカル解釈を通すと閲覧端末の
// タイムゾーンで 1 日ずれるので、文字列から組み立てて曜日だけ UTC で求める。
function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m}/${d}(${dow})`
}

function monthOf(f: FileEntry): string {
  return jstYmd(f).slice(0, 7)
}

function FilesContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const { toast, showToast } = useToast()
  const [files, setFiles]       = useState<FileEntry[]>([])
  const [folders, setFolders]   = useState<BranchFolder[]>([])
  const [branch, setBranch]     = useState<string | null>(null)
  const [month, setMonth]       = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)
  const [zoom, setZoom]         = useState<FileEntry | null>(null)
  const [freee, setFreee]       = useState<FreeeStatus | null>(null)
  const [sending, setSending]   = useState<string | null>(null)
  const params = useSearchParams()

  const load = useCallback(async () => {
    if (!user) return
    setFetching(true)
    const res  = await authFetch('/api/boss/files')
    const data = await res.json()
    setFetching(false)
    if (!res.ok) { showToast(data.error ?? '取得に失敗しました'); return }
    setFiles(data.files ?? [])
    setFolders(data.branches ?? [])
    setBranch((prev) => prev ?? (data.branches?.[0]?.storeCode ?? null))
  }, [user])

  const loadFreee = useCallback(async () => {
    if (!user) return
    const res  = await authFetch('/api/boss/freee/status')
    if (!res.ok) { setFreee(null); return }
    setFreee(await res.json())
  }, [user])

  useEffect(() => {
    if (!loading && !error) { load(); loadFreee() }
  }, [loading, error, load, loadFreee])

  // 連携のコールバックから戻ってきたときの結果表示
  useEffect(() => {
    const r = params.get('freee')
    if (r === 'connected') showToast('freee と連携しました')
    else if (r === 'error') showToast('freee 連携に失敗しました: ' + (params.get('reason') ?? ''))
  }, [params])

  const connectFreee = async () => {
    const res  = await authFetch('/api/boss/freee/connect', { method: 'POST' })
    const data = await res.json()
    if (!res.ok || !data.url) { showToast(data.error ?? '連携を開始できませんでした'); return }
    window.location.href = data.url
  }

  const disconnectFreee = async () => {
    const res = await authFetch('/api/boss/freee/status', { method: 'DELETE' })
    if (!res.ok) { showToast('連携解除に失敗しました'); return }
    showToast('連携を解除しました')
    loadFreee()
  }

  const sendToFreee = async (file: FileEntry) => {
    setSending(file.path)
    const res  = await authFetch('/api/boss/files/freee', {
      method: 'POST', body: JSON.stringify({ path: file.path }),
    })
    const data = await res.json().catch(() => ({}))
    setSending(null)
    if (!res.ok) { showToast(data.error ?? '送信に失敗しました'); return }
    showToast(data.alreadySent ? '送信済みです' : 'freee に送信しました')
    setFiles((prev) => prev.map((f) =>
      f.path === file.path ? { ...f, sentToFreee: true } : f))
  }

  const inBranch = useMemo(
    () => files.filter((f) => f.branch === branch),
    [files, branch],
  )

  // 月タブ(新しい順)。店舗を切り替えたら先頭の月に寄せる
  const months = useMemo(() => {
    const set = new Set(inBranch.map(monthOf))
    return [...set].sort().reverse()
  }, [inBranch])

  useEffect(() => {
    if (months.length === 0) { setMonth(null); return }
    setMonth((prev) => (prev && months.includes(prev) ? prev : months[0]))
  }, [months])

  const shown = useMemo(
    () => inBranch.filter((f) => monthOf(f) === month),
    [inBranch, month],
  )

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA', minHeight:'100vh', paddingBottom:'24px' }}>

      <BossHeader title="🗂 ファイルボックス" subtitle={user?.name} onLogout={logout} />
      <BossNav active="/boss/files" />

      <FreeeBanner status={freee} onConnect={connectFreee} onDisconnect={disconnectFreee} />

      {/* 店舗フォルダ */}
      <div style={{ background:'white', padding:'12px 16px',
        borderBottom:'1px solid #E5E1D8', display:'flex', gap:'8px', overflowX:'auto' }}>
        {folders.map((f) => {
          const on = f.storeCode === branch
          return (
            <button key={f.storeCode} onClick={() => setBranch(f.storeCode)}
              style={{ padding:'10px 16px', border:'none', cursor:'pointer',
                background: on ? '#3B6D11' : '#F5F1EA',
                color     : on ? 'white'   : '#2C2C2A',
                borderRadius:'10px', fontSize:'15px', whiteSpace:'nowrap',
                fontFamily:'inherit', fontWeight: on ? 500 : 400 }}>
              📁 {f.storeName}
              <span style={{ fontSize:'12px', marginLeft:'6px', opacity:.75 }}>
                {f.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* 月タブ */}
      {months.length > 0 && (
        <div style={{ padding:'10px 12px 0', display:'flex', gap:'6px', overflowX:'auto' }}>
          {months.map((m) => {
            const on = m === month
            const [y, mm] = m.split('-')
            return (
              <button key={m} onClick={() => setMonth(m)}
                style={{ padding:'7px 13px', cursor:'pointer',
                  background: on ? '#2C2C2A' : 'white',
                  color     : on ? 'white'   : '#888780',
                  border:'1.5px solid ' + (on ? '#2C2C2A' : '#E5E1D8'),
                  borderRadius:'20px', fontSize:'13px', whiteSpace:'nowrap',
                  fontFamily:'inherit' }}>
                {y}年{Number(mm)}月
              </button>
            )
          })}
        </div>
      )}

      <div style={{ padding:'12px' }}>
        {fetching ? (
          <Empty text="読み込み中..." />
        ) : shown.length === 0 ? (
          <Empty text="この月のレシート画像はありません" />
        ) : (
          <>
            <div style={{ fontSize:'13px', color:'#888780', padding:'0 4px 8px' }}>
              {shown.length}件
            </div>
            <div style={{ display:'grid',
              gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:'10px' }}>
              {shown.map((f) => (
                <FileCard key={f.path} file={f} authFetch={authFetch}
                  onOpen={() => setZoom(f)}
                  canSend={!!freee?.connected}
                  sending={sending === f.path}
                  onSend={() => sendToFreee(f)} />
              ))}
            </div>
          </>
        )}
      </div>

      {zoom && (
        <Lightbox file={zoom} authFetch={authFetch} onClose={() => setZoom(null)} />
      )}

      <Toast text={toast} />
    </div>
  )
}

// private blob なので認証付きで取得して objectURL 化する。
// 画面に入ったものだけ読み込む(月に数十件あってもまとめて取りに行かない)。
function useReceiptObjectUrl(path: string, authFetch: AuthFetch, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let objectUrl: string | null = null
    authFetch(`/api/sales/receipt?path=${encodeURIComponent(path)}`)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled) return
        if (!blob) { setFailed(true); return }
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, authFetch, enabled])

  return { url, failed }
}

function FileCard({ file, authFetch, onOpen, canSend, sending, onSend }: {
  file: FileEntry
  authFetch: AuthFetch
  onOpen: () => void
  canSend: boolean
  sending: boolean
  onSend: () => void
}) {
  const { url, failed } = useReceiptObjectUrl(file.path, authFetch, true)

  return (
    <div style={{ background:'white', borderRadius:'12px', overflow:'hidden',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)' }}>
      <button onClick={onOpen}
        style={{ display:'block', width:'100%', aspectRatio:'1 / 1',
          border:'none', padding:0, cursor:'pointer', background:'#F5F1EA' }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${fmtDate(jstYmd(file))} のレシート`}
            style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        ) : (
          <div style={{ width:'100%', height:'100%', display:'flex',
            alignItems:'center', justifyContent:'center',
            fontSize:'12px', color:'#B4B2A9' }}>
            {failed ? '表示できません' : '読込中'}
          </div>
        )}
      </button>
      <div style={{ padding:'8px 10px' }}>
        <div style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A' }}>
          {fmtDate(jstYmd(file))}
        </div>
        <div style={{ fontSize:'11px', color:'#888780', marginTop:'2px' }}>
          {fmtSize(file.size)}
          {!file.linked && (
            <span style={{ marginLeft:'6px', color:'#E67E22' }}>未紐づけ</span>
          )}
        </div>

        {file.sentToFreee ? (
          <div style={{ marginTop:'6px', fontSize:'11px', color:'#3B6D11' }}>
            ✓ freee 送信済み
          </div>
        ) : canSend ? (
          <button onClick={onSend} disabled={sending}
            style={{ marginTop:'6px', width:'100%', padding:'6px',
              background: sending ? '#E5E1D8' : 'white', color:'#2C2C2A',
              border:'1.5px solid #E5E1D8', borderRadius:'8px',
              fontSize:'12px', cursor: sending ? 'default' : 'pointer',
              fontFamily:'inherit' }}>
            {sending ? '送信中...' : 'freee へ送る'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Lightbox({ file, authFetch, onClose }: {
  file: FileEntry
  authFetch: AuthFetch
  onClose: () => void
}) {
  const { url, failed } = useReceiptObjectUrl(file.path, authFetch, true)

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:200,
        display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', padding:'16px' }}>
      <div style={{ color:'white', fontSize:'15px', marginBottom:'10px' }}>
        {fmtDate(jstYmd(file))} / {fmtSize(file.size)}
      </div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="レシート画像" onClick={(e) => e.stopPropagation()}
          style={{ maxWidth:'100%', maxHeight:'72vh', objectFit:'contain',
            borderRadius:'8px', background:'white' }} />
      ) : (
        <div style={{ color:'white', fontSize:'14px' }}>
          {failed ? '表示できませんでした' : '読み込み中...'}
        </div>
      )}
      <div style={{ display:'flex', gap:'10px', marginTop:'14px' }}
        onClick={(e) => e.stopPropagation()}>
        {url && (
          <a href={url} download={file.path.split('/').pop()}
            style={{ padding:'10px 18px', background:'white', color:'#2C2C2A',
              borderRadius:'10px', fontSize:'15px', textDecoration:'none' }}>
            ⬇ 保存
          </a>
        )}
        <button onClick={onClose}
          style={{ padding:'10px 18px', background:'rgba(255,255,255,.2)',
            color:'white', border:'1.5px solid rgba(255,255,255,.6)',
            borderRadius:'10px', fontSize:'15px', cursor:'pointer',
            fontFamily:'inherit' }}>
          閉じる
        </button>
      </div>
    </div>
  )
}

// freee 連携の状態と操作。未設定(環境変数が無い)ときは何も出さない。
function FreeeBanner({ status, onConnect, onDisconnect }: {
  status: FreeeStatus | null
  onConnect: () => void
  onDisconnect: () => void
}) {
  if (!status || !status.configured) return null

  return (
    <div style={{ margin:'12px 12px 0', padding:'12px 14px', background:'white',
      borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,.04)',
      display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'14px', fontWeight:500, color:'#2C2C2A' }}>
          freee 会計 ファイルボックス
        </div>
        <div style={{ fontSize:'12px', color: status.connected ? '#3B6D11' : '#888780',
          marginTop:'2px' }}>
          {status.connected
            ? `連携中${status.companyId ? `（事業所 ${status.companyId}）` : ''}`
            : '未連携 — 連携するとレシートを freee に送れます'}
        </div>
      </div>
      {status.connected ? (
        <button onClick={onDisconnect}
          style={{ padding:'8px 14px', background:'white', color:'#E24B4A',
            border:'1.5px solid #F3C6C4', borderRadius:'10px',
            fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
          連携を解除
        </button>
      ) : (
        <button onClick={onConnect}
          style={{ padding:'8px 16px', background:'#3B6D11', color:'white',
            border:'none', borderRadius:'10px', fontSize:'14px',
            cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
          freee と連携
        </button>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ background:'white', borderRadius:'16px', padding:'32px',
      textAlign:'center', color:'#888780', fontSize:'14px' }}>
      {text}
    </div>
  )
}

function Loading() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh',
      fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      読み込み中...
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#F5F1EA',
      fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', maxWidth:'320px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🚫</div>
        <p style={{ fontSize:'16px', fontWeight:500, color:'#E24B4A' }}>{msg}</p>
      </div>
    </div>
  )
}

export default function FilesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FilesContent />
    </Suspense>
  )
}
