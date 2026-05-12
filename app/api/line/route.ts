import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { lineUserId } = await req.json()

    if (!lineUserId) {
      return NextResponse.json(
        { error: 'lineUserId is required' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where  : { lineUserId },
      include: { store: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません。管理者に登録を依頼してください。' },
        { status: 404 }
      )
    }

    if (user.role === 'pending') {
      return NextResponse.json(
        { error: '登録申請中です。管理者の承認をお待ちください。' },
        { status: 403 }
      )
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'アカウントが無効です。' },
        { status: 403 }
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