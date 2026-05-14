import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/prisma'

const CHANNEL_SECRET       = process.env.LINE_CHANNEL_SECRET || ''
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''

interface RoleRoute {
  label: string
  path : string
}

const ROUTES_BY_COMMAND: Record<string, Record<string, RoleRoute[]>> = {
  '発注': {
    nishi : [{ label: '発注', path: '/store/nishi' }],
    minami: [{ label: '発注', path: '/store/minami' }],
    all   : [
      { label: '西の発注', path: '/store/nishi' },
      { label: '南の発注', path: '/store/minami' },
    ],
  },
  '注文': {
    nishi : [{ label: '注文', path: '/order/nishi' }],
    minami: [{ label: '注文', path: '/order/minami' }],
    all   : [
      { label: '西の注文', path: '/order/nishi' },
      { label: '南の注文', path: '/order/minami' },
    ],
  },
  'カレンダー': {
    nishi : [{ label: 'カレンダー', path: '/calendar' }],
    minami: [{ label: 'カレンダー', path: '/calendar' }],
    hq1   : [{ label: 'カレンダー', path: '/calendar' }],
    hq2   : [{ label: 'カレンダー', path: '/calendar' }],
    hq3   : [{ label: 'カレンダー', path: '/calendar' }],
    all   : [{ label: 'カレンダー', path: '/calendar' }],
  },
  '売上': {
    nishi : [{ label: '売上', path: '/store/nishi' }],
    minami: [{ label: '売上', path: '/store/minami' }],
    all   : [
      { label: '西の売上', path: '/store/nishi' },
      { label: '南の売上', path: '/store/minami' },
    ],
  },
  'hq': {
    hq1: [{ label: '本部', path: '/hq?category=hq1' }],
    hq2: [{ label: '本部', path: '/hq?category=hq2' }],
    hq3: [{ label: '本部', path: '/hq?category=hq3' }],
    all: [{ label: '本部', path: '/hq' }],
  },
  'boss': {
    all: [{ label: 'ボス画面', path: '/boss' }],
  },
}

const DEFAULT_ROUTES: Record<string, RoleRoute[]> = {
  nishi : [{ label: 'メイン', path: '/store/nishi' }],
  minami: [{ label: 'メイン', path: '/store/minami' }],
  hq1   : [{ label: '本部',   path: '/hq?category=hq1' }],
  hq2   : [{ label: '本部',   path: '/hq?category=hq2' }],
  hq3   : [{ label: '本部',   path: '/hq?category=hq3' }],
  all   : [{ label: 'ボス画面', path: '/boss' }],
}

const COMMAND_LABELS: Record<string, string> = {
  '発注'    : '発注入力',
  '注文'    : '商品注文',
  'カレンダー': 'カレンダー',
  '売上'    : '売上入力',
  'hq'      : '本部画面',
  'boss'    : 'ボス画面',
}

const SESSION_COMMANDS = new Set(['ログイン', 'メニュー'])

async function replyMessage(replyToken: string, text: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
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
  if (!res.ok) {
    console.error('LINE replyMessage failed:', res.status, await res.text())
  }
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
  if (hash.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
}

function buildUrlListMessage(
  name      : string,
  routes    : RoleRoute[],
  lineUserId: string,
  baseUrl   : string,
): string {
  const lines = routes.map((r) => {
    const sep = r.path.includes('?') ? '&' : '?'
    return `【${r.label}】\n${baseUrl}${r.path}${sep}lineUserId=${lineUserId}`
  })
  return `${name}さん\n以下のURLからアクセスしてください。\n\n${lines.join('\n\n')}\n\n※有効時間: 12時間`
}

function buildCommandHelp(name: string, role: string): string {
  const lines: string[] = []
  for (const cmd of Object.keys(COMMAND_LABELS)) {
    if (ROUTES_BY_COMMAND[cmd][role]) {
      lines.push(`「${cmd}」→ ${COMMAND_LABELS[cmd]}`)
    }
  }
  lines.push('「メニュー」→ メイン画面')
  return `${name}さん\n以下のコマンドが使えます。\n\n${lines.join('\n')}`
}

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('x-line-signature')

  if (!verifySignature(body, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  let parsed: { events?: any[] }
  try {
    parsed = JSON.parse(body)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const events  = parsed.events ?? []
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''

  for (const event of events) {
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
      if (user && user.role !== 'pending') {
        await replyMessage(replyToken, `${user.name}さんは既に登録済みです。`)
        continue
      }
      if (user && user.role === 'pending') {
        await replyMessage(replyToken,
          '登録申請中です。管理者の承認をお待ちください。')
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
      continue
    }

    if (SESSION_COMMANDS.has(messageText)) {
      if (!user || user.role === 'pending') {
        await replyMessage(replyToken,
          '未登録です。「登録」と送信してください。')
        continue
      }
      const routes = DEFAULT_ROUTES[user.role]
      if (!routes) {
        await replyMessage(replyToken,
          'アクセス可能なページがありません。管理者に問い合わせてください。')
        continue
      }
      await replyMessage(replyToken,
        buildUrlListMessage(user.name, routes, lineUserId, baseUrl))
      continue
    }

    if (ROUTES_BY_COMMAND[messageText]) {
      if (!user || user.role === 'pending') {
        await replyMessage(replyToken,
          '未登録です。「登録」と送信してください。')
        continue
      }
      const routes = ROUTES_BY_COMMAND[messageText][user.role]
      if (!routes) {
        await replyMessage(replyToken,
          'この機能へのアクセス権限がありません。')
        continue
      }
      await replyMessage(replyToken,
        buildUrlListMessage(user.name, routes, lineUserId, baseUrl))
      continue
    }

    if (user && user.role !== 'pending') {
      await replyMessage(replyToken, buildCommandHelp(user.name, user.role))
    } else {
      await replyMessage(replyToken, '「登録」と送信してください。')
    }
  }

  return NextResponse.json({ ok: true })
}
