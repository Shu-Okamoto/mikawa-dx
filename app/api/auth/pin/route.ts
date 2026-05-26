import { NextRequest, NextResponse } from 'next/server'

type PinRole = 'nishi' | 'minami' | 'hq1' | 'hq2' | 'hq3' | 'all'

const PIN_MAP: { env: string; role: PinRole }[] = [
  { env: 'PIN_NISHI',  role: 'nishi'  },
  { env: 'PIN_MINAMI', role: 'minami' },
  { env: 'PIN_HQ1',    role: 'hq1'    },
  { env: 'PIN_HQ2',    role: 'hq2'    },
  { env: 'PIN_HQ3',    role: 'hq3'    },
  { env: 'PIN_ALL',    role: 'all'    },
]

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PINは4桁の数字で入力してください' }, { status: 400 })
    }
    for (const { env, role } of PIN_MAP) {
      const expected = process.env[env]
      if (expected && pin === expected) {
        return NextResponse.json({ role })
      }
    }
    return NextResponse.json({ error: 'PINが正しくありません' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 })
  }
}
