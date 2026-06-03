'use client'

import { useState, useMemo, Suspense } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { BossHeader, BossNav, Toast, useToast } from '../_shared'

type Mode = 'product' | 'order-product' | 'sale'

type ProductRow = {
  productCode: string
  productName: string
  category   : string
  unit       : string
  weeklyAvg  : string
  vendorName : string
  isActive   : boolean
}

type OrderProductRow = {
  productCode  : string
  productName  : string
  category     : string
  price        : string
  availableDays: string
  isActive     : boolean
  memo         : string
}

type SaleRow = {
  date    : string
  store   : string
  amount  : string
  souzai  : string
  mochi   : string
  hana    : string
  customer: string
  weather : string
}

type ImportResult = {
  total        : number
  createdCount : number
  updatedCount : number
  skippedCount : number
  skipped      : { code: string; reason: string }[]
  vendorsCreated?: string[]
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const t = text.replace(/\r\n?/g, '\n')
  while (i < t.length) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++
      } else {
        field += c; i++
      }
    } else {
      if (c === '"') { inQuotes = true; i++ }
      else if (c === ',') { row.push(field); field = ''; i++ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
      else { field += c; i++ }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

// Normalize header cell: strip surrounding spaces, drop newlines + Japanese subtitle
function normHeader(s: string): string {
  return s.trim().split(/\s|\n/)[0].toLowerCase()
}

function findHeaderRow(rows: string[][], required: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const headers = rows[i].map(normHeader)
    if (required.every((r) => headers.includes(r))) return i
  }
  return -1
}

function toBool(v: string): boolean {
  const s = v.trim().toLowerCase()
  if (s === 'false' || s === '0' || s === 'no' || s === '') return false
  return true
}

function parseProductRows(text: string): ProductRow[] {
  const grid = parseCSV(text)
  const headerIdx = findHeaderRow(grid, ['productid', 'productname', 'category'])
  if (headerIdx < 0) throw new Error('ヘッダー行（ProductID/ProductName/Category 等）が見つかりません')
  const headers = grid[headerIdx].map(normHeader)
  const col = (name: string) => headers.indexOf(name)
  const idx = {
    code     : col('productid'),
    name     : col('productname'),
    category : col('category'),
    unit     : col('unit'),
    weeklyAvg: col('weeklyavg'),
    vendor   : col('vendor'),
    active   : col('active'),
  }
  const out: ProductRow[] = []
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i]
    if (!r || r.every((c) => !c?.trim())) continue
    out.push({
      productCode: (r[idx.code]      ?? '').trim(),
      productName: (r[idx.name]      ?? '').trim(),
      category   : (r[idx.category]  ?? '').trim(),
      unit       : (r[idx.unit]      ?? '').trim(),
      weeklyAvg  : (r[idx.weeklyAvg] ?? '').trim(),
      vendorName : (r[idx.vendor]    ?? '').trim(),
      isActive   : idx.active >= 0 ? toBool(r[idx.active] ?? 'true') : true,
    })
  }
  return out
}

function parseOrderProductRows(text: string): OrderProductRow[] {
  const grid = parseCSV(text)
  const headerIdx = findHeaderRow(grid, ['productid', 'productname', 'category'])
  if (headerIdx < 0) throw new Error('ヘッダー行が見つかりません')
  const headers = grid[headerIdx].map(normHeader)
  const col = (name: string) => headers.indexOf(name)
  const idx = {
    code   : col('productid'),
    name   : col('productname'),
    cat    : col('category'),
    price  : col('price'),
    days   : col('availabledays'),
    active : col('active'),
    memo   : col('memo'),
  }
  const out: OrderProductRow[] = []
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i]
    if (!r || r.every((c) => !c?.trim())) continue
    out.push({
      productCode  : (r[idx.code]   ?? '').trim(),
      productName  : (r[idx.name]   ?? '').trim(),
      category     : (r[idx.cat]    ?? '').trim(),
      price        : (r[idx.price]  ?? '').trim(),
      availableDays: (r[idx.days]   ?? '').trim(),
      isActive     : idx.active >= 0 ? toBool(r[idx.active] ?? 'true') : true,
      memo         : (r[idx.memo]   ?? '').trim(),
    })
  }
  return out
}

// 売上CSV のヘッダー候補 (日本語/英語混在)
const SALE_HEADER_ALIASES: Record<keyof SaleRow, string[]> = {
  date    : ['日付', '年月日', 'date', 'saledate'],
  store   : ['店', '店舗', 'store', 'storename'],
  amount  : ['売上', '売上合計', '合計', 'amount', 'total'],
  souzai  : ['惣菜', 'souzai'],
  mochi   : ['餅', 'mochi'],
  hana    : ['花', 'hana'],
  customer: ['客数', 'customer', 'customercount'],
  weather : ['天気', '天候', 'weather'],
}

// 「天気」「花」は CSV にない場合もあるので、必須から外す。
const SALE_OPTIONAL: Set<keyof SaleRow> = new Set(['weather', 'hana'])

function findSaleHeaderRow(rows: string[][]): {
  idx: number
  cols: Record<keyof SaleRow, number>
} | null {
  for (let i = 0; i < rows.length; i++) {
    const headers = rows[i].map((h) => h.trim().toLowerCase())
    const cols: Partial<Record<keyof SaleRow, number>> = {}
    let requiredMissing = false
    ;(Object.keys(SALE_HEADER_ALIASES) as (keyof SaleRow)[]).forEach((k) => {
      const aliases = SALE_HEADER_ALIASES[k].map((a) => a.toLowerCase())
      const idx = headers.findIndex((h) => aliases.includes(h))
      if (idx < 0) {
        if (!SALE_OPTIONAL.has(k)) requiredMissing = true
        cols[k] = -1
      } else {
        cols[k] = idx
      }
    })
    if (!requiredMissing) return { idx: i, cols: cols as Record<keyof SaleRow, number> }
  }
  return null
}

function parseSaleRows(text: string): SaleRow[] {
  const grid = parseCSV(text)
  const header = findSaleHeaderRow(grid)
  if (!header) {
    throw new Error(
      'ヘッダー行が見つかりません。必須列: 日付 / 店 / 売上 / 惣菜 / 餅 / 花 / 客数',
    )
  }
  const { idx: headerIdx, cols } = header
  const out: SaleRow[] = []
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i]
    if (!r || r.every((c) => !c?.trim())) continue
    const at = (idx: number) => idx >= 0 ? (r[idx] ?? '').trim() : ''
    out.push({
      date    : at(cols.date),
      store   : at(cols.store),
      amount  : at(cols.amount),
      souzai  : at(cols.souzai),
      mochi   : at(cols.mochi),
      hana    : at(cols.hana),
      customer: at(cols.customer),
      weather : at(cols.weather),
    })
  }
  return out
}

function ImportContent() {
  const { user, loading, error, authFetch, logout } = useAuth('all')
  const { toast, showToast } = useToast()
  const [mode, setMode]     = useState<Mode>('product')
  const [csvText, setCsvText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [running, setRunning] = useState(false)

  const parsed = useMemo(() => {
    if (!csvText.trim()) return null
    try {
      setParseError(null)
      if (mode === 'product')       return { kind: 'product'       as const, rows: parseProductRows(csvText) }
      if (mode === 'order-product') return { kind: 'order-product' as const, rows: parseOrderProductRows(csvText) }
      return { kind: 'sale' as const, rows: parseSaleRows(csvText) }
    } catch (e: any) {
      setParseError(e.message || 'パースに失敗しました')
      return null
    }
  }, [csvText, mode])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const buf = await f.arrayBuffer()
    // UTF-8 を前提（Google Sheets の export は UTF-8）
    const text = new TextDecoder('utf-8').decode(buf)
    setCsvText(text)
    setResult(null)
  }

  const execute = async () => {
    if (!parsed || parsed.rows.length === 0) return
    const confirmMsg = parsed.kind === 'sale'
      ? `${parsed.rows.length} 行をインポートします。同じ (日付, 店) が既にある行はスキップされます。続行しますか？`
      : `${parsed.rows.length} 行をインポートします。既存の productCode は上書きされます。続行しますか？`
    if (!confirm(confirmMsg)) return
    setRunning(true)
    setResult(null)
    const url =
      parsed.kind === 'product'       ? '/api/boss/import/products' :
      parsed.kind === 'order-product' ? '/api/boss/import/order-products' :
                                        '/api/boss/import/sales'
    const res = await authFetch(url, {
      method: 'POST',
      body  : JSON.stringify({ rows: parsed.rows }),
    })
    const data = await res.json()
    setRunning(false)
    if (!res.ok) {
      showToast('エラー: ' + (data.error ?? '不明'))
      return
    }
    setResult(data)
    showToast(`完了: 新規 ${data.createdCount} / 更新 ${data.updatedCount} / スキップ ${data.skippedCount}`)
  }

  if (loading) return <div style={{ padding: 24 }}>読み込み中...</div>
  if (error)   return <div style={{ padding: 24, color: '#E24B4A' }}>{error}</div>
  if (!user)   return null

  const previewRows = parsed?.rows.slice(0, 10) ?? []

  return (
    <div style={{ minHeight: '100vh', background: '#F5F1EA', fontFamily: "'BIZ UDPGothic',-apple-system,'Hiragino Sans','Yu Gothic',sans-serif" }}>
      <BossHeader title="マスタインポート" subtitle="CSV から商品 / 注文商品 / 売上を一括登録" onLogout={logout} />
      <BossNav active="/boss/import" />

      <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {(['product', 'order-product', 'sale'] as Mode[]).map((m) => (
            <button key={m}
              onClick={() => { setMode(m); setCsvText(''); setResult(null) }}
              style={{
                padding: '8px 16px',
                border : '1px solid #D9D5CC',
                borderRadius: '10px',
                background: mode === m ? '#3B6D11' : 'white',
                color    : mode === m ? 'white'   : '#2C2C2A',
                cursor   : 'pointer',
                fontSize : '13px',
              }}>
              {m === 'product'
                ? '商品 (Product)'
                : m === 'order-product'
                ? '注文商品 (OrderProduct)'
                : '売上 (Sale)'}
            </button>
          ))}
        </div>

        <div style={{ background: 'white', padding: '16px', borderRadius: '12px',
          marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>

          <div style={{ fontSize: '13px', color: '#888780', marginBottom: '10px' }}>
            {mode === 'product'
              ? '列: ProductID / ProductName / Category / Unit / WeeklyAvg / Vendor / Active'
              : mode === 'order-product'
              ? '列: ProductID / ProductName / Category / Price / AvailableDays / Active / Memo'
              : '列: 日付 / 店 / 天気 / 売上 / 客数 / 惣菜 / 餅 (順不同。店は「西店」「南店」「本部」もしくは nishi/minami/honbu。天気は 晴/曇/雨/雪。花列があれば取り込みますが、なくても OK)'}
          </div>

          {mode === 'sale' && (
            <SaleExportControls authFetch={authFetch} showToast={showToast} />
          )}

          <input type="file" accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0])}
            style={{ marginBottom: '10px' }} />

          <textarea
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setResult(null) }}
            placeholder="ここに CSV を貼り付けることもできます"
            style={{
              width: '100%', minHeight: '120px',
              padding: '8px', border: '1px solid #E5E1D8',
              borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px',
              boxSizing: 'border-box',
            }} />

          {parseError && (
            <div style={{ color: '#E24B4A', fontSize: '13px', marginTop: '8px' }}>
              {parseError}
            </div>
          )}
        </div>

        {parsed && (
          <div style={{ background: 'white', padding: '16px', borderRadius: '12px',
            marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>
                プレビュー: 全 {parsed.rows.length} 行（先頭 10 行を表示）
              </div>
              <button onClick={execute} disabled={running || parsed.rows.length === 0}
                style={{
                  padding: '8px 20px', background: '#3B6D11', color: 'white',
                  border: 'none', borderRadius: '8px', cursor: 'pointer',
                  fontSize: '13px', opacity: running ? 0.5 : 1,
                }}>
                {running ? '実行中...' : 'インポート実行'}
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F5F1EA' }}>
                    {parsed.kind === 'product' ? (
                      <>
                        <th style={th}>code</th>
                        <th style={th}>name</th>
                        <th style={th}>category</th>
                        <th style={th}>unit</th>
                        <th style={th}>weeklyAvg</th>
                        <th style={th}>vendor</th>
                        <th style={th}>active</th>
                      </>
                    ) : parsed.kind === 'order-product' ? (
                      <>
                        <th style={th}>code</th>
                        <th style={th}>name</th>
                        <th style={th}>category</th>
                        <th style={th}>price</th>
                        <th style={th}>days</th>
                        <th style={th}>active</th>
                        <th style={th}>memo</th>
                      </>
                    ) : (
                      <>
                        <th style={th}>日付</th>
                        <th style={th}>店</th>
                        <th style={th}>天気</th>
                        <th style={th}>売上</th>
                        <th style={th}>客数</th>
                        <th style={th}>惣菜</th>
                        <th style={th}>餅</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F5F1EA' }}>
                      {parsed.kind === 'product' ? (
                        <>
                          <td style={td}>{(r as ProductRow).productCode}</td>
                          <td style={td}>{(r as ProductRow).productName}</td>
                          <td style={td}>{(r as ProductRow).category}</td>
                          <td style={td}>{(r as ProductRow).unit}</td>
                          <td style={td}>{(r as ProductRow).weeklyAvg}</td>
                          <td style={td}>{(r as ProductRow).vendorName}</td>
                          <td style={td}>{String((r as ProductRow).isActive)}</td>
                        </>
                      ) : parsed.kind === 'order-product' ? (
                        <>
                          <td style={td}>{(r as OrderProductRow).productCode}</td>
                          <td style={td}>{(r as OrderProductRow).productName}</td>
                          <td style={td}>{(r as OrderProductRow).category}</td>
                          <td style={td}>{(r as OrderProductRow).price}</td>
                          <td style={td}>{(r as OrderProductRow).availableDays}</td>
                          <td style={td}>{String((r as OrderProductRow).isActive)}</td>
                          <td style={td}>{(r as OrderProductRow).memo}</td>
                        </>
                      ) : (
                        <>
                          <td style={td}>{(r as SaleRow).date}</td>
                          <td style={td}>{(r as SaleRow).store}</td>
                          <td style={td}>{(r as SaleRow).weather || '-'}</td>
                          <td style={td}>{(r as SaleRow).amount}</td>
                          <td style={td}>{(r as SaleRow).customer}</td>
                          <td style={td}>{(r as SaleRow).souzai}</td>
                          <td style={td}>{(r as SaleRow).mochi}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div style={{ background: 'white', padding: '16px', borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
              インポート結果
            </div>
            <div style={{ fontSize: '13px', color: '#2C2C2A', lineHeight: 1.8 }}>
              全 {result.total} 行 / 新規 {result.createdCount} / 更新 {result.updatedCount} / スキップ {result.skippedCount}
            </div>
            {result.vendorsCreated && result.vendorsCreated.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#888780' }}>
                Vendor 自動作成: {result.vendorsCreated.join(' / ')}
              </div>
            )}
            {result.skipped.length > 0 && (
              <details style={{ marginTop: '8px' }}>
                <summary style={{ fontSize: '12px', color: '#888780', cursor: 'pointer' }}>
                  スキップ {result.skipped.length} 件の詳細
                </summary>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  {result.skipped.map((s, i) => (
                    <div key={i}>{s.code}: {s.reason}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <Toast text={toast} />
      </div>
    </div>
  )
}

function SaleExportControls({ authFetch, showToast }: {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>
  showToast: (msg: string) => void
}) {
  const [from, setFrom] = useState('')
  const [to,   setTo]   = useState('')
  const [busy, setBusy] = useState(false)

  const onExport = async () => {
    setBusy(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to)   params.set('to',   to)
      const qs = params.toString()
      const url = '/api/boss/import/sales' + (qs ? `?${qs}` : '')
      const res = await authFetch(url)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        showToast('エラー: ' + (j.error ?? res.status))
        return
      }
      const blob = await res.blob()
      const fileUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = fileUrl
      // Content-Disposition の filename を尊重したいが、ブラウザ依存なので
      // 念のためこちらでも指定。
      const today = new Date().toISOString().slice(0, 10)
      a.download = `sales_${today}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(fileUrl)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: '#FAF8F3', border: '1px solid #E5E1D8',
      borderRadius: '8px', padding: '10px 12px', marginBottom: '12px',
      display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '13px', color: '#2C2C2A', fontWeight: 500 }}>
        既存データを CSV 出力
      </span>
      <label style={{ fontSize: '12px', color: '#888780' }}>
        from{' '}
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          style={dateInput} />
      </label>
      <label style={{ fontSize: '12px', color: '#888780' }}>
        to{' '}
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          style={dateInput} />
      </label>
      <button onClick={onExport} disabled={busy}
        style={{ padding: '6px 14px', background: '#1A5276', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer',
          fontSize: '12px', opacity: busy ? 0.5 : 1 }}>
        {busy ? '出力中...' : 'CSV ダウンロード'}
      </button>
      <span style={{ fontSize: '11px', color: '#888780' }}>
        日付未指定で全期間
      </span>
    </div>
  )
}

const dateInput: React.CSSProperties = {
  padding: '4px 6px', border: '1px solid #D9D5CC',
  borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit',
}

const th: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid #E5E1D8',
}
const td: React.CSSProperties = {
  padding: '6px 8px', verticalAlign: 'top',
}

export default function ImportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>読み込み中...</div>}>
      <ImportContent />
    </Suspense>
  )
}
