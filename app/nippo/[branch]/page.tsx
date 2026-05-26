'use client'

import { useEffect, useState, useCallback, Suspense, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { themeForBranch } from '@/lib/storeColors'

type Weather = 'sunny' | 'cloudy' | 'rainy' | 'snowy'
type EntryType = 'plan' | 'actual'
type ShiftPattern = 'first' | 'last' | 'through'

interface Store {
  id  : number
  name: string
  slug: string
}

interface Staff {
  id        : number
  name      : string
  role      : string
  sort_order: number
}

interface ShiftItem {
  // 一意キー（負数: 新規ローカル）
  uid              : number
  staffId          : number | null
  staffNameManual  : string | null
  entryType        : EntryType
  pattern          : ShiftPattern | null
  startTime        : string | null  // 'HH:MM'
  endTime          : string | null
  breakMinutes     : number
  breakStart       : string | null
  breakEnd         : string | null
}

interface ReportState {
  weather       : Weather | null
  salesForecast : string
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

const PATTERN_TIMES: Record<ShiftPattern, { start: string; end: string; defaultBreak: number }> = {
  first:   { start: '09:00', end: '13:00', defaultBreak: 0 },
  last:    { start: '13:00', end: '17:00', defaultBreak: 0 },
  through: { start: '09:00', end: '17:00', defaultBreak: 60 },
}
const PATTERN_LABEL: Record<ShiftPattern, string> = {
  first: '前半', last: '後半', through: '通し',
}

let uidCounter = -1
const nextUid = () => uidCounter--

function parseHM(t: string | null | undefined): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  return h * 60 + min
}

function shiftMinutes(s: ShiftItem): number {
  let startMin: number | null = null
  let endMin: number | null = null
  let breakMin = 0
  if (s.entryType === 'plan' && s.pattern) {
    const p = PATTERN_TIMES[s.pattern]
    startMin = parseHM(p.start); endMin = parseHM(p.end)
    breakMin = s.breakMinutes || p.defaultBreak
  } else {
    startMin = parseHM(s.startTime); endMin = parseHM(s.endTime)
    breakMin = s.breakMinutes || 0
  }
  if (startMin == null || endMin == null || endMin <= startMin) return 0
  return Math.max(0, endMin - startMin - breakMin)
}

function NippoContent({ branch }: { branch: string }) {
  const router = useRouter()
  const { user, loading, error, authFetch, logout } = useAuth(
    ['nishi', 'minami', 'all'],
    { autoLoginRole: VALID_BRANCHES.has(branch) ? branch : undefined },
  )

  const [store, setStore]         = useState<Store | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [report, setReport]       = useState<ReportState>(EMPTY_REPORT)
  const [shifts, setShifts]       = useState<ShiftItem[]>([])
  const [shiftTab, setShiftTab]   = useState<EntryType>('actual')
  const [savedAt, setSavedAt]     = useState<string | null>(null)
  const [dirty, setDirty]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [fetching, setFetching]   = useState(true)
  const [toast, setToast]         = useState('')

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
    setStaffList(data.staffList ?? [])

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
    } else {
      setReport(EMPTY_REPORT)
    }

    const loadedShifts: ShiftItem[] = (data.shifts ?? []).map((s: {
      id: number; staff_id: number | null; staff_name_manual: string | null;
      entry_type: EntryType; pattern: ShiftPattern | null;
      start_time: string | null; end_time: string | null;
      break_minutes: number; break_start: string | null; break_end: string | null
    }) => ({
      uid              : s.id,
      staffId          : s.staff_id,
      staffNameManual  : s.staff_name_manual,
      entryType        : s.entry_type,
      pattern          : s.pattern,
      startTime        : s.start_time ? s.start_time.slice(0,5) : null,
      endTime          : s.end_time   ? s.end_time.slice(0,5)   : null,
      breakMinutes     : s.break_minutes ?? 0,
      breakStart       : s.break_start ? s.break_start.slice(0,5) : null,
      breakEnd         : s.break_end   ? s.break_end.slice(0,5)   : null,
    }))
    setShifts(loadedShifts)
    setDirty(false)
  }, [user, branch, authFetch])

  useEffect(() => {
    if (!loading && !error) fetchData()
  }, [loading, error, fetchData])

  useEffect(() => {
    if (!VALID_BRANCHES.has(branch)) router.replace('/')
  }, [branch, router])

  const update = <K extends keyof ReportState>(key: K, v: ReportState[K]) => {
    setReport((prev) => ({ ...prev, [key]: v }))
    setDirty(true)
  }

  const addShiftFromStaff = (staffId: number) => {
    if (shifts.some((s) => s.entryType === shiftTab && s.staffId === staffId)) return
    setShifts((prev) => [...prev, {
      uid: nextUid(),
      staffId, staffNameManual: null,
      entryType: shiftTab,
      pattern: shiftTab === 'plan' ? 'through' : null,
      startTime: shiftTab === 'actual' ? '09:00' : null,
      endTime  : shiftTab === 'actual' ? '17:00' : null,
      breakMinutes: 0, breakStart: null, breakEnd: null,
    }])
    setDirty(true)
  }

  const addShiftManual = (name: string) => {
    if (!name.trim()) return
    setShifts((prev) => [...prev, {
      uid: nextUid(),
      staffId: null, staffNameManual: name.trim(),
      entryType: shiftTab,
      pattern: shiftTab === 'plan' ? 'through' : null,
      startTime: shiftTab === 'actual' ? '09:00' : null,
      endTime  : shiftTab === 'actual' ? '17:00' : null,
      breakMinutes: 0, breakStart: null, breakEnd: null,
    }])
    setDirty(true)
  }

  const updateShift = (uid: number, patch: Partial<ShiftItem>) => {
    setShifts((prev) => prev.map((s) => s.uid === uid ? { ...s, ...patch } : s))
    setDirty(true)
  }

  const removeShift = (uid: number) => {
    setShifts((prev) => prev.filter((s) => s.uid !== uid))
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
      shifts: shifts.map((s) => ({
        staffId         : s.staffId,
        staffNameManual : s.staffNameManual,
        entryType       : s.entryType,
        pattern         : s.pattern,
        startTime       : s.startTime,
        endTime         : s.endTime,
        breakMinutes    : s.breakMinutes,
        breakStart      : s.breakStart,
        breakEnd        : s.breakEnd,
      })),
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
    // 保存後に再読込してidを更新（再保存時のキー整合のため）
    fetchData()
  }

  const customerCountNum = parseInt(report.customerCount, 10)
  const salesActualNum   = parseInt(report.salesActual, 10)
  const tanka = customerCountNum > 0 && salesActualNum > 0
    ? Math.round(salesActualNum / customerCountNum)
    : null

  // 実績シフトの合計時間
  const totalActualMin = shifts.filter((s) => s.entryType === 'actual')
    .reduce((sum, s) => sum + shiftMinutes(s), 0)
  const totalActualH = totalActualMin / 60
  const ninjibai = (totalActualH > 0 && salesActualNum > 0)
    ? Math.round(salesActualNum / totalActualH) : null

  if (loading) return <Loading />
  if (error)   return <ErrorBox msg={error} onTop={() => router.push('/')} />

  const today = new Date()
  const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`
  const dowName = ['日','月','火','水','木','金','土'][today.getDay()]

  const visibleShifts = shifts.filter((s) => s.entryType === shiftTab)
  const usedStaffIds = visibleShifts
    .map((s) => s.staffId)
    .filter((x): x is number => x !== null)
  const availableStaff = staffList.filter((s) => !usedStaffIds.includes(s.id))

  return (
    <div style={{ fontFamily:"'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif",
      background:'#F5F1EA', minHeight:'100vh', paddingBottom:'90px', color:'#2C2C2A' }}>

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

        <Card title="📝 ひとこと">
          <textarea value={report.reportText}
            onChange={(e) => update('reportText', e.target.value)}
            rows={3} placeholder="本日のひとこと" style={textareaStyle} />
        </Card>

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

        {/* シフト */}
        <Card title="👥 シフト">
          <div style={{ display:'flex', gap:'6px', marginBottom:'12px' }}>
            {(['plan','actual'] as EntryType[]).map((t) => {
              const on = shiftTab === t
              return (
                <button key={t} onClick={() => setShiftTab(t)}
                  style={{
                    flex:1, padding:'10px',
                    border: on ? `2px solid ${theme.accent}` : '1.5px solid #E5E1D8',
                    background: on ? theme.accent : 'white',
                    color: on ? 'white' : '#2C2C2A',
                    borderRadius:'8px', fontSize:'14px', fontWeight:500,
                    cursor:'pointer', fontFamily:'inherit',
                  }}>
                  {t === 'plan' ? '予定' : '実績'}
                </button>
              )
            })}
          </div>

          {visibleShifts.length === 0 && (
            <div style={{ padding:'16px', textAlign:'center', color:'#888780',
              fontSize:'13px', border:'1.5px dashed #E5E1D8', borderRadius:'10px',
              marginBottom:'10px' }}>
              ↓ スタッフを追加してください
            </div>
          )}

          {visibleShifts.map((s) => {
            const name = s.staffId
              ? (staffList.find((x) => x.id === s.staffId)?.name ?? '(不明)')
              : (s.staffNameManual ?? '(未設定)')
            return (
              <ShiftRow key={s.uid} shift={s} name={name} theme={theme}
                onChange={(p) => updateShift(s.uid, p)}
                onDelete={() => removeShift(s.uid)} />
            )
          })}

          <AddStaffRow availableStaff={availableStaff}
            onAddFromMaster={addShiftFromStaff}
            onAddManual={addShiftManual} />

          {shiftTab === 'actual' && (
            <div style={{ marginTop:'12px', padding:'10px 12px',
              background:'#FBF8F2', borderRadius:'8px',
              display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
              <span style={{ fontSize:'12px', color:'#888780' }}>総実働時間</span>
              <span style={{ fontSize:'18px', fontWeight:600, color: theme.text }}>
                {totalActualH.toFixed(1)}<span style={{ fontSize:'11px', marginLeft:'2px' }}>h</span>
              </span>
            </div>
          )}
          {shiftTab === 'actual' && ninjibai != null && (
            <div style={{ marginTop:'6px', padding:'10px 12px',
              background:'#FBF8F2', borderRadius:'8px',
              display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
              <span style={{ fontSize:'12px', color:'#888780' }}>
                人時売 ＝ ¥{salesActualNum.toLocaleString('ja-JP')} ÷ {totalActualH.toFixed(1)}h
              </span>
              <span style={{ fontSize:'16px', fontWeight:600, color: theme.text }}>
                ¥{ninjibai.toLocaleString('ja-JP')}<span style={{ fontSize:'11px', marginLeft:'2px' }}>/h</span>
              </span>
            </div>
          )}
        </Card>

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

        <Card title="💡 気づき">
          <textarea value={report.kizuki}
            onChange={(e) => update('kizuki', e.target.value)}
            rows={3} placeholder="気づいたこと" style={textareaStyle} />
        </Card>

        <Card title="🗒 備考">
          <textarea value={report.bikou}
            onChange={(e) => update('bikou', e.target.value)}
            rows={3} placeholder="その他メモ" style={textareaStyle} />
        </Card>
      </div>
      )}

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

function ShiftRow({ shift, name, theme, onChange, onDelete }: {
  shift   : ShiftItem
  name    : string
  theme   : { accent: string; bg: string; text: string }
  onChange: (p: Partial<ShiftItem>) => void
  onDelete: () => void
}) {
  return (
    <div style={{ padding:'10px 12px', marginBottom:'8px',
      background:'#FBF8F2', borderRadius:'10px',
      border:'1px solid #F0ECE3' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'8px' }}>
        <span style={{ fontWeight:500, fontSize:'15px' }}>{name}</span>
        <button onClick={onDelete}
          style={{ padding:'4px 10px', background:'white',
            border:'1.5px solid #E5E1D8', borderRadius:'8px',
            fontSize:'11px', color:'#E24B4A',
            cursor:'pointer', fontFamily:'inherit' }}>
          削除
        </button>
      </div>

      {shift.entryType === 'plan' ? (
        <div style={{ display:'flex', gap:'6px' }}>
          {(['first','last','through'] as ShiftPattern[]).map((p) => {
            const on = shift.pattern === p
            return (
              <button key={p} onClick={() => onChange({ pattern: p })}
                style={{
                  flex:1, padding:'8px',
                  border: on ? `2px solid ${theme.accent}` : '1.5px solid #E5E1D8',
                  background: on ? theme.bg : 'white',
                  color: on ? theme.text : '#2C2C2A',
                  borderRadius:'8px', fontSize:'13px', fontWeight:500,
                  cursor:'pointer', fontFamily:'inherit',
                }}>
                {PATTERN_LABEL[p]}
              </button>
            )
          })}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'6px' }}>
          <TimeField label="開始" value={shift.startTime ?? ''}
            onChange={(v) => onChange({ startTime: v || null })} />
          <TimeField label="終了" value={shift.endTime ?? ''}
            onChange={(v) => onChange({ endTime: v || null })} />
          <div>
            <div style={{ fontSize:'11px', color:'#888780', marginBottom:'2px' }}>休憩(分)</div>
            <input type="number" inputMode="numeric"
              value={shift.breakMinutes || ''}
              onChange={(e) => onChange({ breakMinutes: parseInt(e.target.value, 10) || 0 })}
              style={{ width:'100%', padding:'8px',
                border:'1.5px solid #E5E1D8', borderRadius:'8px',
                fontSize:'14px', fontFamily:'inherit',
                textAlign:'center', boxSizing:'border-box' }} />
          </div>
        </div>
      )}
    </div>
  )
}

function TimeField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <div style={{ fontSize:'11px', color:'#888780', marginBottom:'2px' }}>{label}</div>
      <input type="time" value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width:'100%', padding:'8px',
          border:'1.5px solid #E5E1D8', borderRadius:'8px',
          fontSize:'14px', fontFamily:'inherit',
          textAlign:'center', boxSizing:'border-box' }} />
    </div>
  )
}

function AddStaffRow({ availableStaff, onAddFromMaster, onAddManual }: {
  availableStaff : Staff[]
  onAddFromMaster: (id: number) => void
  onAddManual    : (name: string) => void
}) {
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')

  if (manualMode) {
    return (
      <div style={{ display:'flex', gap:'6px', padding:'10px',
        background:'#FAFAFA', borderRadius:'8px' }}>
        <input type="text" value={manualName}
          placeholder="氏名"
          onChange={(e) => setManualName(e.target.value)}
          style={{ flex:1, padding:'8px',
            border:'1.5px solid #E5E1D8', borderRadius:'8px',
            fontSize:'14px', fontFamily:'inherit', boxSizing:'border-box' }} />
        <button onClick={() => {
          if (manualName.trim()) {
            onAddManual(manualName)
            setManualName(''); setManualMode(false)
          }
        }}
          style={{ padding:'8px 14px', background:'#2C2C2A',
            color:'white', border:'none', borderRadius:'8px',
            fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
          追加
        </button>
        <button onClick={() => { setManualMode(false); setManualName('') }}
          style={{ padding:'8px 12px', background:'white',
            border:'1.5px solid #E5E1D8', borderRadius:'8px',
            fontSize:'13px', cursor:'pointer', fontFamily:'inherit' }}>
          戻る
        </button>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', gap:'6px', padding:'10px',
      background:'#FAFAFA', borderRadius:'8px' }}>
      <select defaultValue=""
        onChange={(e) => {
          const v = e.target.value
          if (v) { onAddFromMaster(Number(v)); e.target.value = '' }
        }}
        style={{ flex:1, padding:'8px',
          border:'1.5px solid #E5E1D8', borderRadius:'8px',
          fontSize:'14px', fontFamily:'inherit',
          background:'white', boxSizing:'border-box' }}>
        <option value="">＋ スタッフを追加...</option>
        {availableStaff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button onClick={() => setManualMode(true)}
        style={{ padding:'8px 12px', background:'white',
          border:'1.5px solid #E5E1D8', borderRadius:'8px',
          fontSize:'13px', cursor:'pointer', fontFamily:'inherit',
          whiteSpace:'nowrap' }}>
        手入力
      </button>
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
          value={value} readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex:1, padding:'10px',
            border:'1.5px solid #E5E1D8', borderRadius:'8px',
            fontSize:'16px', fontFamily:'inherit', textAlign:'right',
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
