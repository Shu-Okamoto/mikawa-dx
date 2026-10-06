// 氏名の末尾につけられた敬称を取り除く。
//
// 注文入力では「様」を付けて入力されることが多く、そのまま保存すると
// 一覧や印刷で「山田様 様」のように二重敬称になるため、保存時に落とす。
//
// 「さん」「ちゃん」は人名の一部と区別できない(例: 商店さん)ので対象にしない。
// 取り除いた結果が空になる場合は、元の入力をそのまま返す(氏名を失わせない)。

const HONORIFIC_SUFFIX = /(?:[\s　]*(?:様|さま|サマ|御中|殿|どの))+$/

export function stripHonorific(name: string): string {
  const trimmed = name.trim()
  const stripped = trimmed.replace(HONORIFIC_SUFFIX, '').trim()
  return stripped || trimmed
}
