import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import prisma from '@/lib/prisma'

const ALLOWED_ROLES = ['nishi', 'minami', 'honbu', 'hq1', 'hq2', 'hq3', 'all'] as const

export async function POST(req: NextRequest) {
  try {
    const { role } = await req.json()

    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 })
    }

    const user = await prisma.user.findFirst({
      where  : { role, isActive: true },
      include: { store: true },
      orderBy: { id: 'asc' },
    })

    if (!user) {
      return NextResponse.json(
        { error: `該当ロール (${role}) のユーザーが登録されていません` },
        { status: 404 }
      )
    }

    const token = jwt.sign(
      {
        userId   : user.id,
        role     : user.role,
        store    : user.store?.storeCode,
        storeName: user.store?.storeName,
        category : user.category,
        name     : user.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      token,
      user: {
        id       : user.id,
        name     : user.name,
        role     : user.role,
        store    : user.store?.storeCode,
        storeName: user.store?.storeName,
        category : user.category,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
