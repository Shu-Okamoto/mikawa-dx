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
    const vendors = await prisma.vendor.findMany({
      orderBy: [{ category: 'asc' }, { vendorCode: 'asc' }],
    })
    return NextResponse.json(vendors)
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
    if (!d.vendorCode || !d.vendorName) {
      return NextResponse.json(
        { error: 'vendorCode/vendorName は必須です' },
        { status: 400 },
      )
    }

    const vendor = await prisma.vendor.create({
      data: {
        vendorCode : d.vendorCode,
        vendorName : d.vendorName,
        category   : d.category    ?? null,
        contactName: d.contactName ?? null,
        phone      : d.phone       ?? null,
        memo       : d.memo        ?? null,
      },
    })
    return NextResponse.json({ success: true, id: vendor.id })
  } catch (e: any) {
    console.error(e)
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { error: 'vendorCode は既に登録されています' },
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

    await prisma.vendor.update({
      where: { id: d.id },
      data : {
        ...(d.vendorCode  !== undefined ? { vendorCode: d.vendorCode } : {}),
        ...(d.vendorName  !== undefined ? { vendorName: d.vendorName } : {}),
        ...(d.category    !== undefined ? { category: d.category } : {}),
        ...(d.contactName !== undefined ? { contactName: d.contactName } : {}),
        ...(d.phone       !== undefined ? { phone: d.phone } : {}),
        ...(d.memo        !== undefined ? { memo: d.memo } : {}),
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

    await prisma.vendor.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error(e)
    if (e?.code === 'P2003' || e?.code === 'P2014') {
      return NextResponse.json(
        { error: '関連商品があるため削除できません' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
