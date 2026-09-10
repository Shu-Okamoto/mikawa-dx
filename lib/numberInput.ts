// 手入力された数値文字列を数値に変換するためのヘルパー。
//
// `<input type="number">` はブラウザ側のサニタイズ規則により「妥当な浮動小数点数
// でない入力」を value='' として返す。日本語キーボードから全角数字(１２３)を入力
// すると value が空文字になり、画面には数字が見えているのに 0 として保存される、
// という事故が起きる。価格などの入力欄は type="text" + inputMode="numeric" にし、
// 保存時にこの関数で正規化する。
export function normalizeNumericInput(input: string): string {
  return input
    // 全角数字 → 半角
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    // 全角ピリオド/句点 → 小数点
    .replace(/[．。]/g, '.')
    // 各種ダッシュ → マイナス
    .replace(/[ー−―‐]/g, '-')
    // 桁区切り・通貨記号・空白は無視する
    .replace(/[,，、\s¥￥円]/g, '')
}

// 数値として解釈できない場合は fallback(既定 0)を返す。
export function parseNumberInput(input: string, fallback = 0): number {
  const s = normalizeNumericInput(input)
  if (!s) return fallback
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}
