import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
      },
      include: { vendor: true },
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }, { productCode: 'asc' }],
    })

    return NextResponse.json(products)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}