// 店舗ごとの統一カラーパレット
// 西店: 黄緑系 / 南店: オレンジ系 / 本部: 青系

export interface StoreTheme {
  // ヘッダーグラデーション
  from   : string
  to     : string
  // 単色ボタン背景・濃いテキスト用
  accent : string
  // ライト背景（バッジ等）
  bg     : string
  // 濃い色テキスト
  text   : string
}

export const STORE_THEMES: Record<string, StoreTheme> = {
  nishi : { from: '#4E7D1A', to: '#7AB829', accent: '#639922', bg: '#EAF3DE', text: '#3B6D11' },
  minami: { from: '#C26617', to: '#F39C12', accent: '#E67E22', bg: '#FCEBDC', text: '#854F0B' },
  honbu : { from: '#1A5276', to: '#2980B9', accent: '#2980B9', bg: '#EBF5FB', text: '#1A5276' },
}

// 日本語店舗名 → branchCode のマップ
const NAME_TO_CODE: Record<string, string> = {
  '西店': 'nishi',
  '南店': 'minami',
  '本部': 'honbu',
}

export function themeForBranch(branchCode: string): StoreTheme {
  return STORE_THEMES[branchCode] ?? STORE_THEMES.honbu
}

export function themeForStoreName(storeName: string): StoreTheme {
  const code = NAME_TO_CODE[storeName]
  return code ? STORE_THEMES[code] : STORE_THEMES.honbu
}
