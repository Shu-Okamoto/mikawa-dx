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
// トークンだけで本人が特定できるため、店舗コードは URL に含まれない。
export function nippoClockUrlForToken(clockToken: string): string {
  return `${NIPPO_BASE}/clock/${encodeURIComponent(clockToken)}`
}

// 日報(本日分)
export function nippoDailyReportUrl(branch: string): string {
  return `${NIPPO_BASE}/store/${branch}/today`
}

// ---------------------------------------------------------------------------
// freee の給与明細(Web明細)
//
// URL の形:
//   https://p.secure.freee.co.jp/payroll_statements#/<事業所ID>/<年>/<月>/employees/<従業員ID>
//
// <従業員ID> は dx.User.freeeId(= nippo.staff_private.freee_employee_id)と同じ値。
// 月はゼロ埋めしない(9月なら 9)。閲覧には freee へのログインが必要なので、
// URL 自体を LINE で渡しても本人以外は中身を見られない。
// ---------------------------------------------------------------------------

const FREEE_PAYROLL_BASE = 'https://p.secure.freee.co.jp/payroll_statements'

// 事業所ID。freee 側で事業所が変わったときはここだけ直す。
const FREEE_COMPANY_ID = '1428569'

export function freeePayrollUrl(
  employeeId: string, year: number, month: number,
): string {
  return `${FREEE_PAYROLL_BASE}#/${FREEE_COMPANY_ID}/${year}/${month}`
    + `/employees/${encodeURIComponent(employeeId)}`
}

// freee のログインID。連番を 8 桁ゼロ埋めした形
// (例: 10 -> satonoajimikawa-00000010)。
const FREEE_LOGIN_PREFIX = 'satonoajimikawa-'

export function freeeLoginId(loginNo: number): string {
  return FREEE_LOGIN_PREFIX + String(loginNo).padStart(8, '0')
}
