// 日報システム(nippo)側の画面URL。
// トップメニュー(app/page.tsx)と LINE の応答(api/line/webhook)の両方から参照するため、
// URL が変わったときの直し漏れが出ないようここに集約する。
//
// branch は店舗コード('nishi' / 'minami' ...)。店舗は今後増える可能性があるため、
// 特定の店舗に固定した型にはしない。

const NIPPO_BASE = 'https://nippo-system-blue.vercel.app'

// 勤怠打刻(タイムカード) 店舗共通URL
export function nippoClockUrl(branch: string): string {
  return `${NIPPO_BASE}/store/${branch}/clock`
}

// 勤怠打刻(タイムカード) 個人別URL。
// nippo.staff_private.clock_token を持っている人はこちらを案内する。
export function nippoClockUrlForToken(branch: string, clockToken: string): string {
  return `${NIPPO_BASE}/store/${branch}/clock/${encodeURIComponent(clockToken)}`
}

// 日報(本日分)
export function nippoDailyReportUrl(branch: string): string {
  return `${NIPPO_BASE}/store/${branch}/today`
}
