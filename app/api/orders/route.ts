import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

const STORE_BRANCHES = new Set(['nishi', 'minami', 'honbu'])
const HQ_ROLES = new Set(['hq1', 'hq2', 'hq3'])

function canAccessBranch(role: string, branch: string): boolean {
  if (role === 'all') return true
  if (branch === 'honbu') return role === 'honbu' || HQ_ROLES.has(role)
  return role === branch
}

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// 注文一覧取得
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const branch = req.nextUrl.searchParams.get('branch')
  if (!branch || !STORE_BRANCHES.has(branch)) {
    return NextResponse.json({ error: 'branch が不正です' }, { status: 400 })
  }
  if (!canAccessBranch(user.role, branch)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const store = await prisma.store.findUnique({
      where: { storeCode: branch },
    })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    const orders = await prisma.instoreOrder.findMany({
      where: {
        storeId     : store.id,
        status      : 'active',
        deliveryDate: { gte: today() },
      },
      include: { store: true, product: true },
      orderBy: { deliveryDate: 'asc' },
    })

    return NextResponse.json(orders.map((o) => ({
      id             : o.id,
      orderCode      : o.orderCode,
      deliveryDate   : o.deliveryDate,
      productId      : o.productId,
      productName    : o.productName,
      category       : o.category ?? o.product?.category ?? null,
      quantity       : Number(o.quantity),
      price          : Number(o.price) || (o.product ? Number(o.product.price) : 0),
      customerName   : o.customerName,
      phone          : o.phone,
      deliveryAddress: o.deliveryAddress,
      deliveryTime   : o.deliveryTime,
      receipt        : o.receipt,
      receiptName    : o.receiptName,
      purpose        : o.purpose,
      okazu          : o.okazu,
      notes          : o.notes,
      status         : o.status,
    })))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}

// 注文保存
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

    const orderDate = today()

    const store = await prisma.store.findUnique({
      where: { storeCode: branch },
    })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    const now       = new Date()
    const orderCode = 'ORD' +
      now.getFullYear().toString() +
      ('0' + (now.getMonth() + 1)).slice(-2) +
      ('0' + now.getDate()).slice(-2) +
      '_' + store.storeCode + '_' +
      ('0' + now.getHours()).slice(-2) +
      ('0' + now.getMinutes()).slice(-2) +
      ('0' + now.getSeconds()).slice(-2) +
      ('00' + now.getMilliseconds()).slice(-3) +
      Math.random().toString(36).slice(2, 6)

    const deliveryDate = new Date(data.deliveryDate)
    deliveryDate.setHours(0, 0, 0, 0)

    const order = await prisma.instoreOrder.create({
      data: {
        orderCode,
        orderDate,
        deliveryDate,
        storeId        : store.id,
        productId      : data.productId || null,
        productName    : data.productName,
        category       : data.category || null,
        quantity       : data.quantity,
        price          : data.price ?? 0,
        customerName   : data.customerName,
        phone          : data.phone,
        deliveryAddress: data.deliveryAddress,
        deliveryTime   : data.deliveryTime || null,
        receipt        : data.receipt || 'no',
        receiptName    : data.receiptName || null,
        purpose        : data.purpose || null,
        okazu          : data.okazu || null,
        notes          : data.notes || null,
        inputUser      : user.name,
        status         : 'active',
      },
    })

    return NextResponse.json({ success: true, orderId: order.id })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
