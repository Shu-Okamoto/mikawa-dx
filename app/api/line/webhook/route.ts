import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { replyMessage, fetchLineProfile } from '@/lib/line'
import {
  nippoClockUrl, nippoClockUrlForToken, nippoDailyReportUrl,
} from '@/lib/external-links'

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || ''

const CLOCK_COMMAND = 'タイムカード'

// nippo.staff_private 側で freee 連携 ID を保持している列名。
// ★ 実際の列名に合わせてここだけ直せばよい。列名が違っても実害は出ず、
//   個別 URL を諦めて店舗共通 URL にフォールバックする(下の catch)。
const NIPPO_FREEE_ID_COLUMN = 'freee_id'

interface RoleRoute {
  label: string
  path : string
  // 外部システム(日報/勤怠)への直リンク。path をそのまま使い、
  // baseUrl の付与も lineUserId によるログインも行わない。
  external?: boolean
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
  'タイムカード': {
    nishi : [{ label: 'タイムカード', path: nippoClockUrl('nishi'),  external: true }],
    minami: [{ label: 'タイムカード', path: nippoClockUrl('minami'), external: true }],
    all   : [
      { label: '西のタイムカード', path: nippoClockUrl('nishi'),  external: true },
      { label: '南のタイムカード', path: nippoClockUrl('minami'), external: true },
    ],
  },
  '日報': {
    nishi : [{ label: '日報', path: nippoDailyReportUrl('nishi'),  external: true }],
    minami: [{ label: '日報', path: nippoDailyReportUrl('minami'), external: true }],
    all   : [
      { label: '西の日報', path: nippoDailyReportUrl('nishi'),  external: true },
      { label: '南の日報', path: nippoDailyReportUrl('minami'), external: true },
    ],
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
  '発注'      : '発注入力',
  '注文'      : '商品注文',
  'カレンダー'  : 'カレンダー',
  '売上'      : '売上入力',
  'タイムカード': '勤怠打刻',
  '日報'      : '日報入力',
  'hq'        : '本部画面',
  'boss'      : 'ボス画面',
}

const SESSION_COMMANDS = new Set(['ログイン', 'メニュー'])

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
    // 外部システムは自前のログインを持つので、URL をそのまま案内する
    if (r.external) return `【${r.label}】\n${r.path}`
    const sep = r.path.includes('?') ? '&' : '?'
    return `【${r.label}】\n${baseUrl}${r.path}${sep}lineUserId=${lineUserId}`
  })
  // 有効時間の注記は lineUserId 付きの自システム URL にだけ意味がある
  const note = routes.some((r) => !r.external) ? '\n\n※有効時間: 12時間' : ''
  return `${name}さん\n以下のURLからアクセスしてください。\n\n${lines.join('\n\n')}${note}`
}

// freee 連携 ID から nippo.staff_private の clock_token を引く。
// 見つからない/テーブルや列が未整備などの場合は null を返し、呼び出し元は
// 店舗共通 URL にフォールバックする(勤怠打刻の案内自体は必ず返せるようにする)。
async function fetchClockToken(freeeId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ clock_token: string | null }[]>(Prisma.sql`
      SELECT clock_token
        FROM nippo.staff_private
       WHERE ${Prisma.raw(`"${NIPPO_FREEE_ID_COLUMN}"`)}::text = ${freeeId}
       LIMIT 1
    `)
    const token = rows[0]?.clock_token
    const trimmed = typeof token === 'string' ? token.trim() : ''
    return trimmed || null
  } catch (e) {
    console.error('[timecard] nippo.staff_private の参照に失敗しました', e)
    return null
  }
}

// 勤怠打刻の案内を個人別 URL に差し替える。
// 差し替える条件は「店舗ロール(= all 以外)」かつ「freee 連携 ID 登録済み」かつ
// 「clock_token あり」。1 つでも欠ければ渡された店舗共通 URL のまま返す。
// role がそのまま店舗コード(nishi / minami / 今後増える店舗)になる。
async function personalizeClockRoutes(
  routes: RoleRoute[], role: string, freeeId: string | null,
): Promise<RoleRoute[]> {
  if (role === 'all' || !freeeId) return routes
  const token = await fetchClockToken(freeeId)
  if (!token) return routes
  return [{
    label   : 'タイムカード',
    path    : nippoClockUrlForToken(role, token),
    external: true,
  }]
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
      // 勤怠打刻だけは、本人の clock_token があれば個人別 URL に差し替える
      const finalRoutes = messageText === CLOCK_COMMAND
        ? await personalizeClockRoutes(routes, user.role, user.freeeId)
        : routes
      await replyMessage(replyToken,
        buildUrlListMessage(user.name, finalRoutes, lineUserId, baseUrl))
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
