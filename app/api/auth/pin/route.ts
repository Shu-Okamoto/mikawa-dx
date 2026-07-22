import { NextRequest, NextResponse } from 'next/server'

type PinRole = 'nishi' | 'minami' | 'honbu' | 'hq1' | 'hq2' | 'hq3' | 'all' | 'master'

const PIN_MAP: { env: string; role: PinRole; fallback?: string }[] = [
  { env: 'PIN_NISHI',  role: 'nishi'  },
  { env: 'PIN_MINAMI', role: 'minami' },
  { env: 'PIN_HONBU',  role: 'honbu'  },
  { env: 'PIN_HQ1',    role: 'hq1'    },
  { env: 'PIN_HQ2',    role: 'hq2'    },
  { env: 'PIN_HQ3',    role: 'hq3'    },
  { env: 'PIN_ALL',    role: 'all'    },
  // マスタ管理専用 PIN。未設定時は 0000 を既定値とする。
  { env: 'PIN_MASTER', role: 'master', fallback: '0000' },
  // マスタと同じ扱いの予備 PIN。未設定時は 9999 を既定値とする。
  { env: 'PIN_MASTER2', role: 'master', fallback: '9999' },
]

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PINは4桁の数字で入力してください' }, { status: 400 })
    }
    const configured: string[] = []
    for (const { env, role, fallback } of PIN_MAP) {
      const expected = process.env[env]?.trim() || fallback
      if (!expected) continue
      configured.push(env)
      if (pin === expected) {
        return NextResponse.json({ role })
      }
    }
    if (configured.length === 0) {
      console.error('[auth/pin] No PIN env vars configured')
      return NextResponse.json(
        { error: 'PIN環境変数が未設定です（再デプロイ要）' },
        { status: 500 }
      )
    }
    console.warn('[auth/pin] PIN mismatch. Configured:', configured.join(','))
    return NextResponse.json({ error: 'PINが正しくありません' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
