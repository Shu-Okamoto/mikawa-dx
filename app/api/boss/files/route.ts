import { NextRequest, NextResponse } from 'next/server'
import { list } from '@vercel/blob'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

// レシート画像のファイルボックス一覧。
//
// 画像は private blob なので、ここではメタ情報(pathname / サイズ / 日時)だけを返し、
// 実体の配信は従来どおり認証付きの /api/sales/receipt?path=... が担う。
//
// blob の pathname は receipts/<店舗コード>/<YYYY-MM-DD>-<連番>.jpg なので、
// 店舗コードと日付はパスから読み取れる。実績(Sale)側にも receiptImageUrl があるため、
// 突き合わせて「どの日の実績に紐づいているか」も返す(紐づきの無いファイルは
// 差し替えで取り残されたものなので、画面側で区別できるようにする)。

const RECEIPT_PREFIX = 'receipts/'

interface FileEntry {
  path      : string
  branch    : string
  size      : number
  uploadedAt: string
  // パスから読み取った対象日 ('YYYY-MM-DD')。読めなければ null
  date      : string | null
  // この画像を参照している実績があるか
  linked    : boolean
}

function parsePath(pathname: string): { branch: string; date: string | null } | null {
  if (!pathname.startsWith(RECEIPT_PREFIX)) return null
  const rest = pathname.slice(RECEIPT_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const branch = rest.slice(0, slash)
  const file   = rest.slice(slash + 1)
  const m = /^(\d{4}-\d{2}-\d{2})-/.exec(file)
  return { branch, date: m ? m[1] : null }
}

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const stores = await prisma.store.findMany({ orderBy: { id: 'asc' } })
    const storeByCode = new Map(stores.map((s) => [s.storeCode, s.storeName]))

    // 実績に紐づいている pathname を集めておく
    const linkedRows = await prisma.sale.findMany({
      where : { receiptImageUrl: { not: null } },
      select: { receiptImageUrl: true },
    })
    const linked = new Set(
      linkedRows.map((r) => r.receiptImageUrl).filter((v): v is string => !!v),
    )

    // 1000 件を超える場合に備えてカーソルを辿る
    const files: FileEntry[] = []
    let cursor: string | undefined
    do {
      const page = await list({ prefix: RECEIPT_PREFIX, cursor, limit: 1000 })
      for (const b of page.blobs) {
        const parsed = parsePath(b.pathname)
        if (!parsed) continue
        files.push({
          path      : b.pathname,
          branch    : parsed.branch,
          size      : b.size,
          uploadedAt: b.uploadedAt.toISOString(),
          date      : parsed.date,
          linked    : linked.has(b.pathname),
        })
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)

    // 新しいものから
    files.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))

    // 画面のフォルダ(タブ)。実際にファイルがある店舗は、マスタに無くても出す
    const codes = new Set<string>(stores.map((s) => s.storeCode))
    files.forEach((f) => codes.add(f.branch))

    return NextResponse.json({
      files,
      branches: [...codes].map((code) => ({
        storeCode: code,
        storeName: storeByCode.get(code) ?? code,
        count    : files.filter((f) => f.branch === code).length,
      })),
    })
  } catch (e) {
    console.error('[files] レシート一覧の取得に失敗しました', e)
    const reason = e instanceof Error ? e.message : ''
    return NextResponse.json(
      { error: reason ? `一覧の取得に失敗しました: ${reason}` : '一覧の取得に失敗しました' },
      { status: 500 },
    )
  }
}
