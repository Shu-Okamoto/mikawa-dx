const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const pg = require('pg')

const globalForPrisma = globalThis as unknown as { prisma: any }

function createPrismaClient() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma