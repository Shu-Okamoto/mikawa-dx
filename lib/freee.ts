import prisma from '@/lib/prisma'

// freee(会計)連携。
//
// OAuth2 の認可コードフロー。アクセストークンは 6 時間、リフレッシュトークンは
// 90 日で失効する。リフレッシュのたびに新しいリフレッシュトークンが返るため、
// 受け取った値は必ず保存し直す(保存に失敗すると再連携が必要になる)。
//
// 認証情報はコードに持たず、すべて環境変数から読む。

const ACCOUNTS = 'https://accounts.secure.freee.co.jp'
const API      = 'https://api.freee.co.jp'

// トークンは単一行で持つ
const TOKEN_ROW_ID = 1

// 期限ぎりぎりでの失敗を避けるため、5 分前から更新対象にする
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export interface FreeeConfig {
  clientId    : string
  clientSecret: string
  companyId   : string
  redirectUri : string
}

export function freeeConfig(): FreeeConfig | null {
  const clientId     = process.env.FREEE_CLIENT_ID     ?? ''
  const clientSecret = process.env.FREEE_CLIENT_SECRET ?? ''
  const companyId    = process.env.FREEE_COMPANY_ID    ?? ''
  const baseUrl      = process.env.NEXT_PUBLIC_API_URL ?? ''
  // 事業所IDは画面から選べるので必須にしない(環境変数は初期値として使う)
  if (!clientId || !clientSecret || !baseUrl) return null
  return {
    clientId,
    clientSecret,
    companyId,
    redirectUri: `${baseUrl.replace(/\/$/, '')}/api/boss/freee/callback`,
  }
}

export function authorizeUrl(cfg: FreeeConfig, state: string): string {
  const q = new URLSearchParams({
    client_id    : cfg.clientId,
    redirect_uri : cfg.redirectUri,
    response_type: 'code',
    state,
  })
  return `${ACCOUNTS}/public_api/authorize?${q.toString()}`
}

interface TokenResponse {
  access_token : string
  refresh_token: string
  expires_in   : number
  company_id  ?: number
}

async function requestToken(
  cfg: FreeeConfig, params: Record<string, string>,
): Promise<TokenResponse> {
  const res = await fetch(`${ACCOUNTS}/public_api/token`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : new URLSearchParams({
      client_id    : cfg.clientId,
      client_secret: cfg.clientSecret,
      ...params,
    }).toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`freee トークン取得に失敗しました (${res.status}): ${text.slice(0, 300)}`)
  }
  return JSON.parse(text) as TokenResponse
}

async function saveToken(t: TokenResponse, connectedBy?: string) {
  const expiresAt = new Date(Date.now() + t.expires_in * 1000)
  // connectedBy は値があるときだけ書く。companyId はトークン応答の値が
  // どの事業所かはっきりしないので保存せず、画面で選んだ値だけを持つ。
  const common = {
    accessToken : t.access_token,
    refreshToken: t.refresh_token,
    expiresAt,
    ...(connectedBy ? { connectedBy } : {}),
  }
  await prisma.freeeToken.upsert({
    where : { id: TOKEN_ROW_ID },
    update: common,
    create: { id: TOKEN_ROW_ID, ...common },
  })
}

// 認可コードをトークンに交換して保存する(初回連携)
export async function connectWithCode(
  cfg: FreeeConfig, code: string, connectedBy?: string,
): Promise<void> {
  const t = await requestToken(cfg, {
    grant_type  : 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
  })
  await saveToken(t, connectedBy)
}

// 有効なアクセストークンを返す。期限が近ければリフレッシュする。
// 未連携・リフレッシュトークン失効(90日)の場合は例外。
export async function accessToken(cfg: FreeeConfig): Promise<string> {
  const row = await prisma.freeeToken.findUnique({ where: { id: TOKEN_ROW_ID } })
  if (!row) throw new Error('freee と未連携です。設定画面から連携してください')

  if (row.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) {
    return row.accessToken
  }

  const t = await requestToken(cfg, {
    grant_type   : 'refresh_token',
    refresh_token: row.refreshToken,
  })
  await saveToken(t)
  return t.access_token
}

// 実際に使う事業所ID。画面で選んだ値を優先し、無ければ環境変数を使う。
export async function resolvedCompanyId(cfg: FreeeConfig): Promise<string> {
  const row = await prisma.freeeToken.findUnique({ where: { id: TOKEN_ROW_ID } })
  return row?.companyId || cfg.companyId
}

export async function setCompanyId(companyId: string): Promise<void> {
  await prisma.freeeToken.update({
    where: { id: TOKEN_ROW_ID }, data: { companyId },
  })
}

export interface Company { id: string; name: string }

// 連携したアカウントが参照できる事業所の一覧。company_id は付けない。
export async function listCompanies(cfg: FreeeConfig): Promise<Company[]> {
  const json = await apiGet(cfg, '/api/1/companies', false) as {
    companies?: { id: number; name?: string; display_name?: string }[]
  }
  return (json.companies ?? []).map((c) => ({
    id  : String(c.id),
    name: c.display_name || c.name || String(c.id),
  }))
}

export async function connectionStatus() {
  const row = await prisma.freeeToken.findUnique({ where: { id: TOKEN_ROW_ID } })
  if (!row) return { connected: false as const }
  return {
    connected  : true as const,
    companyId  : row.companyId,
    connectedBy: row.connectedBy,
    // 表示用。アクセストークン自体は返さない
    updatedAt  : row.updatedAt.toISOString(),
  }
}

export async function disconnect(): Promise<void> {
  await prisma.freeeToken.deleteMany({ where: { id: TOKEN_ROW_ID } })
}

// ファイルボックス(証憑ファイル)へアップロードする。
// issue_date(発生日)は freee 側で廃止済みのため送らない。
export async function uploadReceipt(
  cfg: FreeeConfig, file: Blob, filename: string, description: string,
): Promise<string> {
  const token = await accessToken(cfg)

  const form = new FormData()
  form.append('company_id', await resolvedCompanyId(cfg))
  form.append('description', description)
  form.append('receipt', file, filename)

  const res = await fetch(`${API}/api/1/receipts`, {
    method : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body   : form,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`freee への送信に失敗しました (${res.status}): ${text.slice(0, 300)}`)
  }

  // レスポンス形は version 差があるため、どの形でも ID を拾えるようにする
  let id: unknown
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    const receipt  = json.receipt  as Record<string, unknown> | undefined
    const receipts = json.receipts as Record<string, unknown>[] | undefined
    id = receipt?.id ?? receipts?.[0]?.id ?? json.id
  } catch { /* ID が取れなくても送信自体は成功している */ }

  return id != null ? String(id) : ''
}

// ---------------------------------------------------------------------------
// 勘定科目・振替伝票
// ---------------------------------------------------------------------------

export interface AccountItem {
  id            : string
  name          : string
  // 科目の既定の税区分。売上の仕訳に使う初期値として画面に出す
  defaultTaxCode: number | null
}

async function apiGet(
  cfg: FreeeConfig, path: string, withCompany = true,
): Promise<unknown> {
  const token = await accessToken(cfg)
  let url = `${API}${path}`
  if (withCompany) {
    const id = await resolvedCompanyId(cfg)
    if (!id) throw new Error('事業所が選択されていません')
    url += `${path.includes('?') ? '&' : '?'}company_id=${encodeURIComponent(id)}`
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`freee API エラー (${res.status}): ${text.slice(0, 300)}`)
  }
  return JSON.parse(text)
}

// 勘定科目の一覧。マッピング画面の選択肢に使う。
export async function listAccountItems(cfg: FreeeConfig): Promise<AccountItem[]> {
  const json = await apiGet(cfg, '/api/1/account_items') as {
    account_items?: { id: number; name: string; default_tax_code?: number }[]
  }
  return (json.account_items ?? []).map((a) => ({
    id            : String(a.id),
    name          : a.name,
    defaultTaxCode: a.default_tax_code ?? null,
  }))
}

export interface JournalLine {
  entrySide  : 'debit' | 'credit'
  accountId  : string
  amount     : number
  taxCode    : number | null
  description: string
}

// 振替伝票を作る。取引(deals)ではなく振替伝票を使うのは、借方(現金 /
// ペイペイ未収入金)と貸方(売上高)の両方を明示して登録したいため。
export async function createManualJournal(
  cfg: FreeeConfig, issueDate: string, lines: JournalLine[],
): Promise<string> {
  const token = await accessToken(cfg)
  const body = {
    company_id: Number(await resolvedCompanyId(cfg)),
    issue_date: issueDate,
    details   : lines.map((l) => ({
      entry_side     : l.entrySide,
      account_item_id: Number(l.accountId),
      amount         : l.amount,
      description    : l.description,
      ...(l.taxCode != null ? { tax_code: l.taxCode } : {}),
    })),
  }

  const res = await fetch(`${API}/api/1/manual_journals`, {
    method : 'POST',
    headers: {
      Authorization : `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`freee への登録に失敗しました (${res.status}): ${text.slice(0, 400)}`)
  }

  let id: unknown
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    const mj = json.manual_journal as Record<string, unknown> | undefined
    id = mj?.id ?? json.id
  } catch { /* ID が取れなくても登録自体は成功している */ }
  return id != null ? String(id) : ''
}
