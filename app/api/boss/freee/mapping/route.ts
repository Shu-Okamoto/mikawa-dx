import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { freeeConfig, listAccountItems } from '@/lib/freee'

// DX の売上項目と freee の勘定科目の対応。
// key は 'sales:<店舗コード>'(売上高・貸方) / 'cash' / 'paypay' / 'voucher'(借方)。

function requireBoss(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || user.role !== 'all') return null
  return user
}

export async function GET(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const cfg = freeeConfig()
  try {
    const [stores, mapping] = await Promise.all([
      prisma.store.findMany({ orderBy: { id: 'asc' } }),
      prisma.freeeMapping.findMany(),
    ])

    // 未連携・未設定なら科目一覧は取れないが、画面は出せるようにする
    let accountItems: { id: string; name: string; defaultTaxCode: number | null }[] = []
    let accountsError: string | null = null
    if (cfg) {
      try {
        accountItems = await listAccountItems(cfg)
      } catch (e) {
        accountsError = e instanceof Error ? e.message : '科目一覧を取得できませんでした'
      }
    }

    return NextResponse.json({
      configured: !!cfg,
      stores    : stores.map((s) => ({ storeCode: s.storeCode, storeName: s.storeName })),
      accountItems,
      accountsError,
      mapping   : mapping.map((m) => ({
        key: m.key, accountId: m.accountId, accountName: m.accountName, taxCode: m.taxCode,
      })),
    })
  } catch (e) {
    console.error('[freee] マッピングの取得に失敗しました', e)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!requireBoss(req)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  try {
    const { entries } = await req.json()
    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: 'entries が必要です' }, { status: 400 })
    }

    for (const e of entries) {
      const key = typeof e?.key === 'string' ? e.key.trim() : ''
      if (!key) continue
      const accountId = typeof e.accountId === 'string' ? e.accountId.trim() : ''
      // 空欄は「割り当てなし」として削除する
      if (!accountId) {
        await prisma.freeeMapping.deleteMany({ where: { key } })
        continue
      }
      const data = {
        accountId,
        accountName: typeof e.accountName === 'string' ? e.accountName : '',
        taxCode    : Number.isInteger(e.taxCode) ? e.taxCode as number : null,
      }
      await prisma.freeeMapping.upsert({
        where : { key },
        update: data,
        create: { key, ...data },
      })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[freee] マッピングの保存に失敗しました', e)
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}
