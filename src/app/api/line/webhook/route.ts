import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/prisma'

function verifySignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET!)
    .update(body)
    .digest('base64')
  return hash === signature
}

async function replyMessage(replyToken: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-line-signature') || ''

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const data = JSON.parse(body)
  const events = data.events || []

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue

    const lineUserId  = event.source.userId
    const replyToken  = event.replyToken
    const messageText = event.message.text.trim()

    const user = await prisma.user.findUnique({
      where  : { lineUserId },
      include: { store: true },
    })

    if (messageText === '登録') {
      if (user) {
        await replyMessage(replyToken,
          `${user.name}さん、登録済みです。\nロール: ${user.role}\n店舗: ${user.store?.storeName || '本部'}`)
      } else {
        await prisma.user.create({
          data: {
            name      : '未登録ユーザー',
            role      : 'pending',
            lineUserId: lineUserId,
          },
        })
        await replyMessage(replyToken,
          '登録リクエストを受け付けました。\n管理者が設定完了後にご利用いただけます。')
      }
    } else if (messageText === 'ログイン' || messageText === 'メニュー') {
      if (!user || user.role === 'pending') {
        await replyMessage(replyToken, '未登録です。「登録」と送信してください。')
        continue
      }
      const baseUrl = process.env.NEXT_PUBLIC_API_URL
      const token   = Buffer.from(lineUserId + ':' + Date.now()).toString('base64')
      const url     = `${baseUrl}/auth/line?token=${token}&uid=${lineUserId}`
      await replyMessage(replyToken, `ログインURL:\n${url}\n\n有効時間: 5分`)
    } else {
      if (user && user.role !== 'pending') {
        await replyMessage(replyToken,
          `${user.name}さん\n「ログイン」または「メニュー」と送信してください。`)
      } else {
        await replyMessage(replyToken, '「登録」と送信してください。')
      }
    }
  }

  return NextResponse.json({ ok: true })
}