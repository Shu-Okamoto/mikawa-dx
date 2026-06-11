// クライアント側の認証ユーティリティ。localStorage と JWT の取り扱いを集約。

export interface AuthUser {
  id       : number
  name     : string
  role     : string
  store    : string
  storeName: string
  category : string
}

const TOKEN_KEY = 'token'
const USER_KEY  = 'user'

// PIN セッション: PIN 入力後、一定時間(アイドル)は PIN 再入力を省略する。
const PIN_SESSION_KEY = 'pinSession'
export const PIN_TTL_MS = 4 * 60 * 60 * 1000 // 4 時間

interface PinSession { role: string; expiresAt: number }

// PIN セッションを開始/延長する(期限を now + TTL に更新)。
export function setPinSession(role: string): void {
  if (typeof window === 'undefined') return
  const s: PinSession = { role, expiresAt: Date.now() + PIN_TTL_MS }
  localStorage.setItem(PIN_SESSION_KEY, JSON.stringify(s))
}

// 有効な PIN セッションがあれば role を返す。期限切れ/無効なら null。
export function getValidPinRole(): string | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(PIN_SESSION_KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as PinSession
    if (typeof s.role !== 'string' || typeof s.expiresAt !== 'number') return null
    if (Date.now() > s.expiresAt) return null
    return s.role
  } catch {
    return null
  }
}

// 有効なら期限を延長する(スライディング)。無効なら何もしない。
export function touchPinSession(): void {
  const role = getValidPinRole()
  if (role) setPinSession(role)
}

export function clearPinSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(PIN_SESSION_KEY)
}

export function getStoredAuth(): { token: string; user: AuthUser } | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem(TOKEN_KEY)
  const raw   = localStorage.getItem(USER_KEY)
  if (!token || !raw) return null
  try {
    return { token, user: JSON.parse(raw) as AuthUser }
  } catch {
    return null
  }
}

export function setStoredAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY,  JSON.stringify(user))
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// JWT の payload から exp(秒)を取り出す。トークンが壊れていれば null。
function decodeTokenExp(token: string | null): number | null {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

// トークンが期限切れかどうか。null/壊れている場合は true 扱い。
export function isTokenExpired(token: string | null): boolean {
  const exp = decodeTokenExp(token)
  if (exp === null) return token == null  // exp無し&トークンあり = 期限なし扱い(false)
  return exp * 1000 < Date.now()
}
