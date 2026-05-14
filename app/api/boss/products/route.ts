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
    const products = await prisma.product.findMany({
      include: { vendor: true },
      orderBy: [{ category: 'asc' }, { productCode: 'asc' }],
    })
    return NextResponse.json(products.map((p) => ({
      id         : p.id,
      productCode: p.productCode,
      productName: p.productName,
      category   : p.category,
      unit       : p.unit,
      weeklyAvg  : Number(p.weeklyAvg),
      vendorId   : p.vendorId,
      vendorName : p.vendor?.vendorName ?? null,
      isActive   : p.isActive,
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
    if (!d.productCode || !d.productName || !d.category || !d.unit) {
      return NextResponse.json(
        { error: 'productCode/productName/category/unit は必須です' },
        { status: 400 },
      )
    }

    const product = await prisma.product.create({
      data: {
        productCode: d.productCode,
        productName: d.productName,
        category   : d.category,
        unit       : d.unit,
        weeklyAvg  : Number(d.weeklyAvg) || 0,
        vendorId   : d.vendorId ?? null,
        isActive   : d.isActive ?? true,
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

    await prisma.product.update({
      where: { id: d.id },
      data : {
        ...(d.productCode !== undefined ? { productCode: d.productCode } : {}),
        ...(d.productName !== undefined ? { productName: d.productName } : {}),
        ...(d.category    !== undefined ? { category: d.category } : {}),
        ...(d.unit        !== undefined ? { unit: d.unit } : {}),
        ...(d.weeklyAvg   !== undefined ? { weeklyAvg: Number(d.weeklyAvg) } : {}),
        ...(d.vendorId    !== undefined ? { vendorId: d.vendorId } : {}),
        ...(d.isActive    !== undefined ? { isActive: d.isActive } : {}),
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

    // 物理削除は関連データを壊すので非アクティブ化に倒す
    await prisma.product.update({
      where: { id },
      data : { isActive: false },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
