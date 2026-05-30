// 信頼する外部システムのホスト名一覧。
// ここに含まれるホスト名から遷移してきた場合、PIN画面を経由せず
// autoLoginRole で自動ログインする。

export const HONBU_TRUSTED_REFERRERS = [
  'soozai-system.onrender.com',
  'sozai.satonoaji-mikawa.net',
]

// soozai-system の週間献立表ページへの外部リンク URL。
// 実際のパスが違う場合はここを書き換えてください。
export const SOOZAI_WEEKLY_MENU_URL = 'https://sozai.satonoaji-mikawa.net/weekly-menu'
