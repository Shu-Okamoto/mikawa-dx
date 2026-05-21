import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma CLI（migrate / db push / introspect）は pgbouncer 経由だと
// prepared statement で失敗するため direct connection を使う。
// ランタイム（lib/prisma.ts の Pool）は DATABASE_URL = pooler を使う。
//
// ただし Vercel ビルド時の `prisma generate` には URL は不要。
// DIRECT_URL が未定義のときは datasource を省略してビルドを通す。
const hasDirectUrl = !!process.env.DIRECT_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(hasDirectUrl
    ? { datasource: { url: env("DIRECT_URL") } }
    : {}),
});
