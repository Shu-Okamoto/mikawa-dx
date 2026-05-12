const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const pg = require('pg')
require('dotenv/config')

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const nishi = await prisma.store.upsert({
    where: { storeCode: 'nishi' },
    update: {},
    create: { storeCode: 'nishi', storeName: '西店' },
  })
  const minami = await prisma.store.upsert({
    where: { storeCode: 'minami' },
    update: {},
    create: { storeCode: 'minami', storeName: '南店' },
  })
  const honbu = await prisma.store.upsert({
    where: { storeCode: 'honbu' },
    update: {},
    create: { storeCode: 'honbu', storeName: '本部' },
  })
  console.log('店舗マスタ投入完了:', { nishi, minami, honbu })

  // 業者マスタ
  const vendor1 = await prisma.vendor.upsert({
    where: { vendorCode: 'V001' },
    update: {},
    create: { vendorCode: 'V001', vendorName: '廣印青果', category: '野菜' },
  })
  const vendor2 = await prisma.vendor.upsert({
    where: { vendorCode: 'V002' },
    update: {},
    create: { vendorCode: 'V002', vendorName: '田中青果', category: '果物' },
  })
  console.log('業者マスタ投入完了:', { vendor1, vendor2 })

  // ユーザーマスタ
  const users = [
    { email: 'nishi@satonoaji-mikawa.net',       name: '西店スタッフ', role: 'store',    storeId: nishi.id,  category: null },
    { email: 'minami@satonoaji-mikawa.net',      name: '南店スタッフ', role: 'store',    storeId: minami.id, category: null },
    { email: 'hq-veg@satonoaji-mikawa.net',      name: '野菜担当',     role: 'hq',       storeId: honbu.id,  category: '野菜' },
    { email: 'hq-fruit@satonoaji-mikawa.net',    name: '果物担当',     role: 'hq',       storeId: honbu.id,  category: '果物' },
    { email: 'hq-mochi@satonoaji-mikawa.net',    name: '餅・乾物担当', role: 'hq',       storeId: honbu.id,  category: '餅・乾物菓子類' },
    { email: 'boss@satonoaji-mikawa.net',        name: '社長',         role: 'boss',     storeId: honbu.id,  category: null },
    { email: 'order-nishi@satonoaji-mikawa.net', name: '西店スタッフ', role: 'order',    storeId: nishi.id,  category: null },
    { email: 'order-minami@satonoaji-mikawa.net',name: '南店スタッフ', role: 'order',    storeId: minami.id, category: null },
    { email: 'order-honbu@satonoaji-mikawa.net', name: '本部スタッフ', role: 'order',    storeId: honbu.id,  category: null },
    { email: 'calendar@satonoaji-mikawa.net',    name: '弁当担当',     role: 'calendar', storeId: honbu.id,  category: '弁当' },
    { email: 'mochi-cal@satonoaji-mikawa.net',   name: '餅担当',       role: 'calendar', storeId: honbu.id,  category: '餅' },
  ]

  for (const u of users) {
    await prisma.user.upsert({
      where : { email: u.email },
      update: {},
      create: u,
    })
  }
  console.log('ユーザーマスタ投入完了')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })