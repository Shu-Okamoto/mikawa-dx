// 日本時間(JST)基準の「今日」を返すサーバー用ユーティリティ。
//
// 本番(Vercel)のサーバーは UTC で動くため、`new Date()` の getFullYear/
// getMonth/getDate や toISOString() はそのまま使うと UTC 暦日になり、
// JST の 0:00〜9:00（= UTC の前日 15:00〜24:00）は日付が前日にずれる。
// その結果「日付が朝9時に変わる」症状が出る。ここを一元化して防ぐ。
//
// DATE カラム(orderDate / saleDate 等)は UTC 0:00 として保持・比較されるため、
// todayJst() は「JST の暦日を UTC 0:00 の Date」で返す。これは各 API の
// parseDateParam('YYYY-MM-DD' → UTC 0:00) と同じ規約。

const JST = 'Asia/Tokyo'

/** JST の今日を 'YYYY-MM-DD' 文字列で返す */
export function todayJstYmd(): string {
  // en-CA ロケールは 'YYYY-MM-DD' 形式
  return new Date().toLocaleDateString('en-CA', { timeZone: JST })
}

/** JST の今日を UTC 0:00 の Date で返す（DATE カラムの保存/比較用） */
export function todayJst(): Date {
  return new Date(todayJstYmd() + 'T00:00:00Z')
}

/**
 * 現在時刻を「JST 壁時計の各フィールドを持つ Date」で返す。
 * getFullYear()/getMonth()/getDate()/getHours()... がそのまま JST 値になるので、
 * 既存のローカル日付演算（getDate()/setDate() 等）を JST 化したい箇所で使う。
 */
export function nowJst(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    hour12  : false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  // 24:00 を 0 に正規化（en-CA hour12:false は深夜を '24' で返す場合がある）
  const hour = get('hour') % 24
  return new Date(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
}
