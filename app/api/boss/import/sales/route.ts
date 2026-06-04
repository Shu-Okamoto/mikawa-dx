import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'

function requireBoss(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') return null
  return user
}

type Row = {
  date           : string
  store          : string
  amount         : string | number | null
  souzai         : string | number | null
  shipmentSouzai?: string | number | null
  mochi          : string | number | null
  hana           : string | number | null
  customer       : string | number | null
  weather        : string | null
}

const VALID_WEATHER = new Set(['晴', '曇', '雨', '雪'])

// "2024-01-15" / "2024/1/15" / "2024/01/15" / "1/15/2024" を YYYY-MM-DD に正規化。
// 不正な場合は null。
function parseDate(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  // YYYY-MM-DD or YYYY/M/D
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // M/D/YYYY (US 形式)
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) {
    const [, mo, d, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

function toNumber(v: string | number | null | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/[¥,\s]/g, '').trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

// CSV 1 セルを RFC 4180 風にエスケープ
function csvCell(v: string | number): string {
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// 既存 Sale を CSV (UTF-8 BOM 付き) で返す。Excel で文字化けしないよう先頭に BOM。
export async function GET(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') // YYYY-MM-DD (inclusive)
    const to   = searchParams.get('to')   // YYYY-MM-DD (inclusive)

    const where: { saleDate?: { gte?: Date; lte?: Date } } = {}
    if (from || to) {
      where.saleDate = {}
      if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
        where.saleDate.gte = new Date(`${from}T00:00:00`)
      }
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
        where.saleDate.lte = new Date(`${to}T23:59:59`)
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: { store: true },
      orderBy: [{ saleDate: 'asc' }, { storeId: 'asc' }],
    })

    const header = ['日付', '店', '天気', '売上', '客数', '惣菜', '惣菜出荷', '餅']
    const lines: string[] = [header.map(csvCell).join(',')]
    sales.forEach((s) => {
      const ymd = s.saleDate.toISOString().slice(0, 10)
      lines.push([
        ymd,
        s.store.storeName,
        s.weather ?? '',
        Number(s.amount),
        s.customerCount,
        Number(s.souzaiAmount),
        Number(s.shipmentSouzai),
        Number(s.mochiAmount),
      ].map(csvCell).join(','))
    })
    const body = '﻿' + lines.join('\r\n') + '\r\n'

    const today = new Date().toISOString().slice(0, 10)
    const filename = `sales_${today}.csv`

    return new NextResponse(body, {
      status : 200,
      headers: {
        'Content-Type'       : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
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

    // Store 一覧をキャッシュ (storeName / storeCode の両方で検索可能に)
    const stores = await prisma.store.findMany()
    const storeByKey = new Map<string, { id: number; storeName: string }>()
    stores.forEach((s) => {
      storeByKey.set(s.storeName, { id: s.id, storeName: s.storeName })
      storeByKey.set(s.storeCode, { id: s.id, storeName: s.storeName })
    })

    // 既存 (saleDate, storeId) をキャッシュしてスキップ判定を高速化
    const existing = await prisma.sale.findMany({
      select: { saleDate: true, storeId: true },
    })
    const existingKey = new Set<string>()
    existing.forEach((s) => {
      const ymd = s.saleDate.toISOString().slice(0, 10)
      existingKey.add(`${ymd}_${s.storeId}`)
    })

    let createdCount = 0
    const skipped: { code: string; reason: string }[] = []

    const toCreate: {
      saleDate      : Date
      storeId       : number
      amount        : number
      souzaiAmount  : number
      shipmentSouzai: number
      mochiAmount   : number
      hanaAmount    : number
      customerCount : number
      weather       : string | null
      inputUser     : string
    }[] = []

    rows.forEach((r, i) => {
      const rowLabel = `行${i + 1}`
      const dateStr = parseDate(r.date ?? '')
      if (!dateStr) {
        skipped.push({ code: rowLabel, reason: `日付が不正: "${r.date}"` })
        return
      }
      const storeKey = String(r.store ?? '').trim()
      const store    = storeByKey.get(storeKey)
      if (!store) {
        skipped.push({ code: `${rowLabel} ${dateStr}`,
          reason: `店舗が不明: "${storeKey}"` })
        return
      }
      const key = `${dateStr}_${store.id}`
      if (existingKey.has(key)) {
        skipped.push({ code: `${rowLabel} ${dateStr} ${store.storeName}`,
          reason: '既存データのためスキップ' })
        return
      }
      // 同一 CSV 内の重複も先勝ちでスキップ
      existingKey.add(key)
      const weatherRaw = (r.weather ?? '').trim()
      const weather    = VALID_WEATHER.has(weatherRaw) ? weatherRaw : null
      toCreate.push({
        saleDate      : new Date(`${dateStr}T00:00:00`),
        storeId       : store.id,
        amount        : toNumber(r.amount),
        souzaiAmount  : toNumber(r.souzai),
        shipmentSouzai: toNumber(r.shipmentSouzai),
        mochiAmount   : toNumber(r.mochi),
        hanaAmount    : toNumber(r.hana),
        customerCount : Math.round(toNumber(r.customer)),
        weather,
        inputUser     : 'import',
      })
    })

    if (toCreate.length > 0) {
      const res = await prisma.sale.createMany({
        data           : toCreate,
        skipDuplicates : true,
      })
      createdCount = res.count
    }

    return NextResponse.json({
      total       : rows.length,
      createdCount,
      updatedCount: 0,
      skippedCount: skipped.length,
      skipped,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
