import { NextRequest, NextResponse } from 'next/server'
import { put, del, get } from '@vercel/blob'
import { verifyToken } from '@/lib/auth'
import { todayJstYmd } from '@/lib/serverDate'

const STORE_BRANCHES = new Set(['nishi', 'minami', 'honbu'])
const MAX_BYTES = 8 * 1024 * 1024 // 8MB (クライアント側で圧縮済み前提の上限)

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  return role === branch
}

// レシートは Blob ストアに access:'private' で保存する。private blob は URL を
// 知っていても直接は取得できないため、DB(Sale.receiptImageUrl)には URL ではなく
// pathname を保存し、閲覧は下の GET(認証あり)を通して配信する。
const RECEIPT_PREFIX = 'receipts/'

// pathname から店舗コードを取り出す (receipts/<branch>/<file>)。不正形式なら null。
function branchFromPathname(pathname: string): string | null {
  if (!pathname.startsWith(RECEIPT_PREFIX)) return null
  // '..' を含むパスなど、想定外の形は弾く
  if (pathname.includes('..')) return null
  const branch = pathname.slice(RECEIPT_PREFIX.length).split('/')[0]
  return STORE_BRANCHES.has(branch) ? branch : null
}

// レシート画像の配信。private blob なのでサーバー側で取得して認証済みユーザーにだけ返す。
// <img src> は Authorization ヘッダを送れないため、呼び出し側は authFetch で取得して
// objectURL 化して表示する。
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const pathname = req.nextUrl.searchParams.get('path')
  if (!pathname) {
    return NextResponse.json({ error: 'path が必要です' }, { status: 400 })
  }
  // 任意のパスを読み出せないよう、receipts/<有効な店舗>/ 配下だけに限定する
  const branch = branchFromPathname(pathname)
  if (!branch) {
    return NextResponse.json({ error: 'path が不正です' }, { status: 400 })
  }
  if (!canAccessBranch(user.role, branch)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const result = await get(pathname, { access: 'private' })
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
    }
    return new NextResponse(result.stream, {
      status : 200,
      headers: {
        'Content-Type' : result.blob.contentType || 'image/jpeg',
        // 認証済みユーザー個人向けのレスポンスなので共有キャッシュには載せない
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '画像の取得に失敗しました' }, { status: 500 })
  }
}

// レシート画像アップロード。実績(Sale)の receiptImageUrl には保存せず pathname を返すだけ。
// 保存は呼び出し元が /api/sales の POST で行う(他のフィールドと同じ 1 回の保存経路に統一するため)。
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const form   = await req.formData()
    const branch = String(form.get('branch') ?? '')
    const date   = String(form.get('date') ?? '') || todayJstYmd()
    const file   = form.get('file')
    const oldPath = form.get('oldPath')

    if (!branch || !STORE_BRANCHES.has(branch)) {
      return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
    }
    if (!canAccessBranch(user.role, branch)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '画像ファイルが必要です' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: '画像ファイルのみアップロードできます' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'ファイルサイズが大きすぎます(8MBまで)' }, { status: 400 })
    }

    const ext = file.type === 'image/png' ? 'png' : 'jpg'
    const pathname = `${RECEIPT_PREFIX}${branch}/${date}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const blob = await put(pathname, file, {
      access     : 'private',
      contentType: file.type,
    })

    // 差し替えの場合、古い画像は best-effort で削除(失敗しても新規アップロードは成功扱い)
    if (typeof oldPath === 'string' && oldPath && branchFromPathname(oldPath)) {
      del(oldPath).catch(() => {})
    }

    return NextResponse.json({ path: blob.pathname })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}

// レシート画像削除(差し替え無しでの単純削除用)
export async function DELETE(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { path } = await req.json()
    if (typeof path !== 'string' || !path) {
      return NextResponse.json({ error: 'path が必要です' }, { status: 400 })
    }
    const branch = branchFromPathname(path)
    if (!branch) {
      return NextResponse.json({ error: 'path が不正です' }, { status: 400 })
    }
    if (!canAccessBranch(user.role, branch)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    await del(path)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
