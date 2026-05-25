'use client'

import { useEffect, useState, useCallback, Suspense, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { themeForBranch } from '@/lib/storeColors'

type Weather = 'sunny' | 'cloudy' | 'rainy' | 'snowy'

interface Store {
  id  : number
  name: string
  slug: string
}

interface ReportState {
  weather       : Weather | null
  salesForecast : string  // input string
  salesActual   : string
  customerCount : string
  sozaiZan      : string
  mochiZan      : string
  reportText    : string
  kizuki        : string
  bikou         : string
}

const EMPTY_REPORT: ReportState = {
  weather: null,
  salesForecast: '', salesActual: '', customerCount: '',
  sozaiZan: '', mochiZan: '',
  reportText: '', kizuki: '', bikou: '',
}

const VALID_BRANCHES = new Set(['nishi', 'minami'])
const BRANCH_LABEL: Record<string, string> = { nishi: '西店', minami: '南店' }

const WEATHER_OPTIONS: { value: Weather; icon: string; label: string }[] = [
  { value: 'sunny',  icon: '☀️', label: '晴' },
  { value: 'cloudy', icon: '☁️', label: '曇' },
  { value: 'rainy',  icon: '☂️', label: '雨' },
  { value: 'snowy',  icon: '❄️', label: '雪' },
]

function NippoContent({ branch }: { branch: string }) {
  const router = useRouter()
  const { user, loading, error, authFetch, logout } = useAuth(
    ['nishi', 'minami', 'all'],
    { autoLoginRole: VALID_BRANCHES.has(branch) ? branch : undefined },
  )

  const [store, setStore]       = useState<Store | null>(null)
  const [report, setReport]     = useState<ReportState>(EMPTY_REPORT)
  const [savedAt, setSavedAt]   = useState<string | null>(null)
  const [dirty, setDirty]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [fetching, setFetching] = useState(true)
  const [toast, setToast]       = useState('')

  const theme = themeForBranch(branch)
  const branchLabel = BRANCH_LABEL[branch] ?? branch

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fetchData = useCallback(async () => {
    if (!user) return
    setFetching(true)
    const res  = await authFetch(`/api/nippo/today/${branch}`)
    const data = await res.json()
    setFetching(false)
    if (!res.ok) { showToast('読み込みエラー: ' + (data.error ?? '不明')); return }

    setStore(data.store)
    if (data.report) {
      setReport({
        weather       : data.report.weather,
        salesForecast : data.report.sales_forecast == null ? '' : String(data.report.sales_forecast),
        salesActual   : data.report.sales_actual   == null ? '' : String(data.report.sales_actual),
        customerCount : data.report.customer_count == null ? '' : String(data.report.customer_count),
        sozaiZan      : data.report.sozai_zan      == null ? '' : String(data.report.sozai_zan),
        mochiZan      : data.report.mochi_zan      == null ? '' : String(data.report.mochi_zan),
        reportText    : data.report.report_text || '',
        kizuki        : data.report.kizuki        || '',
        bikou         : data.report.bikou         || '',
      })
      if (data.report.updated_at) {
        const d = new Date(data.report.updated_at)
        setSavedAt(d.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }))
      }
    }
    setDirty(false)
  }, [user, branch, authFetch])

  useEffect(() => {
    if (!loading && !error) fetchData()
  }, [loading, error, fetchData])

  // 不正な branch チェック
  useEffect(() => {
    if (!VALID_BRANCHES.has(branch)) router.replace('/')
  }, [branch, router])

  const update = <K extends keyof ReportState>(key: K, v: ReportState[K]) => {
    setReport((prev) => ({ ...prev, [key]: v }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    const toIntOrNull = (s: string) => {
      const n = parseInt(s, 10)
      return Number.isFinite(n) ? n : null
    }
    const payload = {
      weather       : report.weather,
      salesForecast : toIntOrNull(report.salesForecast),
      salesActual   : toIntOrNull(report.salesActual),
      customerCount : toIntOrNull(report.customerCount),
      sozaiZan      : toIntOrNull(report.sozaiZan),
      mochiZan      : toIntOrNull(report.mochiZan),
      reportText    : report.reportText,
      kizuki        : report.kizuki,
      bikou         : report.bikou,
    }
    const res  = await authFetch(`/api/nippo/today/${branch}`, {
      method: 'POST',
      body  : JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!data.success) { showToast('保存エラー: ' + (data.error ?? '不明')); return }
    setDirty(false)
    setSavedAt(new Date().toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }))
    showToast('保存しました')
  }

  // 客単価計算
  const customerCountNum = parseInt(report.customerCount, 10)
  const salesActualNum   = parseInt(report.salesActual, 10)
  const tanka = customerCountNum > 0 && salesActualNum > 0
    ? Math.round(salesActualNum / customerCountNum)
    : null

  if (loading) return <Loading />
  if (error)   return <ErrorBox msg={error} onTop={() => router.push('/')} />

  const today = new Date()
  const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`
  const dowName = ['日','月','火','水','木','金','土'][today.getDay()]

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA', minHeight:'100vh', paddingBottom:'90px', color:'#2C2C2A' }}>

      {/* ヘッダー */}
      <div style={{ background:`linear-gradient(135deg,${theme.from},${theme.to})`,
        color:'white', padding:'20px 16px 16px',
        position:'sticky', top:0, zIndex:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:'13px', opacity:.85, marginBottom:'2px' }}>📝 日報入力</div>
            <div style={{ fontSize:'22px', fontWeight:500 }}>
              {store?.name ?? branchLabel}
            </div>
            <div style={{ fontSize:'13px', opacity:.9, marginTop:'2px' }}>
              {dateStr}({dowName}){user?.name ? ` · ${user.name}` : ''}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            {dirty && (
              <span style={{ padding:'4px 10px', background:'rgba(255,255,255,.25)',
                borderRadius:'10px', fontSize:'12px', fontWeight:500 }}>未保存</span>
            )}
            <button onClick={logout}
              style={{ padding:'8px 14px', background:'rgba(255,255,255,.2)',
                border:'1.5px solid rgba(255,255,255,.6)', borderRadius:'10px',
                color:'white', fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
              終了する
            </button>
          </div>
        </div>
      </div>

      {fetching ? (
        <div style={{ padding:'40px', textAlign:'center', color:'#888780' }}>読み込み中...</div>
      ) : (
      <div style={{ padding:'12px' }}>

        {/* ひとこと（日報本文） */}
        <Card title="📝 ひとこと">
          <textarea value={report.reportText}
            onChange={(e) => update('reportText', e.target.value)}
            rows={3}
            placeholder="本日のひとこと"
            style={textareaStyle} />
        </Card>

        {/* 天気 */}
        <Card title="🌤 天気">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
            {WEATHER_OPTIONS.map((w) => {
              const on = report.weather === w.value
              return (
                <button key={w.value}
                  onClick={() => update('weather', on ? null : w.value)}
                  style={{
                    padding:'12px 8px',
                    border: on ? `2px solid ${theme.accent}` : '1.5px solid #E5E1D8',
                    background: on ? theme.bg : 'white',
                    color: on ? theme.text : '#2C2C2A',
                    borderRadius:'10px', fontSize:'14px', fontWeight:500,
                    cursor:'pointer', fontFamily:'inherit',
                  }}>
                  <div style={{ fontSize:'24px' }}>{w.icon}</div>
                  <div>{w.label}</div>
                </button>
              )
            })}
          </div>
        </Card>

        {/* 売上 */}
        <Card title="💰 売上">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            <NumField label="売上予測（前年）" unit="円"
              value={report.salesForecast}
              onChange={(v) => update('salesForecast', v)} />
            <NumField label="売上実績" unit="円"
              value={report.salesActual}
              onChange={(v) => update('salesActual', v)} />
            <NumField label="客数" unit="人"
              value={report.customerCount}
              onChange={(v) => update('customerCount', v)} />
            <NumField label="客単価" unit="円"
              value={tanka != null ? tanka.toLocaleString('ja-JP') : '—'}
              onChange={() => {}} readOnly />
          </div>
        </Card>

        {/* 残数 */}
        <Card title="📦 残数（14時時点）">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            <NumField label="惣菜残" unit="点"
              value={report.sozaiZan}
              onChange={(v) => update('sozaiZan', v)} />
            <NumField label="餅残" unit="点"
              value={report.mochiZan}
              onChange={(v) => update('mochiZan', v)} />
          </div>
        </Card>

        {/* 気づき */}
        <Card title="💡 気づき">
          <textarea value={report.kizuki}
            onChange={(e) => update('kizuki', e.target.value)}
            rows={3}
            placeholder="気づいたこと"
            style={textareaStyle} />
        </Card>

        {/* 備考 */}
        <Card title="🗒 備考">
          <textarea value={report.bikou}
            onChange={(e) => update('bikou', e.target.value)}
            rows={3}
            placeholder="その他メモ"
            style={textareaStyle} />
        </Card>
      </div>
      )}

      {/* 保存ボタン（固定フッター） */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0,
        padding:'12px 16px 20px', background:'white',
        borderTop:'1px solid #E5E1D8', zIndex:10,
        display:'flex', alignItems:'center', gap:'12px' }}>
        <div style={{ flex:1, fontSize:'12px', color:'#888780' }}>
          {dirty
            ? <span style={{ color:theme.text, fontWeight:500 }}>● 未保存の変更</span>
            : savedAt ? `最終保存 ${savedAt}` : '—'}
        </div>
        <button onClick={handleSave} disabled={saving || !dirty}
          style={{ padding:'12px 28px',
            background: (!dirty || saving) ? '#B4B2A9' : theme.accent,
            color:'white', border:'none', borderRadius:'12px',
            fontSize:'15px', fontWeight:500,
            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
            fontFamily:'inherit' }}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {toast && (
        <div style={{ position:'fixed', bottom:'90px', left:'50%',
          transform:'translateX(-50%)',
          background:'rgba(44,44,42,.9)', color:'white',
          padding:'10px 20px', borderRadius:'20px', fontSize:'13px',
          zIndex:100, whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background:'white', borderRadius:'14px', overflow:'hidden',
      boxShadow:'0 2px 8px rgba(0,0,0,.04)', marginBottom:'12px' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
        fontWeight:500, fontSize:'14px', background:'#FBF8F2' }}>{title}</div>
      <div style={{ padding:'14px 16px' }}>{children}</div>
    </div>
  )
}

function NumField({ label, unit, value, onChange, readOnly }: {
  label: string; unit: string; value: string;
  onChange: (v: string) => void; readOnly?: boolean
}) {
  return (
    <div>
      <div style={{ fontSize:'12px', color:'#888780', marginBottom:'4px' }}>{label}</div>
      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
        <input type={readOnly ? 'text' : 'number'}
          inputMode={readOnly ? 'text' : 'numeric'}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex:1, padding:'10px',
            border:'1.5px solid #E5E1D8', borderRadius:'8px',
            fontSize:'16px', fontFamily:'inherit',
            textAlign:'right',
            background: readOnly ? '#FAFAFA' : 'white',
            color: readOnly ? '#888780' : '#2C2C2A',
            boxSizing:'border-box' }} />
        <span style={{ fontSize:'13px', color:'#888780', minWidth:'24px' }}>{unit}</span>
      </div>
    </div>
  )
}

const textareaStyle: React.CSSProperties = {
  width:'100%', padding:'10px',
  border:'1.5px solid #E5E1D8', borderRadius:'8px',
  fontSize:'15px', fontFamily:'inherit',
  resize:'vertical', background:'white', color:'#2C2C2A',
  boxSizing:'border-box',
}

function Loading() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      読み込み中...
    </div>
  )
}

function ErrorBox({ msg, onTop }: { msg: string; onTop: () => void }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA' }}>
      <div style={{ background:'white', borderRadius:'16px', padding:'40px',
        textAlign:'center', maxWidth:'320px' }}>
        <div style={{ fontSize:'48px', marginBottom:'16px' }}>🚫</div>
        <p style={{ fontSize:'16px', fontWeight:500, color:'#E24B4A', marginBottom:'16px' }}>{msg}</p>
        <button onClick={onTop}
          style={{ padding:'12px 24px', background:'#3B6D11', color:'white',
            border:'none', borderRadius:'10px', fontSize:'14px',
            cursor:'pointer', fontFamily:'inherit' }}>
          トップに戻る
        </button>
      </div>
    </div>
  )
}

export default function NippoPage({
  params,
}: {
  params: Promise<{ branch: string }>
}) {
  const { branch } = use(params)
  return (
    <Suspense fallback={<Loading />}>
      <NippoContent branch={branch} />
    </Suspense>
  )
}
