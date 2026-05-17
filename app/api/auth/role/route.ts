import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import prisma from '@/lib/prisma'

const ALLOWED_ROLES = ['nishi', 'minami', 'hq1', 'hq2', 'hq3', 'all'] as const

export async function POST(req: NextRequest) {
  try {
    const { role } = await req.json()

    if (!role || !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 })
    }

    let user = await prisma.user.findFirst({
      where  : { role, isActive: true },
      include: { store: true },
      orderBy: { id: 'asc' },
    })

    // 該当 role が未登録なら all で代行（all は全ページ閲覧可）
    if (!user && role !== 'all') {
      user = await prisma.user.findFirst({
        where  : { role: 'all', isActive: true },
        include: { store: true },
        orderBy: { id: 'asc' },
      })
    }

    if (!user) {
      return NextResponse.json(
        { error: '該当ロールのユーザーが見つかりません (all も未登録)' },
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
      { expiresIn: '12h' }
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
