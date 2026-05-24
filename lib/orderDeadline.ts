// オリジナル商品の注文締切ロジック
// 営業日: 月〜土（日曜のみ休）
// 通常商品: 配達日の「前々営業日 12:00」
// 前営業日17時OK商品 (lateOrderOk=true): 配達日の「前営業日 17:00」

function isBusinessDay(d: Date): boolean {
  return d.getDay() !== 0 // 日曜のみ非営業
}

function prevBusinessDay(d: Date): Date {
  const out = new Date(d)
  do {
    out.setDate(out.getDate() - 1)
  } while (!isBusinessDay(out))
  return out
}

/**
 * 配達日から注文締切時刻を返す。
 * @param deliveryDate 配達日 (時刻無視、その日の 00:00 として扱う)
 * @param lateOk       true なら前営業日17時 / false (デフォルト) なら前々営業日12時
 */
export function orderDeadline(deliveryDate: Date | string, lateOk: boolean): Date {
  const d = typeof deliveryDate === 'string'
    ? parseLocalDate(deliveryDate)
    : new Date(deliveryDate)
  d.setHours(0, 0, 0, 0)

  if (lateOk) {
    const dl = prevBusinessDay(d)
    dl.setHours(17, 0, 0, 0)
    return dl
  } else {
    const dl = prevBusinessDay(prevBusinessDay(d))
    dl.setHours(12, 0, 0, 0)
    return dl
  }
}

/**
 * 配達日が現時点で注文受付可能か判定。
 */
export function canOrderFor(deliveryDate: Date | string, lateOk: boolean, now: Date = new Date()): boolean {
  return now <= orderDeadline(deliveryDate, lateOk)
}

// 'YYYY/MM/DD' or 'YYYY-MM-DD' をローカル時刻 00:00 の Date に
function parseLocalDate(s: string): Date {
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!m) return new Date(s)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
