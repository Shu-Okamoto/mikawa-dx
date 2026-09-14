import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { replyMessage, fetchLineProfile } from '@/lib/line'
import {
  nippoClockUrl, nippoClockUrlForToken, nippoDailyReportUrl,
  freeePayrollUrl, freeeLoginId,
} from '@/lib/external-links'
import { todayJstYmd } from '@/lib/serverDate'

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || ''

const CLOCK_COMMAND = 'タイムカード'

// 給与明細は本人専用のタイムカード画面から辿る導線しかないため、
// 店舗共通 URL では代替できない(共通 URL を返しても本人の明細に行けない)。
const PAYSLIP_COMMAND = '給与明細'
const PAYSLIP_UNAVAILABLE =
  '給与明細は本人専用のタイムカードURLからご確認いただけます。\n' +
  'まだ発行されていないようですので、管理者に問い合わせてください。'

// freee の給与明細(Web明細)を直接開く。従業員ID = User.freeeId なので
// 日報システムへの問い合わせは不要。
const SALARY_COMMAND = '給料'
const SALARY_UNAVAILABLE =
  'freee連携IDが未登録のため、給与明細のURLを発行できません。\n' +
  '管理者に問い合わせてください。'

// 日報(nippo)側のスキーマ。
// 照合キー: dx.User.freeeId ↔ nippo.staff.freee_employee_id
const NIPPO_STAFF_KEY_COLUMN = 'freee_employee_id'

// nippo.staff_private から nippo.staff への外部キー(1対1)
const NIPPO_STAFF_PRIVATE_FK = 'staff_id'

// 店舗コードとして role をそのまま使えない役割。これらは所属店舗(User.storeId)が
// 設定されていればそれを使い、未設定なら個別 URL を作らない。
const NON_STORE_ROLES = new Set(['all', 'honbu', 'hq1', 'hq2', 'hq3', 'pending'])

interface RoleRoute {
  label: string
  path : string
  // 外部システム(日報/勤怠)への直リンク。path をそのまま使い、
  // baseUrl の付与も lineUserId によるログインも行わない。
  external?: boolean
}

// 店舗が特定できない役割に出す勤怠打刻リンク(店舗共通URL)
const CLOCK_COMMON_ROUTES: RoleRoute[] = [
  { label: '西のタイムカード', path: nippoClockUrl('nishi'),  external: true },
  { label: '南のタイムカード', path: nippoClockUrl('minami'), external: true },
]

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
    // 管理者・本部は所属店舗が決まっていないことがあるので、選べるよう両店舗を返す。
    // 所属店舗が設定してあれば buildClockRoutes がその店舗の案内に絞り込む。
    all   : CLOCK_COMMON_ROUTES,
    honbu : CLOCK_COMMON_ROUTES,
    hq1   : CLOCK_COMMON_ROUTES,
    hq2   : CLOCK_COMMON_ROUTES,
    hq3   : CLOCK_COMMON_ROUTES,
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
  '給与明細'    : '給与明細(本人専用)',
  '給料'       : '給与明細(freee)',
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

// 日報(nippo)側から本人ぶんの連携情報をまとめて引く。
// 従業員IDは nippo.staff、打刻トークンとログインIDは nippo.staff_private と
// テーブルが分かれているので 1 本のクエリで結合して取得する。
// 参照に失敗しても例外は投げず空を返し、呼び出し元がフォールバックする。
interface NippoStaffLinks {
  employeeId: string | null  // 給与明細URLの末尾に入る freee 従業員ID
  clockToken: string | null  // 勤怠打刻の個別URL用トークン
  loginId   : string | null  // 案内文に載せる freee ログインID
}

const NO_STAFF_LINKS: NippoStaffLinks = {
  employeeId: null, clockToken: null, loginId: null,
}

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim())
  return s || null
}

async function fetchNippoStaffLinks(freeeId: string): Promise<NippoStaffLinks> {
  const key = Prisma.raw(`"${NIPPO_STAFF_KEY_COLUMN}"`)
  const fk  = Prisma.raw(`"${NIPPO_STAFF_PRIVATE_FK}"`)
  try {
    // staff_private は 1 対 1 だが、未登録でも従業員IDは返したいので LEFT JOIN
    const rows = await prisma.$queryRaw<{
      employee_id: string | null
      clock_token: string | null
      freee_login_id: string | null
    }[]>(Prisma.sql`
      SELECT s.${key}::text AS employee_id,
             sp.clock_token,
             sp.freee_login_id
        FROM nippo.staff s
        LEFT JOIN nippo.staff_private sp ON sp.${fk}::text = s.id::text
       WHERE s.${key}::text = ${freeeId}
       LIMIT 1
    `)
    const row = rows[0]
    if (!row) return NO_STAFF_LINKS
    return {
      employeeId: str(row.employee_id),
      clockToken: str(row.clock_token),
      loginId   : str(row.freee_login_id),
    }
  } catch (e) {
    console.error('[nippo] staff / staff_private の参照に失敗しました', e)
    return NO_STAFF_LINKS
  }
}

// 個別 URL に使う店舗コード。店舗ロールは role がそのまま店舗コードになる
// (nishi / minami / 今後増える店舗)。管理者・本部など店舗を持たない役割は
// 所属店舗(User.storeId)が設定されていればそれを使う。
function clockBranch(role: string, storeCode: string | null): string | null {
  if (!NON_STORE_ROLES.has(role)) return role
  return storeCode || null
}

// 本人専用の打刻 URL。トークンだけで本人が特定できる(店舗は URL に入らない)ので、
// 条件は「freee 連携 ID 登録済み」かつ「clock_token あり」の 2 つだけ。
// 役割や所属店舗は問わないため、本部・管理者でも個別 URL を受け取れる。
async function personalClockUrl(freeeId: string | null): Promise<string | null> {
  if (!freeeId) return null
  const { clockToken } = await fetchNippoStaffLinks(freeeId)
  if (!clockToken) return null
  return nippoClockUrlForToken(clockToken)
}

// 勤怠打刻の案内を組み立てる。
// - 個別 URL あり: 店舗スタッフ・本部は個別 URL 1 本に差し替え、管理者(all)は
//   他店舗も見るので個別 URL を先頭に足して共通 URL も残す
// - 個別 URL なし: 店舗が特定できるなら(店舗ロール / 所属店舗設定済み)その店舗の
//   共通 URL 1 本、特定できないなら渡された共通 URL のまま
async function buildClockRoutes(
  routes: RoleRoute[], role: string, storeCode: string | null, freeeId: string | null,
): Promise<RoleRoute[]> {
  const url = await personalClockUrl(freeeId)
  if (url) {
    if (role === 'all') {
      return [{ label: '自分のタイムカード', path: url, external: true }, ...routes]
    }
    return [{ label: 'タイムカード', path: url, external: true }]
  }

  const branch = clockBranch(role, storeCode)
  if (branch && role !== 'all') {
    return [{ label: 'タイムカード', path: nippoClockUrl(branch), external: true }]
  }
  return routes
}

function buildCommandHelp(name: string, role: string): string {
  const lines: string[] = []
  for (const cmd of Object.keys(COMMAND_LABELS)) {
    // 給与明細・給料は ROUTES_BY_COMMAND を持たない(本人専用 URL のみ)ので個別に判定する
    // 本人専用 URL を返すコマンドは freee 連携 ID / トークンの有無で決まり、
    // ここでは判定できないので常に出す(未登録なら案内文が返る)
    const usable = cmd === PAYSLIP_COMMAND || cmd === SALARY_COMMAND
      ? true
      : Boolean(ROUTES_BY_COMMAND[cmd]?.[role])
    if (usable) lines.push(`「${cmd}」→ ${COMMAND_LABELS[cmd]}`)
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

    // freee の給与明細。当月ぶんを本人の従業員IDで開く
    if (messageText === SALARY_COMMAND) {
      if (!user || user.role === 'pending') {
        await replyMessage(replyToken,
          '未登録です。「登録」と送信してください。')
        continue
      }
      const freeeId = user.freeeId?.trim()
      if (!freeeId) {
        await replyMessage(replyToken, SALARY_UNAVAILABLE)
        continue
      }
      // URL 末尾は freee の従業員ID。日報側が持つ値を正とし、引けなければ
      // 照合キー(= 同じ値を入れている運用)をそのまま使う。
      const links = await fetchNippoStaffLinks(freeeId)
      const employeeId = links.employeeId ?? freeeId
      // 対象月は日本時間の当月
      const [y, m] = todayJstYmd().split('-')
      const url = freeePayrollUrl(employeeId, Number(y), Number(m))
      // ログインIDも日報側が正。未整備なら dx のログイン番号から組み立てる。
      const loginId = links.loginId
        ?? (user.freeeLoginNo != null ? freeeLoginId(user.freeeLoginNo) : null)
      const credentials = loginId
        ? `\n\nログインID: ${loginId}\nパスワード: ご自身で設定したもの`
        : ''
      await replyMessage(replyToken,
        `${user.name}さんの給与明細はこちらから確認できます。`
        + `（${Number(y)}年${Number(m)}月分）\n\n${url}${credentials}`
        + '\n\n※初めてご利用の場合は、ログインIDとパスワードの設定をお願いします。')
      continue
    }

    // 給与明細は本人専用 URL 前提なので、共通 URL へのフォールバックをしない
    if (messageText === PAYSLIP_COMMAND) {
      if (!user || user.role === 'pending') {
        await replyMessage(replyToken,
          '未登録です。「登録」と送信してください。')
        continue
      }
      const url = await personalClockUrl(user.freeeId)
      if (!url) {
        await replyMessage(replyToken, PAYSLIP_UNAVAILABLE)
        continue
      }
      await replyMessage(replyToken,
        `${user.name}さん\n以下のURLからアクセスしてください。\n\n`
        + `【給与明細】\n${url}\n\n`
        + '※タイムカード画面から給与明細に進めます。')
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
        ? await buildClockRoutes(
            routes, user.role, user.store?.storeCode ?? null, user.freeeId)
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
