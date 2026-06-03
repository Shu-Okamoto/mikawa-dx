import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { pushMessage } from '@/lib/line'
import prisma from '@/lib/prisma'

const VALID_ROLES = new Set([
  'pending', 'nishi', 'minami', 'honbu', 'hq1', 'hq2', 'hq3', 'all',
])

const ACTIVE_ROLES = new Set([
  'nishi', 'minami', 'honbu', 'hq1', 'hq2', 'hq3', 'all',
])

function requireBoss(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') return null
  return user
}

export async function GET(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const users = await prisma.user.findMany({
      include: { store: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json(users.map((u) => ({
      id         : u.id,
      name       : u.name,
      email      : u.email,
      role       : u.role,
      lineUserId : u.lineUserId,
      displayName: u.displayName,
      pictureUrl : u.pictureUrl,
      isActive   : u.isActive,
      storeCode  : u.store?.storeCode ?? null,
      storeName  : u.store?.storeName ?? null,
      createdAt  : u.createdAt,
    })))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const { id, role, isActive } = await req.json()
    if (typeof id !== 'number') {
      return NextResponse.json({ error: 'id が不正です' }, { status: 400 })
    }
    if (role !== undefined && !VALID_ROLES.has(role)) {
      return NextResponse.json({ error: 'role が不正です' }, { status: 400 })
    }

    const before = await prisma.user.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
    }

    const updated = await prisma.user.update({
      where: { id },
      data : {
        ...(role !== undefined ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })

    // pending → 有効 role への変更時は本人に LINE 通知
    const becameActive =
      before.role === 'pending' &&
      role !== undefined &&
      ACTIVE_ROLES.has(role)

    if (becameActive && updated.lineUserId) {
      await pushMessage(updated.lineUserId,
        `${updated.name}さん、承認されました。\n「メニュー」と送信してください。`)
    }

    return NextResponse.json({ success: true, notified: becameActive })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
