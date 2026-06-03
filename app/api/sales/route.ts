import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const STORE_BRANCHES = new Set(['nishi', 'minami', 'honbu'])
const VALID_WEATHER  = new Set(['晴', '曇', '雨', '雪'])

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  return role === branch
}

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// 売上取得（全店舗ぶん。キー: storeCode）
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const sales = await prisma.sale.findMany({
      where  : { saleDate: today() },
      include: { store: true },
    })

    const result: Record<string, any> = {}
    sales.forEach((s) => {
      result[s.store.storeCode] = {
        storeName     : s.store.storeName,
        amount        : Number(s.amount),
        souzai        : Number(s.souzaiAmount),
        mochi         : Number(s.mochiAmount),
        hana          : Number(s.hanaAmount),
        customerCount : s.customerCount,
        staffMorning  : Number(s.staffMorning),
        staffAfternoon: Number(s.staffAfternoon),
        weather       : s.weather ?? '',
        notes         : s.notes ?? '',
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
    const branch = data.branch

    if (!branch || !STORE_BRANCHES.has(branch)) {
      return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
    }
    if (!canAccessBranch(user.role, branch)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const store = await prisma.store.findUnique({
      where: { storeCode: branch },
    })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    const saleDate = today()

    // 天気: 晴/曇/雨/雪 のみ受け付ける。空文字や不明値は null。
    const weatherRaw = typeof data.weather === 'string' ? data.weather.trim() : ''
    const weather    = VALID_WEATHER.has(weatherRaw) ? weatherRaw : null

    const payload = {
      amount        : Number(data.amount)         || 0,
      souzaiAmount  : Number(data.souzai)         || 0,
      mochiAmount   : Number(data.mochi)          || 0,
      hanaAmount    : Number(data.hana)           || 0,
      customerCount : Number(data.customerCount)  || 0,
      staffMorning  : Number(data.staffMorning)   || 0,
      staffAfternoon: Number(data.staffAfternoon) || 0,
      weather,
      notes         : data.notes ?? null,
      inputUser     : user.name,
    }

    await prisma.sale.upsert({
      where : { saleDate_storeId: { saleDate, storeId: store.id } },
      update: payload,
      create: { saleDate, storeId: store.id, ...payload },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
