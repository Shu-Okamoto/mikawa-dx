import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/prisma'

const CHANNEL_SECRET       = process.env.LINE_CHANNEL_SECRET || ''
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''

async function replyMessage(replyToken: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })
}

async function fetchLineProfile(lineUserId: string) {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
    headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` },
  })
  if (!res.ok) return null
  return res.json() as Promise<{ displayName?: string; pictureUrl?: string }>
}

function verifySignature(body: string, signature: string | null): boolean {
  if (!signature || !CHANNEL_SECRET) return false
  const hash = crypto.createHmac('sha256', CHANNEL_SECRET)
    .update(body)
    .digest('base64')
  return hash === signature
}

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('x-line-signature')

  if (!verifySignature(body, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const { events } = JSON.parse(body) as { events: any[] }

  for (const event of events || []) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue

    const replyToken  = event.replyToken as string
    const lineUserId  = event.source?.userId as string | undefined
    const messageText = (event.message.text as string).trim()

    if (!lineUserId || !replyToken) continue

    const user = await prisma.user.findUnique({
      where  : { lineUserId },
      include: { store: true },
    })

    if (messageText === '登録') {
      if (user) {
        await replyMessage(replyToken,
          'すでに登録されています。「ログイン」と送信してください。')
        continue
      }
      const profile = await fetchLineProfile(lineUserId)
      await prisma.user.create({
        data: {
          name       : profile?.displayName || '未設定',
          role       : 'pending',
          lineUserId,
          displayName: profile?.displayName,
          pictureUrl : profile?.pictureUrl,
        },
      })
      await replyMessage(replyToken,
        '登録申請を受け付けました。管理者の承認をお待ちください。')
    } else if (
      messageText === 'ログイン' ||
      messageText === 'メニュー' ||
      messageText === '発注' ||
      messageText === '注文' ||
      messageText === 'カレンダー' ||
      messageText === '売上'
    ) {
      if (!user || user.role === 'pending') {
        await replyMessage(replyToken,
          '未登録です。「登録」と送信してください。')
        continue
      }

      const baseUrl = process.env.NEXT_PUBLIC_API_URL

      // メッセージ別のページマッピング
      const pageByMessage: Record<string, Record<string, string>> = {
        '発注'    : { store: '/store', hq: '/hq', boss: '/boss' },
        '注文'    : { order: '/order' },
        'カレンダー': { calendar: '/calendar' },
        '売上'    : { store: '/store' },
      }

      // role別のデフォルトページ
      const pageByRole: Record<string, string> = {
        store   : '/store',
        hq      : '/hq',
        boss    : '/boss',
        order   : '/order',
        calendar: '/calendar',
      }

      let page = pageByRole[user.role] || '/'

      // メッセージ指定がある場合は権限チェック
      if (pageByMessage[messageText]) {
        const allowed = pageByMessage[messageText]
        if (allowed[user.role]) {
          page = allowed[user.role]
        } else {
          await replyMessage(replyToken,
            'この機能へのアクセス権限がありません。')
          continue
        }
      }

      const url = `${baseUrl}${page}?lineUserId=${lineUserId}`
      await replyMessage(replyToken,
        `${user.name}さん\n以下のURLからアクセスしてください。\n\n${url}\n\n※有効時間: 12時間`)
    } else {
      if (user && user.role !== 'pending') {
        await replyMessage(replyToken,
          `${user.name}さん\n以下のコマンドが使えます。\n\n` +
          `「発注」→ 発注入力\n` +
          `「注文」→ 惣菜注文\n` +
          `「カレンダー」→ 注文カレンダー\n` +
          `「売上」→ 売上入力\n` +
          `「メニュー」→ メイン画面`)
      } else {
        await replyMessage(replyToken, '「登録」と送信してください。')
      }
    }
  }

  return NextResponse.json({ ok: true })
}
