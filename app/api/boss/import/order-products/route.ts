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

// CSV 1 セルを RFC 4180 風にエスケープ
function csvCell(v: string | number | boolean): string {
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// 既存 OrderProduct を CSV (UTF-8 BOM 付き) で返す。インポート機能と同じ列構成なので
// そのまま再インポート(バックアップからの復元や一括編集)に使える。
export async function GET(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const orderProducts = await prisma.orderProduct.findMany({
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }, { productCode: 'asc' }],
    })

    const header = ['ProductID', 'ProductName', 'Category', 'Price', 'AvailableDays', 'Active', 'Memo']
    const lines: string[] = [header.map(csvCell).join(',')]
    orderProducts.forEach((p) => {
      lines.push([
        p.productCode,
        p.productName,
        p.category,
        Number(p.price),
        p.availableDays,
        p.isActive,
        p.memo ?? '',
      ].map(csvCell).join(','))
    })
    const body = '﻿' + lines.join('\r\n') + '\r\n'

    return new NextResponse(body, {
      status : 200,
      headers: {
        'Content-Type'       : 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="order-products.csv"',
      },
    })
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
    const { rows } = (await req.json()) as { rows: Row[] }
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows is required' }, { status: 400 })
    }

    const created: string[] = []
    const updated: string[] = []
    const skipped: { code: string; reason: string }[] = []

    // 表示順(displayOrder)を CSV の並び順に合わせる。カテゴリごとに CSV の
    // 出現順で連番を振り直す(/boss/order-products 等は category → displayOrder の順で表示するため)。
    const displayOrderByCategory = new Map<string, number>()

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

      const displayOrder = (displayOrderByCategory.get(category) ?? 0) + 1
      displayOrderByCategory.set(category, displayOrder)

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
            displayOrder,
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
            displayOrder,
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
