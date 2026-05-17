import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

function requireBoss(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') return null
  return user
}

type Row = {
  productCode : string
  productName : string
  category    : string
  unit        : string
  weeklyAvg   : string | number | null
  vendorName  : string | null
  isActive    : boolean
}

// CSV の category → DB category
const CATEGORY_MAP: Record<string, string> = {
  '菓子類': '餅・乾物菓子類',
}

function mapCategory(c: string): string {
  return CATEGORY_MAP[c] ?? c
}

function nextVendorCode(existing: string[]): string {
  let max = 0
  for (const code of existing) {
    const m = /^V(\d+)$/.exec(code)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return 'V' + String(max + 1).padStart(3, '0')
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

    const created: string[]  = []
    const updated: string[]  = []
    const skipped: { code: string; reason: string }[] = []
    const vendorsCreated: string[] = []

    // Vendor 解決: CSV 内のユニークな vendorName を抽出
    const wantedVendors = Array.from(new Set(
      rows.map((r) => (r.vendorName || '').trim()).filter(Boolean),
    ))

    const vendorMap = new Map<string, number>() // vendorName → id
    if (wantedVendors.length > 0) {
      const found = await prisma.vendor.findMany({
        where : { vendorName: { in: wantedVendors } },
        select: { id: true, vendorName: true },
      })
      for (const v of found) vendorMap.set(v.vendorName, v.id)

      const missing = wantedVendors.filter((n) => !vendorMap.has(n))
      if (missing.length > 0) {
        const allCodes = await prisma.vendor.findMany({ select: { vendorCode: true } })
        const codes: string[] = allCodes.map((v: { vendorCode: string }) => v.vendorCode)
        for (const name of missing) {
          const code = nextVendorCode(codes)
          codes.push(code)
          const created = await prisma.vendor.create({
            data: { vendorCode: code, vendorName: name },
          })
          vendorMap.set(name, created.id)
          vendorsCreated.push(`${code} / ${name}`)
        }
      }
    }

    for (const r of rows) {
      const code = (r.productCode || '').trim()
      const name = (r.productName || '').trim()
      if (!code) { continue } // 完全空行は静かに skip
      if (!name) {
        skipped.push({ code, reason: 'productName 空' })
        continue
      }

      const category = mapCategory((r.category || '').trim())
      if (!category) {
        skipped.push({ code, reason: 'category 空' })
        continue
      }

      const unit = (r.unit || '').trim() || '個'
      const weeklyAvg = r.weeklyAvg === '' || r.weeklyAvg == null
        ? 0
        : Number(r.weeklyAvg) || 0

      const vendorId = r.vendorName
        ? vendorMap.get(r.vendorName.trim()) ?? null
        : null

      const existing = await prisma.product.findUnique({ where: { productCode: code } })

      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data : {
            productName: name,
            category,
            unit,
            weeklyAvg,
            vendorId,
            isActive: r.isActive ?? true,
          },
        })
        updated.push(code)
      } else {
        await prisma.product.create({
          data: {
            productCode: code,
            productName: name,
            category,
            unit,
            weeklyAvg,
            vendorId,
            isActive: r.isActive ?? true,
          },
        })
        created.push(code)
      }
    }

    return NextResponse.json({
      total         : rows.length,
      createdCount  : created.length,
      updatedCount  : updated.length,
      skippedCount  : skipped.length,
      skipped,
      vendorsCreated,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
