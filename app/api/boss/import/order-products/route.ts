import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

function requireBoss(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') return null
  return user
}

type Row = {
  productCode  : string
  productName  : string
  category     : string
  price        : string | number | null
  availableDays: string
  isActive     : boolean
  memo         : string | null
}

const DAY_CHARS = ['月', '火', '水', '木', '金', '土', '日']

// "月火水" / "月,火,水" / "月 火 水" のいずれも受けて "月,火,水" に正規化
function normalizeAvailableDays(input: string): string {
  if (!input) return ''
  const found: string[] = []
  for (const d of DAY_CHARS) {
    if (input.includes(d)) found.push(d)
  }
  return found.join(',')
}

export async function POST(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const { rows } = (await req.json()) as { rows: Row[] }
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows is required' }, { status: 400 })
    }

    const created: string[] = []
    const updated: string[] = []
    const skipped: { code: string; reason: string }[] = []

    for (const r of rows) {
      const code = (r.productCode || '').trim()
      const name = (r.productName || '').trim()
      if (!code) continue
      if (!name) {
        skipped.push({ code, reason: 'productName 空' })
        continue
      }

      const category = (r.category || '').trim()
      if (!category) {
        skipped.push({ code, reason: 'category 空' })
        continue
      }

      const price = r.price === '' || r.price == null ? 0 : Number(r.price) || 0
      const availableDays = normalizeAvailableDays(r.availableDays || '')
      const memo = (r.memo || '').trim() || null

      const existing = await prisma.orderProduct.findUnique({
        where: { productCode: code },
      })

      if (existing) {
        await prisma.orderProduct.update({
          where: { id: existing.id },
          data : {
            productName: name,
            category,
            price,
            availableDays,
            memo,
            isActive: r.isActive ?? true,
          },
        })
        updated.push(code)
      } else {
        await prisma.orderProduct.create({
          data: {
            productCode  : code,
            productName  : name,
            category,
            price,
            availableDays,
            memo,
            isActive     : r.isActive ?? true,
          },
        })
        created.push(code)
      }
    }

    return NextResponse.json({
      total       : rows.length,
      createdCount: created.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      skipped,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
