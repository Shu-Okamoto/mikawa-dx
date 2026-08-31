// 日報システム(nippo)側の画面URL。
// トップメニュー(app/page.tsx)と LINE の応答(api/line/webhook)の両方から参照するため、
// URL が変わったときの直し漏れが出ないようここに集約する。

const NIPPO_BASE = 'https://nippo-system-blue.vercel.app'

export type NippoBranch = 'nishi' | 'minami'

// 勤怠打刻(タイムカード)
export function nippoClockUrl(branch: NippoBranch): string {
  return `${NIPPO_BASE}/store/${branch}/clock`
}

// 日報(本日分)
export function nippoDailyReportUrl(branch: NippoBranch): string {
  return `${NIPPO_BASE}/store/${branch}/today`
}
