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
const PIN_ROLE_KEY = 'pinRole'  // sessionStorage 側。app/page.tsx と一致させる。

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

// 「終了する」相当: トークンに加え、PINロール選択もリセット。
// これがないと sessionStorage の pinRole が残り、エントリ画面が中途半端な
// 状態で表示されたり、認証が消える前後で意図しない遷移が発生する。
export function clearAllAuthState(): void {
  clearStoredAuth()
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(PIN_ROLE_KEY)
  }
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
