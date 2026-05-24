import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

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
    const products = await prisma.orderProduct.findMany({
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }, { productCode: 'asc' }],
    })
    return NextResponse.json(products.map((p) => ({
      id           : p.id,
      productCode  : p.productCode,
      productName  : p.productName,
      category     : p.category,
      price        : Number(p.price),
      availableDays: p.availableDays,
      isActive     : p.isActive,
      memo         : p.memo,
      displayOrder : p.displayOrder,
      lateOrderOk  : p.lateOrderOk,
    })))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const d = await req.json()
    if (!d.productCode || !d.productName || !d.category) {
      return NextResponse.json(
        { error: 'productCode/productName/category は必須です' },
        { status: 400 },
      )
    }

    const product = await prisma.orderProduct.create({
      data: {
        productCode  : d.productCode,
        productName  : d.productName,
        category     : d.category,
        price        : Number(d.price) || 0,
        availableDays: d.availableDays ?? '',
        memo         : d.memo ?? null,
        isActive     : d.isActive ?? true,
        lateOrderOk  : !!d.lateOrderOk,
      },
    })
    return NextResponse.json({ success: true, id: product.id })
  } catch (e: any) {
    console.error(e)
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { error: 'productCode は既に登録されています' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const d = await req.json()
    if (typeof d.id !== 'number') {
      return NextResponse.json({ error: 'id が不正です' }, { status: 400 })
    }

    await prisma.orderProduct.update({
      where: { id: d.id },
      data : {
        ...(d.productCode   !== undefined ? { productCode: d.productCode } : {}),
        ...(d.productName   !== undefined ? { productName: d.productName } : {}),
        ...(d.category      !== undefined ? { category: d.category } : {}),
        ...(d.price         !== undefined ? { price: Number(d.price) } : {}),
        ...(d.availableDays !== undefined ? { availableDays: d.availableDays } : {}),
        ...(d.memo          !== undefined ? { memo: d.memo } : {}),
        ...(d.isActive      !== undefined ? { isActive: d.isActive } : {}),
        ...(d.lateOrderOk   !== undefined ? { lateOrderOk: !!d.lateOrderOk } : {}),
      },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const id = Number(req.nextUrl.searchParams.get('id'))
    if (!id) {
      return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
    }

    await prisma.orderProduct.update({
      where: { id },
      data : { isActive: false },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
