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
  if (!clientId || !clientSecret || !companyId || !baseUrl) return null
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
  const data = {
    accessToken : t.access_token,
    refreshToken: t.refresh_token,
    expiresAt,
    companyId   : t.company_id != null ? String(t.company_id) : undefined,
    ...(connectedBy ? { connectedBy } : {}),
  }
  await prisma.freeeToken.upsert({
    where : { id: TOKEN_ROW_ID },
    update: data,
    create: { id: TOKEN_ROW_ID, ...data, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt },
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
  form.append('company_id', cfg.companyId)
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
