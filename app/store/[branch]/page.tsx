'use client'

import {
  useEffect, useState, useCallback, useMemo, Suspense, use,
} from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { themeForBranch, type StoreTheme } from '@/lib/storeColors'
import { HONBU_TRUSTED_REFERRERS } from '@/lib/trusted-referrers'

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>

interface Product {
  id          : number
  productCode : string
  productName : string
  category    : string
  unit        : string
  weeklyAvg   : number
}

interface OrderState {
  status    : string | null
  qty       : string
  customName: string
}

interface SentItem {
  productId  : number | string
  productName: string
  category   : string
  unit       : string
  status     : string
  qty        : number | string
}

interface SentCategory {
  submittedAt: string
  orders     : SentItem[]
}

interface SalesData {
  amount        : string
  souzai        : string
  mochi         : string
  hana          : string
  customerCount : string
  staffMorning  : string
  staffAfternoon: string
}

type Screen = 'catselect' | 'input' | 'sales' | 'submitted' | 'weekly'

interface BranchOrder {
  productId  : number | string
  productName: string
  category   : string
  unit       : string
  status     : string
  qty        : number | string
}

const FONT_STACK = "'BIZ UDPGothic', -apple-system, 'Hiragino Sans', 'Yu Gothic', sans-serif"

const VALID_BRANCHES = new Set(['nishi', 'minami', 'honbu'])
const BRANCH_LABELS: Record<string, string> = {
  nishi : '西店',
  minami: '南店',
  honbu : '本部',
}

const CAT_ICONS: Record<string, string> = {
  '野菜'          : '🥬',
  '果物'          : '🍎',
  '餅・乾物菓子類': '🍘',
  '実績'          : '💰',
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

const EMPTY_SALES: SalesData = {
  amount: '', souzai: '', mochi: '', hana: '',
  customerCount: '', staffMorning: '', staffAfternoon: '',
}

const STAFF_OPTIONS = ['2', '2.5', '3', '3.5', '4', '4.5', '5']

function todayJpLabel(d: Date) {
  return `${d.getMonth() + 1}月${d.getDate()}日(${DAY_NAMES[d.getDay()]})`
}

function StorePageContent({ branch }: { branch: string }) {
  const router = useRouter()
  const { user, loading, error, authFetch, logout } = useAuth(
    ['nishi', 'minami', 'honbu', 'all'],
    {
      autoLoginRole   : VALID_BRANCHES.has(branch) ? branch : undefined,
      // honbu のみ、信頼ホスト(惣菜システム等)からの遷移は
      // PIN/既存トークンを無視して honbu で自動ログイン。
      trustedReferrers: branch === 'honbu' ? HONBU_TRUSTED_REFERRERS : undefined,
    },
  )

  const [products, setProducts]     = useState<Product[]>([])
  const [orderState, setOrderState] = useState<Record<number | string, OrderState>>({})
  const [memoByCat, setMemoByCat]   = useState<Record<string, string>>({})
  const [tempIds, setTempIds]       = useState<Record<string, string[]>>({}) // cat → tempId[]
  const [tempCounter, setTempCounter] = useState(0)
  const [sentByCat, setSentByCat]   = useState<Record<string, SentCategory>>({})
  const [sales, setSales]           = useState<SalesData>(EMPTY_SALES)
  const [salesSent, setSalesSent]   = useState<SentCategory | null>(null)
  const [screen, setScreen]         = useState<Screen>('catselect')
  const [currentCat, setCurrentCat] = useState<string>('')
  const [busy, setBusy]             = useState(false)
  const [toast, setToast]           = useState('')

  // 不正な branch / 権限なし branch を弾く
  useEffect(() => {
    if (loading || error || !user) return
    if (!VALID_BRANCHES.has(branch)) { router.replace('/'); return }
    if (user.role !== 'all' && user.role !== branch) { router.replace('/') }
  }, [branch, user, loading, error, router])

  const today        = useMemo(() => new Date(), [])
  const todayDay     = DAY_NAMES[today.getDay()]
  const branchLabel  = BRANCH_LABELS[branch] ?? branch
  const requiredCats = useMemo<string[]>(() => {
    const base = ['野菜', '果物']
    if (todayDay === '水') base.push('餅・乾物菓子類')
    return base
  }, [todayDay])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // 初回ロード: 商品 + 既存注文 + 既存売上
  const fetchAll = useCallback(async () => {
    if (!user) return
    const [prodRes, ordRes, salesRes] = await Promise.all([
      authFetch('/api/products'),
      authFetch(`/api/daily-orders?branch=${branch}`),
      authFetch('/api/sales'),
    ])
    const prodData  = await prodRes.json()
    const ordData   = await ordRes.json()
    const salesData = await salesRes.json()

    setProducts(prodData)

    // 既存注文を sent + orderState に反映
    const init: Record<number | string, OrderState> = {}
    prodData.forEach((p: Product) => {
      init[p.id] = { status: null, qty: '', customName: '' }
    })

    const ordersByCat: Record<string, SentItem[]> = {}
    if (ordData.orders) {
      ordData.orders.forEach((o: any) => {
        init[o.productId] = {
          status: o.status,
          qty   : o.requestQty != null ? String(o.requestQty) : '',
          customName: '',
        }
        const cat = o.product?.category
        if (!cat) return
        if (!ordersByCat[cat]) ordersByCat[cat] = []
        ordersByCat[cat].push({
          productId  : o.productId,
          productName: o.product.productName,
          category   : cat,
          unit       : o.product.unit,
          status     : o.status || '―',
          qty        : Number(o.requestQty) || 0,
        })
      })
    }

    const memoInit: Record<string, string> = {}
    if (ordData.memos) {
      ordData.memos.forEach((m: { category: string; memo: string }) => {
        memoInit[m.category] = m.memo
      })
    }

    const sentInit: Record<string, SentCategory> = {}
    const cats = new Set<string>([...Object.keys(ordersByCat), ...Object.keys(memoInit)])
    cats.forEach((cat) => {
      const orders = ordersByCat[cat] || []
      const memo   = memoInit[cat]
      const allOrders = memo
        ? [...orders, { productId: `MEMO_${cat}`, productName: memo, category: cat,
                        unit: '', status: 'MEMO', qty: 0 }]
        : orders
      if (allOrders.length > 0) sentInit[cat] = { submittedAt: '', orders: allOrders }
    })

    setOrderState(init)
    setMemoByCat(memoInit)
    setSentByCat(sentInit)

    // 売上
    const s = salesData?.[branch]
    if (s) {
      const sd: SalesData = {
        amount        : s.amount         ? String(s.amount)         : '',
        souzai        : s.souzai         ? String(s.souzai)         : '',
        mochi         : s.mochi          ? String(s.mochi)          : '',
        hana          : s.hana           ? String(s.hana)           : '',
        customerCount : s.customerCount  ? String(s.customerCount)  : '',
        staffMorning  : s.staffMorning   ? String(s.staffMorning)   : '',
        staffAfternoon: s.staffAfternoon ? String(s.staffAfternoon) : '',
      }
      setSales(sd)
      setSalesSent({ submittedAt: '', orders: buildSalesOrders(sd) })
    }
  }, [user, branch, authFetch])

  useEffect(() => {
    if (!loading && !error) fetchAll()
  }, [loading, error, fetchAll])

  function buildSalesOrders(s: SalesData): SentItem[] {
    const yen = (v: string) => '¥' + (Number(v) || 0).toLocaleString()
    return [
      { productId: 's1', productName: '売上金額',  category: '実績', unit: '', status: yen(s.amount),        qty: '' },
      { productId: 's2', productName: '惣菜売上',  category: '実績', unit: '', status: yen(s.souzai),        qty: '' },
      { productId: 's3', productName: '餅売上',    category: '実績', unit: '', status: yen(s.mochi),         qty: '' },
      { productId: 's4', productName: '花売上',    category: '実績', unit: '', status: yen(s.hana),          qty: '' },
      { productId: 's5', productName: '客数',      category: '実績', unit: '', status: (Number(s.customerCount) || 0) + '人', qty: '' },
      { productId: 's6', productName: '出勤前半',  category: '実績', unit: '', status: (s.staffMorning   || '-') + '人', qty: '' },
      { productId: 's7', productName: '出勤後半',  category: '実績', unit: '', status: (s.staffAfternoon || '-') + '人', qty: '' },
    ]
  }

  const onCatSelected = (cat: string) => {
    setCurrentCat(cat)
    if (cat === '実績') {
      if (salesSent) setScreen('submitted')
      else setScreen('sales')
    } else {
      if (sentByCat[cat]) setScreen('submitted')
      else setScreen('input')
    }
  }

  const backToCatSelect = () => { setScreen('catselect'); setCurrentCat('') }

  const showWeekly = () => { setScreen('weekly') }

  const setStatus = (id: number | string, status: string) => {
    setOrderState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { status: null, qty: '', customName: '' }),
              status: prev[id]?.status === status ? null : status },
    }))
  }
  const setQty = (id: number | string, qty: string) => {
    setOrderState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { status: null, qty: '', customName: '' }), qty },
    }))
  }
  const setCustomName = (id: string, customName: string) => {
    setOrderState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { status: null, qty: '', customName: '' }), customName },
    }))
  }

  const addTempItem = (cat: string) => {
    const tempId = `temp_${cat}_${tempCounter + 1}`
    setTempCounter((c) => c + 1)
    setTempIds((prev) => ({ ...prev, [cat]: [...(prev[cat] || []), tempId] }))
    setOrderState((prev) => ({
      ...prev,
      [tempId]: { status: null, qty: '', customName: '' },
    }))
  }

  const removeTempItem = (cat: string, tempId: string) => {
    setTempIds((prev) => ({
      ...prev,
      [cat]: (prev[cat] || []).filter((id) => id !== tempId),
    }))
    setOrderState((prev) => {
      const next = { ...prev }
      delete next[tempId]
      return next
    })
  }

  // 送信
  const submitCategory = async (cat: string) => {
    setBusy(true)
    const catProducts = products.filter((p) => p.category === cat)
    const orders: SentItem[] = []

    for (const p of catProducts) {
      const st = orderState[p.id]
      if (!st) continue
      const include =
        st.status === '〇' || st.status === '△' || st.status === '×' ||
        (st.qty && Number(st.qty) >= 0 && st.qty !== '')
      if (!include) continue
      orders.push({
        productId  : p.id,
        productName: p.productName,
        category   : cat,
        unit       : p.unit,
        status     : st.status || '―',
        qty        : st.qty || 0,
      })
    }

    // +追加 アイテム
    for (const tempId of tempIds[cat] || []) {
      const st = orderState[tempId]
      if (!st) continue
      const include = st.status || (st.qty && st.qty !== '')
      if (!include) continue
      orders.push({
        productId  : tempId,
        productName: st.customName || '(無題)',
        category   : cat,
        unit       : '個',
        status     : st.status || '―',
        qty        : st.qty || 0,
      })
    }

    const memo = (memoByCat[cat] || '').trim()
    if (orders.length === 0 && !memo) {
      setBusy(false)
      showToast('送信する項目がありません')
      return
    }

    const res = await authFetch('/api/daily-orders', {
      method: 'POST',
      body  : JSON.stringify({ branch, category: cat, orders, memo }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok || !data.success) {
      showToast('エラー: ' + (data.error ?? '不明'))
      return
    }
    // 送信後の sent 状態を更新
    const allOrders = [...orders]
    if (memo) {
      allOrders.push({
        productId: `MEMO_${cat}`, productName: memo, category: cat,
        unit: '', status: 'MEMO', qty: 0,
      })
    }
    setSentByCat((prev) => ({ ...prev, [cat]: { submittedAt: data.submittedAt || '', orders: allOrders } }))
    setScreen('submitted')
    showToast(cat + ' を送信しました')
  }

  const submitSales = async () => {
    setBusy(true)
    const res = await authFetch('/api/sales', {
      method: 'POST',
      body  : JSON.stringify({ branch, ...sales }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok || !data.success) {
      showToast('エラー: ' + (data.error ?? '不明'))
      return
    }
    setSalesSent({ submittedAt: '', orders: buildSalesOrders(sales) })
    setScreen('submitted')
    showToast('実績を登録しました')
  }

  // ===== render =====
  if (loading) return <Centered>読み込み中...</Centered>
  if (error)   return <ErrorBox msg={error} onBack={() => router.push('/')} />

  const dateLabel = todayJpLabel(today)

  return (
    <div style={{
      fontFamily: FONT_STACK, background: '#F5F1EA',
      minHeight: '100vh', paddingBottom: '40px', color: '#2C2C2A',
    }}>
      <Header dateLabel={dateLabel} nameLabel={`${branchLabel} · ${user?.name ?? ''}`}
        onLogout={logout} theme={themeForBranch(branch)} />

      {screen === 'catselect' && (
        <CatSelectScreen
          requiredCats={requiredCats}
          sentByCat={sentByCat}
          salesSent={salesSent}
          onSelect={onCatSelected}
          onShowWeekly={showWeekly}
        />
      )}

      {screen === 'weekly' && (
        <WeeklyScreen
          authFetch={authFetch}
          branch={branch}
          onBack={backToCatSelect}
        />
      )}

      {screen === 'input' && currentCat && currentCat !== '実績' && (
        <InputScreen
          cat={currentCat}
          products={products.filter((p) => p.category === currentCat)}
          orderState={orderState}
          memoByCat={memoByCat}
          tempIds={tempIds[currentCat] || []}
          onBack={backToCatSelect}
          setStatus={setStatus}
          setQty={setQty}
          setCustomName={setCustomName}
          setMemo={(v) => setMemoByCat((prev) => ({ ...prev, [currentCat]: v }))}
          addTempItem={() => addTempItem(currentCat)}
          removeTempItem={(id) => removeTempItem(currentCat, id)}
          onSubmit={() => submitCategory(currentCat)}
          busy={busy}
        />
      )}

      {screen === 'sales' && (
        <SalesScreen
          sales={sales}
          setSales={setSales}
          onBack={backToCatSelect}
          onSubmit={submitSales}
          busy={busy}
        />
      )}

      {screen === 'submitted' && currentCat && (
        <SubmittedScreen
          cat={currentCat}
          info={currentCat === '実績' ? salesSent! : sentByCat[currentCat]}
          isSales={currentCat === '実績'}
          onBack={backToCatSelect}
          onEdit={() => setScreen(currentCat === '実績' ? 'sales' : 'input')}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: '90px', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(44,44,42,.9)', color: 'white',
          padding: '10px 20px', borderRadius: '20px', fontSize: '13px',
          zIndex: 100, whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}
    </div>
  )
}

// ====================================================================
// Sub-components
// ====================================================================

function Header({
  dateLabel, nameLabel, onLogout, theme,
}: { dateLabel: string; nameLabel: string; onLogout: () => void; theme: StoreTheme }) {
  return (
    <div style={{
      background: `linear-gradient(135deg,${theme.from},${theme.to})`,
      color: 'white', padding: '20px 16px 16px',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '13px', opacity: .8, marginBottom: '3px' }}>本日の発注入力</div>
          <div style={{ fontSize: '24px', fontWeight: 500, marginBottom: '2px' }}>{dateLabel}</div>
          <div style={{ fontSize: '13px', opacity: .9 }}>{nameLabel}</div>
        </div>
        <button onClick={onLogout} style={{
          padding: '8px 14px', background: 'rgba(255,255,255,.2)',
          border: '1.5px solid rgba(255,255,255,.6)', borderRadius: '10px',
          color: 'white', fontSize: '13px', cursor: 'pointer',
          fontFamily: 'inherit', marginTop: '4px',
        }}>終了する</button>
      </div>
    </div>
  )
}

function CatSelectScreen({
  requiredCats, sentByCat, salesSent, onSelect, onShowWeekly,
}: {
  requiredCats : string[]
  sentByCat    : Record<string, SentCategory>
  salesSent    : SentCategory | null
  onSelect     : (cat: string) => void
  onShowWeekly : () => void
}) {
  const all = [...requiredCats, '実績']
  return (
    <div style={{ padding: '16px' }}>
      <div style={{ padding: '0 0 8px', fontSize: '13px', color: '#888780' }}>
        カテゴリを選んで入力・送信してください
      </div>
      {all.map((cat) => {
        const isSent = cat === '実績' ? !!salesSent : !!sentByCat[cat]
        return (
          <div key={cat}
            onClick={() => onSelect(cat)}
            style={{
              background  : isSent ? '#FAFEF6' : 'white',
              borderRadius: '16px', padding: '18px 20px',
              marginBottom: '12px',
              boxShadow   : '0 2px 8px rgba(0,0,0,.04)',
              display     : 'flex', alignItems: 'center', justifyContent: 'space-between',
              border      : `2px solid ${isSent ? '#639922' : '#E5E1D8'}`,
              cursor      : 'pointer',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '32px' }}>{CAT_ICONS[cat] || '📦'}</span>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 500, marginBottom: '2px' }}>{cat}</div>
                <div style={{
                  fontSize: '12px',
                  color: isSent ? '#3B6D11' : '#888780',
                  fontWeight: isSent ? 500 : 400,
                }}>
                  {isSent ? '✅ 登録済み' : '未登録'}
                </div>
              </div>
            </div>
            <button style={{
              padding: '10px 18px', borderRadius: '10px', fontSize: '18px',
              fontWeight: 500, border: isSent ? '1.5px solid #639922' : 'none',
              background: isSent ? '#EAF3DE' : '#2C2C2A',
              color    : isSent ? '#3B6D11' : 'white',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {isSent ? '確認・修正' : '入力する'}
            </button>
          </div>
        )
      })}

      {/* 週間表示カード */}
      <div onClick={onShowWeekly} style={{
        background  : '#FAFAFA',
        borderRadius: '16px', padding: '18px 20px',
        marginBottom: '12px',
        boxShadow   : '0 2px 8px rgba(0,0,0,.04)',
        display     : 'flex', alignItems: 'center', justifyContent: 'space-between',
        border      : '2px solid #E5E1D8',
        cursor      : 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '32px' }}>📊</span>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 500, marginBottom: '2px' }}>週間表示</div>
            <div style={{ fontSize: '12px', color: '#888780' }}>今週の発注状況を一覧</div>
          </div>
        </div>
        <button style={{
          padding: '10px 18px', borderRadius: '10px', fontSize: '18px',
          fontWeight: 500, border: '1.5px solid #E5E1D8',
          background: '#F5F1EA', color: '#888780',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>閲覧する</button>
      </div>
    </div>
  )
}

function InputScreen({
  cat, products, orderState, memoByCat, tempIds,
  onBack, setStatus, setQty, setCustomName, setMemo, addTempItem, removeTempItem,
  onSubmit, busy,
}: {
  cat        : string
  products   : Product[]
  orderState : Record<number | string, OrderState>
  memoByCat  : Record<string, string>
  tempIds    : string[]
  onBack     : () => void
  setStatus  : (id: number | string, status: string) => void
  setQty     : (id: number | string, qty: string) => void
  setCustomName: (id: string, name: string) => void
  setMemo    : (v: string) => void
  addTempItem: () => void
  removeTempItem: (id: string) => void
  onSubmit   : () => void
  busy       : boolean
}) {
  const icon  = CAT_ICONS[cat] || '📦'
  const filledCount = products.filter((p) => {
    const st = orderState[p.id]
    return st && (st.status || st.qty)
  }).length

  return (
    <div>
      <BackBar onBack={onBack} title={`${icon} ${cat}`} />

      <div style={{ background: 'white' }}>
        {products.map((p) => {
          const st = orderState[p.id] || { status: null, qty: '', customName: '' }
          return (
            <ItemRow key={p.id}
              name={p.productName}
              unit={p.unit}
              status={st.status}
              qty={st.qty}
              onSetStatus={(s) => setStatus(p.id, s)}
              onSetQty={(q) => setQty(p.id, q)}
            />
          )
        })}

        {tempIds.map((id) => {
          const st = orderState[id] || { status: null, qty: '', customName: '' }
          return (
            <ItemRow key={id}
              name=""
              customName={st.customName}
              onSetCustomName={(n) => setCustomName(id, n)}
              hint="追加商品"
              unit="個"
              status={st.status}
              qty={st.qty}
              onSetStatus={(s) => setStatus(id, s)}
              onSetQty={(q) => setQty(id, q)}
              onDelete={() => removeTempItem(id)}
            />
          )
        })}

        <div style={{ padding: '12px 16px', borderTop: '1px solid #F5F1EA' }}>
          <button onClick={addTempItem} style={{
            width: '100%', padding: '10px',
            border: '1.5px dashed #E5E1D8', borderRadius: '10px',
            background: 'white', color: '#2C2C2A', fontSize: '20px',
            fontFamily: 'inherit', cursor: 'pointer',
          }}>＋ 商品を追加する</button>
        </div>

        <div style={{
          padding: '12px 16px', borderTop: '2px solid #F0ECE3',
          marginBottom: '100px',
        }}>
          <div style={{ fontSize: '16px', color: '#2C2C2A', fontWeight: 500, marginBottom: '6px' }}>
            📝 注文欄（メモ）
          </div>
          <textarea
            value={memoByCat[cat] || ''}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            placeholder="例: そんさん→キャベツ1ケース"
            style={{
              width: '100%', padding: '10px',
              border: '1.5px solid #E5E1D8', borderRadius: '10px',
              fontSize: '16px', fontFamily: 'inherit',
              resize: 'none', background: 'white', color: '#2C2C2A',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <FooterBar
        progress={`入力済み: ${filledCount} / ${products.length} 品目`}
        deadline="締切:17:00"
        buttonLabel={busy ? '送信中...' : `${icon} ${cat}を送信する`}
        onClick={onSubmit}
        disabled={busy}
      />
    </div>
  )
}

function ItemRow({
  name, customName, onSetCustomName,
  hint, unit, status, qty,
  onSetStatus, onSetQty, onDelete,
}: {
  name           : string
  customName?    : string
  onSetCustomName?: (v: string) => void
  hint?          : string
  unit           : string
  status         : string | null
  qty            : string
  onSetStatus    : (s: string) => void
  onSetQty       : (q: string) => void
  onDelete?      : () => void
}) {
  const marks: string[] = ['〇', '△', '×']
  const classOn: Record<string, { bg: string; bd: string; cl: string }> = {
    '〇': { bg: '#EAF3DE', bd: '#639922', cl: '#3B6D11' },
    '△': { bg: '#FAEEDA', bd: '#EF9F27', cl: '#854F0B' },
    '×': { bg: '#FCEBEB', bd: '#E24B4A', cl: '#A32D2D' },
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 16px', borderBottom: '1px solid #F5F1EA',
      position: 'relative',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {onSetCustomName ? (
          <input
            value={customName ?? ''}
            onChange={(e) => onSetCustomName(e.target.value)}
            placeholder="商品名を入力"
            style={{
              width: '100%', padding: '6px 8px',
              border: '1.5px solid #E5E1D8', borderRadius: '8px',
              fontSize: '20px', fontFamily: 'inherit',
            }} />
        ) : (
          <div style={{ fontSize: '20px', fontWeight: 500, marginBottom: '2px' }}>{name}</div>
        )}
        {hint && (
          <div style={{ fontSize: '11px', color: '#A8A69E', marginTop: '2px' }}>{hint}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {marks.map((m) => {
            const on = status === m
            const c  = classOn[m]
            return (
              <button key={m} onClick={() => onSetStatus(m)} style={{
                width: '38px', height: '38px', borderRadius: '10px',
                border: '1.5px solid', borderColor: on ? c.bd : '#E5E1D8',
                background: on ? c.bg : 'white',
                color: on ? c.cl : '#B4B2A9',
                fontSize: '17px', cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{m}</button>
            )
          })}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '3px',
          marginLeft: '6px', paddingLeft: '10px',
          borderLeft: '1.5px solid #F0ECE3',
        }}>
          <input
            type="number" min="0" max="999" value={qty}
            onChange={(e) => onSetQty(e.target.value)}
            placeholder="残数"
            style={{
              width: '48px', height: '38px',
              border: '1.5px solid #E5E1D8', borderRadius: '10px',
              textAlign: 'center', fontSize: '16px', fontWeight: 500,
              fontFamily: 'inherit', background: 'white', color: '#2C2C2A',
            }} />
          <span style={{ fontSize: '11px', color: '#888780', minWidth: '20px' }}>{unit}</span>
        </div>
      </div>
      {onDelete && (
        <button onClick={onDelete} style={{
          position: 'absolute', top: '8px', right: '8px',
          width: '24px', height: '24px', borderRadius: '50%',
          border: '1.5px solid #E5E1D8', background: 'white',
          fontSize: '12px', cursor: 'pointer', color: '#888780',
        }}>✕</button>
      )}
    </div>
  )
}

function BackBar({ onBack, title, backLabel = '← カテゴリ一覧' }: {
  onBack: () => void; title: string; backLabel?: string
}) {
  return (
    <div style={{
      background: 'white', borderBottom: '1px solid #F0ECE3',
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px',
      position: 'sticky', top: 74, zIndex: 9,
    }}>
      <button onClick={onBack} style={{
        padding: '6px 12px', border: '1.5px solid #E5E1D8',
        borderRadius: '8px', background: 'white', fontSize: '16px',
        fontFamily: 'inherit', cursor: 'pointer', color: '#2C2C2A',
      }}>{backLabel}</button>
      <span style={{ fontSize: '18px', fontWeight: 500 }}>{title}</span>
    </div>
  )
}

function WeeklyScreen({
  authFetch, branch, onBack,
}: {
  authFetch: AuthFetch
  branch   : string
  onBack   : () => void
}) {
  const [data, setData]     = useState<Record<string, BranchOrder[]>>({})
  const [memos, setMemos]   = useState<Record<string, Record<string, string>>>({}) // dateStr → cat → memo
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState<string | null>(null)

  const weekDays = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
    const out: { date: Date; dateStr: string; label: string; isToday: boolean }[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const yyyy = d.getFullYear()
      const mm   = String(d.getMonth() + 1).padStart(2, '0')
      const dd   = String(d.getDate()).padStart(2, '0')
      out.push({
        date   : d,
        dateStr: `${yyyy}-${mm}-${dd}`,
        label  : ['月','火','水','木','金','土'][i],
        isToday: d.getTime() === today.getTime(),
      })
    }
    return out
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      const from = weekDays[0]?.dateStr
      const to   = weekDays[weekDays.length - 1]?.dateStr
      try {
        const res  = await authFetch(`/api/daily-orders?branch=${branch}&from=${from}&to=${to}`)
        const json = await res.json()
        if (cancelled) return

        const dataMap : Record<string, BranchOrder[]>         = {}
        const memosMap: Record<string, Record<string, string>> = {}

        const days = json.days as Record<string, {
          orders: {
            productId: number | string
            product?: { productName?: string; category?: string; unit?: string }
            status  : string | null
            requestQty: number | null
          }[]
          memos: { category: string; memo: string }[]
        }> | undefined

        if (days) {
          Object.entries(days).forEach(([dateStr, day]) => {
            dataMap[dateStr] = day.orders.map((o) => ({
              productId  : o.productId,
              productName: o.product?.productName ?? '(不明)',
              category   : o.product?.category    ?? '',
              unit       : o.product?.unit        ?? '',
              status     : o.status || '―',
              qty        : Number(o.requestQty) || 0,
            }))
            const memoMap: Record<string, string> = {}
            day.memos.forEach((m) => { memoMap[m.category] = m.memo })
            memosMap[dateStr] = memoMap
          })
        }

        setData(dataMap)
        setMemos(memosMap)
      } catch {
        if (!cancelled) { setData({}); setMemos({}) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [authFetch, branch, weekDays])

  const catIcons: Record<string, string> = {
    '野菜': '🥬', '果物': '🍎', '餅・乾物菓子類': '🍘',
  }

  // 商品をカテゴリ別に整理
  const productByCat = new Map<string, Map<number | string, { name: string; unit: string }>>()
  Object.values(data).forEach((orders) => {
    orders.forEach((o) => {
      if (!productByCat.has(o.category)) productByCat.set(o.category, new Map())
      const inner = productByCat.get(o.category)!
      if (!inner.has(o.productId)) inner.set(o.productId, { name: o.productName, unit: o.unit })
    })
  })

  const categories = Array.from(productByCat.keys())
  const currentCat = activeCat && productByCat.has(activeCat) ? activeCat : (categories[0] ?? null)
  const currentProducts = currentCat ? productByCat.get(currentCat) : undefined

  const statusStyle = (status: string | null | undefined): { bg: string; fg: string } => {
    if (status === '〇') return { bg: '#FCEBEB', fg: '#A32D2D' }
    if (status === '△') return { bg: '#FAEEDA', fg: '#854F0B' }
    if (status === '×') return { bg: '#EAF3DE', fg: '#3B6D11' }
    return { bg: '#FAFAFA', fg: '#C0BDB8' }
  }

  const monday   = weekDays[0]?.date
  const saturday = weekDays[weekDays.length - 1]?.date
  const rangeText = monday && saturday
    ? `${monday.getMonth()+1}月${monday.getDate()}日 〜 ${saturday.getMonth()+1}月${saturday.getDate()}日`
    : ''

  return (
    <div>
      <BackBar onBack={onBack} title="📊 週間表示" />
      <div style={{ padding: '14px 16px', paddingBottom: '40px' }}>
        <div style={{ fontSize: '13px', color: '#888780', marginBottom: '12px' }}>{rangeText}</div>

        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
            読み込み中...
          </div>
        )}

        {!loading && productByCat.size === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888780', fontSize: '14px' }}>
            この週の発注データはありません
          </div>
        )}

        {!loading && categories.length > 1 && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'10px' }}>
            {categories.map((cat) => {
              const isActive = cat === currentCat
              return (
                <button key={cat} onClick={() => setActiveCat(cat)}
                  style={{
                    padding:'8px 14px', borderRadius:'20px', fontSize:'14px',
                    fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                    border: isActive ? '1.5px solid #3B6D11' : '1.5px solid #E5E1D8',
                    background: isActive ? '#3B6D11' : 'white',
                    color    : isActive ? 'white'   : '#2C2C2A',
                  }}>
                  {(catIcons[cat] || '📦') + ' ' + cat}
                </button>
              )
            })}
          </div>
        )}

        {!loading && currentCat && currentProducts && (
          <div style={{
            background:'white', borderRadius:'14px', overflow:'hidden',
            boxShadow:'0 2px 8px rgba(0,0,0,.04)', marginBottom:'14px',
          }}>
            <div style={{
              padding:'12px 16px', borderBottom:'1px solid #F0ECE3',
              fontWeight:500, fontSize:'16px',
            }}>
              {(catIcons[currentCat] || '📦') + ' ' + currentCat}
              <span style={{ marginLeft:'8px', fontSize:'12px', color:'#888780', fontWeight:400 }}>
                （{currentProducts.size}品）
              </span>
            </div>

            <div style={{ overflowX:'auto' }}>
              <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'480px' }}>
                <thead>
                  <tr>
                    <th style={{
                      padding:'8px 10px', textAlign:'left', fontSize:'13px',
                      color:'#888780', background:'#FAF8F3',
                      borderBottom:'1.5px solid #F0ECE3', minWidth:'110px',
                    }}>商品</th>
                    {weekDays.map((wd) => (
                      <th key={wd.dateStr} style={{
                        padding:'8px 4px', fontSize:'12px',
                        color: wd.isToday ? '#1A5276' : '#888780',
                        background: wd.isToday ? '#EBF5FB' : '#FAF8F3',
                        borderBottom:'1.5px solid #F0ECE3', textAlign:'center',
                        whiteSpace:'nowrap',
                      }}>
                        <div style={{ fontSize:'14px', fontWeight:500 }}>{wd.label}</div>
                        <div style={{ fontSize:'12px' }}>{wd.date.getMonth()+1}/{wd.date.getDate()}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(currentProducts.entries()).map(([pid, info]) => (
                    <tr key={pid}>
                      <td style={{
                        padding:'8px 10px', fontWeight:500, fontSize:'16px',
                        borderBottom:'1px solid #F5F1EA', whiteSpace:'nowrap',
                      }}>{info.name}</td>
                      {weekDays.map((wd) => {
                        const order = (data[wd.dateStr] ?? []).find((o) => o.productId === pid)
                        const status = order?.status ?? '―'
                        const qty    = Number(order?.qty) || 0
                        const style  = statusStyle(status)
                        const text   = status === '―' ? '—'
                          : status + (qty > 0 ? ` ${qty}` : '')
                        return (
                          <td key={wd.dateStr} style={{
                            padding:'6px 4px', borderBottom:'1px solid #F5F1EA',
                            borderRight:'1px solid #F5F1EA', textAlign:'center',
                          }}>
                            <span style={{
                              display:'inline-block', padding:'4px 10px',
                              borderRadius:'4px', fontSize:'18px', fontWeight:500,
                              background: style.bg, color: style.fg, minWidth:'42px',
                            }}>{text}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* メモ行 */}
            {weekDays.some((wd) => memos[wd.dateStr]?.[currentCat]) && (
              <div style={{ padding:'10px 16px', background:'#FFFBF0' }}>
                {weekDays.map((wd) => {
                  const memo = memos[wd.dateStr]?.[currentCat]
                  if (!memo) return null
                  return (
                    <div key={wd.dateStr} style={{
                      display:'flex', gap:'10px', alignItems:'flex-start',
                      padding:'4px 0', fontSize:'13px',
                    }}>
                      <span style={{ color:'#888780', minWidth:'48px' }}>
                        {wd.date.getMonth()+1}/{wd.date.getDate()}({wd.label})
                      </span>
                      <span style={{ color:'#2C2C2A', flex:1, whiteSpace:'pre-wrap' }}>📝 {memo}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!loading && (
          <div style={{
            display:'flex', gap:'14px', flexWrap:'wrap',
            padding:'8px 4px', fontSize:'12px', color:'#888780',
          }}>
            <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
              <span style={{ padding:'2px 8px', borderRadius:'4px',
                background:'#FCEBEB', color:'#A32D2D', fontWeight:500 }}>〇</span>
              在庫なし
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
              <span style={{ padding:'2px 8px', borderRadius:'4px',
                background:'#FAEEDA', color:'#854F0B', fontWeight:500 }}>△</span>
              残り少ない
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
              <span style={{ padding:'2px 8px', borderRadius:'4px',
                background:'#EAF3DE', color:'#3B6D11', fontWeight:500 }}>×</span>
              在庫あり
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function FooterBar({
  progress, deadline, buttonLabel, onClick, disabled,
}: { progress: string; deadline: string; buttonLabel: string; onClick: () => void; disabled: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'white', borderTop: '1px solid #F0ECE3',
      padding: '12px 16px 20px', zIndex: 10,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '12px', color: '#888780', marginBottom: '10px',
      }}>
        <span>{progress}</span>
        <span>{deadline}</span>
      </div>
      <button onClick={onClick} disabled={disabled} style={{
        width: '100%', padding: '15px',
        border: 'none', background: disabled ? '#888780' : '#2C2C2A',
        color: 'white', fontSize: '20px', fontWeight: 500,
        borderRadius: '13px', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
      }}>{buttonLabel}</button>
    </div>
  )
}

function SalesScreen({
  sales, setSales, onBack, onSubmit, busy,
}: {
  sales   : SalesData
  setSales: (s: SalesData) => void
  onBack  : () => void
  onSubmit: () => void
  busy    : boolean
}) {
  const upd = (k: keyof SalesData, v: string) => setSales({ ...sales, [k]: v })
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px',
    border: '1.5px solid #E5E1D8', borderRadius: '8px',
    fontSize: '20px', fontFamily: 'inherit',
    background: 'white', color: '#2C2C2A', textAlign: 'right',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '14px', color: '#2C2C2A', marginBottom: '4px',
  }
  return (
    <div>
      <BackBar onBack={onBack} title="💰 本日の実績入力" />

      <div style={{ padding: '16px', paddingBottom: '100px' }}>
        <div style={{
          background: 'white', borderRadius: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,.04)', padding: '16px',
        }}>
          <div style={{ fontSize: '12px', color: '#888780', fontWeight: 500, marginBottom: '8px' }}>売上</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {(['amount', 'souzai', 'mochi', 'hana'] as const).map((k) => (
              <div key={k}>
                <div style={labelStyle}>
                  {k === 'amount' ? '売上金額' :
                   k === 'souzai' ? '惣菜売上' :
                   k === 'mochi'  ? '餅売上'   : '花売上'}
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: '10px', top: '50%',
                    transform: 'translateY(-50%)', color: '#888780', pointerEvents: 'none',
                  }}>¥</span>
                  <input type="number" inputMode="numeric"
                    value={sales[k]} onChange={(e) => upd(k, e.target.value)}
                    style={{ ...inputStyle, paddingLeft: '24px' }} placeholder="0" />
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '12px', color: '#888780', fontWeight: 500, marginBottom: '8px' }}>人数</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <div style={labelStyle}>客数</div>
              <input type="number" inputMode="numeric"
                value={sales.customerCount}
                onChange={(e) => upd('customerCount', e.target.value)}
                style={inputStyle} placeholder="0" />
            </div>
            <div>
              <div style={labelStyle}>出勤前半</div>
              <select value={sales.staffMorning}
                onChange={(e) => upd('staffMorning', e.target.value)}
                style={{ ...inputStyle, textAlign: 'left' }}>
                <option value="">-</option>
                {STAFF_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>出勤後半</div>
              <select value={sales.staffAfternoon}
                onChange={(e) => upd('staffAfternoon', e.target.value)}
                style={{ ...inputStyle, textAlign: 'left' }}>
                <option value="">-</option>
                {STAFF_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <FooterBar
        progress=""
        deadline=""
        buttonLabel={busy ? '登録中...' : '実績を登録する'}
        onClick={onSubmit}
        disabled={busy}
      />
    </div>
  )
}

function SubmittedScreen({
  cat, info, isSales, onBack, onEdit,
}: {
  cat    : string
  info   : SentCategory
  isSales: boolean
  onBack : () => void
  onEdit : () => void
}) {
  const icon = CAT_ICONS[cat] || '📦'
  const statusColors: Record<string, string> = {
    '〇': '#EAF3DE', '△': '#FAEEDA', '×': '#FCEBEB', '―': '#F5F1EA',
  }
  const statusText: Record<string, string> = {
    '〇': '在庫なし', '△': '残り少ない', '×': '在庫あり', '―': '未入力',
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{
        background: '#EAF3DE', borderRadius: '12px', padding: '14px',
        marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '24px' }}>✅</span>
        <div>
          <div style={{ fontWeight: 500, fontSize: '14px' }}>
            {icon} {cat}{isSales ? ' 登録完了' : ' 送信完了しました'}
          </div>
          <div style={{ fontSize: '12px', color: '#5F5E5A' }}>
            {info.submittedAt
              ? '送信時刻: ' + info.submittedAt
              : (isSales ? '登録済み' : '送信済み')}
          </div>
        </div>
      </div>

      <div style={{
        background: 'white', borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,.04)', marginBottom: '16px',
      }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid #F0ECE3',
          fontWeight: 500, fontSize: '13px',
        }}>登録内容</div>

        <div style={{ padding: '8px 0' }}>
          {info.orders.map((o, i) => {
            if (isSales) {
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 16px', borderBottom: '1px solid #F5F1EA', fontSize: '14px',
                }}>
                  <span style={{ color: '#888780' }}>{o.productName}</span>
                  <span style={{ fontWeight: 500 }}>{o.status}</span>
                </div>
              )
            }
            if (o.status === 'MEMO') {
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start',
                  padding: '10px 16px', borderBottom: '1px solid #F5F1EA',
                  whiteSpace: 'pre-wrap',
                }}>
                  <span style={{ fontSize: '12px', color: '#888780', marginRight: '8px' }}>📝</span>
                  <span style={{ fontSize: '13px', color: '#2C2C2A', flex: 1 }}>{o.productName}</span>
                </div>
              )
            }
            const s = o.status || '―'
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderBottom: '1px solid #F5F1EA',
              }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>{o.productName}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: '20px', fontSize: '12px',
                    fontWeight: 500, background: statusColors[s] ?? '#F5F1EA',
                  }}>{s} {statusText[s] || ''}</span>
                  {Number(o.qty) > 0 && (
                    <span style={{ fontSize: '13px', color: '#3B6D11', fontWeight: 500 }}>
                      {o.qty}{o.unit}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <button onClick={onEdit} style={{
        width: '100%', padding: '15px',
        border: '1.5px solid #E5E1D8', background: 'white',
        color: '#2C2C2A', fontSize: '15px', fontWeight: 500,
        borderRadius: '13px', cursor: 'pointer',
        fontFamily: 'inherit', marginBottom: '10px',
      }}>✏️ 修正する</button>

      <button onClick={onBack} style={{
        width: '100%', padding: '15px',
        border: 'none', background: '#3B6D11',
        color: 'white', fontSize: '15px', fontWeight: 500,
        borderRadius: '13px', cursor: 'pointer',
        fontFamily: 'inherit',
      }}>← カテゴリ一覧に戻る</button>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: FONT_STACK,
    }}>{children}</div>
  )
}

function ErrorBox({ msg, onBack }: { msg: string; onBack: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: FONT_STACK, background: '#F5F1EA',
    }}>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '40px',
        textAlign: 'center', maxWidth: '320px',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
        <p style={{ fontSize: '16px', fontWeight: 500, color: '#E24B4A', marginBottom: '24px' }}>
          {msg}
        </p>
        <button onClick={onBack} style={{
          padding: '12px 24px', background: '#3B6D11', color: 'white',
          border: 'none', borderRadius: '10px', fontSize: '14px',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>トップに戻る</button>
      </div>
    </div>
  )
}

export default function StoreBranchPage({
  params,
}: {
  params: Promise<{ branch: string }>
}) {
  const { branch } = use(params)
  return (
    <Suspense fallback={<Centered>読み込み中...</Centered>}>
      <StorePageContent branch={branch} />
    </Suspense>
  )
}
