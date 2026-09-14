const LINE_API = 'https://api.line.me/v2/bot'

function token() {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
}

// メッセージ下部に出るタップ用ボタン。clipboard アクションは押すと
// clipboardText を端末のクリップボードへコピーする(ログインID の貼り付け用)。
export interface ClipboardAction {
  type         : 'clipboard'
  label        : string   // 20 文字まで
  clipboardText: string   // 1000 文字まで
}

export async function replyMessage(
  replyToken: string,
  text      : string,
  actions  ?: ClipboardAction[],
) {
  const message: Record<string, unknown> = { type: 'text', text }
  if (actions?.length) {
    message.quickReply = {
      items: actions.map((action) => ({ type: 'action', action })),
    }
  }

  const res = await fetch(`${LINE_API}/message/reply`, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${token()}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [message],
    }),
  })
  if (!res.ok) {
    console.error('LINE replyMessage failed:', res.status, await res.text())
  }
}

export async function pushMessage(toUserId: string, text: string) {
  const res = await fetch(`${LINE_API}/message/push`, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${token()}`,
    },
    body: JSON.stringify({
      to      : toUserId,
      messages: [{ type: 'text', text }],
    }),
  })
  if (!res.ok) {
    console.error('LINE pushMessage failed:', res.status, await res.text())
    return false
  }
  return true
}

export async function fetchLineProfile(lineUserId: string) {
  const res = await fetch(`${LINE_API}/profile/${lineUserId}`, {
    headers: { 'Authorization': `Bearer ${token()}` },
  })
  if (!res.ok) return null
  return res.json() as Promise<{ displayName?: string; pictureUrl?: string }>
}
