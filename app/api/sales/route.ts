import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

// 売上取得
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const sales = await prisma.sale.findMany({
      where   : { saleDate: today },
      include : { store: true },
    })

    // 店舗別に整形
    const result: Record<string, any> = {}
    sales.forEach((s) => {
      result[s.store.storeName] = {
        amount        : Number(s.amount),
        souzai        : Number(s.souzaiAmount),
        mochi         : Number(s.mochiAmount),
        hana          : Number(s.hanaAmount),
        customerCount : s.customerCount,
        staffMorning  : s.staffMorning,
        staffAfternoon: s.staffAfternoon,
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// 売上保存
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const data = await req.json()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const store = await prisma.store.findUnique({
      where: { storeCode: user.store },
    })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    await prisma.sale.upsert({
      where : { saleDate_storeId: { saleDate: today, storeId: store.id } },
      update: {
        amount        : data.amount         || 0,
        souzaiAmount  : data.souzai         || 0,
        mochiAmount   : data.mochi          || 0,
        hanaAmount    : data.hana           || 0,
        customerCount : data.customerCount  || 0,
        staffMorning  : data.staffMorning   || 0,
        staffAfternoon: data.staffAfternoon || 0,
        inputUser     : user.name,
      },
      create: {
        saleDate      : today,
        storeId       : store.id,
        amount        : data.amount         || 0,
        souzaiAmount  : data.souzai         || 0,
        mochiAmount   : data.mochi          || 0,
        hanaAmount    : data.hana           || 0,
        customerCount : data.customerCount  || 0,
        staffMorning  : data.staffMorning   || 0,
        staffAfternoon: data.staffAfternoon || 0,
        inputUser     : user.name,
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}