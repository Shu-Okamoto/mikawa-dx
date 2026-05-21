import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma CLI（migrate / db push / introspect）は pgbouncer 経由だと
    // prepared statement で失敗するため direct connection を使う。
    // ランタイム（lib/prisma.ts の Pool）は DATABASE_URL = pooler を使う。
    url: env("DIRECT_URL"),
  },
});