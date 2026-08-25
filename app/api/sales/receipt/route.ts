import { NextRequest, NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import { verifyToken } from '@/lib/auth'
import { todayJstYmd } from '@/lib/serverDate'

const STORE_BRANCHES = new Set(['nishi', 'minami', 'honbu'])
const MAX_BYTES = 8 * 1024 * 1024 // 8MB (クライアント側で圧縮済み前提の上限)

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  return role === branch
}

// レシート画像アップロード。実績(Sale)の receiptImageUrl には保存せず URL を返すだけ。
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
    const oldUrl = form.get('oldUrl')

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
    const pathname = `receipts/${branch}/${date}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const blob = await put(pathname, file, {
      access     : 'public',
      contentType: file.type,
    })

    // 差し替えの場合、古い画像は best-effort で削除(失敗しても新規アップロードは成功扱い)
    if (typeof oldUrl === 'string' && oldUrl) {
      del(oldUrl).catch(() => {})
    }

    return NextResponse.json({ url: blob.url })
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
    const { url, branch } = await req.json()
    if (!branch || !STORE_BRANCHES.has(branch)) {
      return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
    }
    if (!canAccessBranch(user.role, branch)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }
    if (typeof url !== 'string' || !url) {
      return NextResponse.json({ error: 'url が必要です' }, { status: 400 })
    }

    await del(url)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
