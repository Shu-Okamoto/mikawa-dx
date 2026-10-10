-- freee(会計)連携用のテーブル

-- CreateTable
CREATE TABLE "dx"."FreeeToken" (
    "id" INTEGER NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT,
    "connectedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeeToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."FreeeReceipt" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "sentBy" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeeReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeeReceipt_path_key" ON "dx"."FreeeReceipt"("path");

-- FreeeToken は OAuth トークンを持つため、PostgREST(Data API)経由で読まれないよう
-- RLS を有効にしてポリシーを一切作らない(= 所有者/スーパーユーザー以外は全拒否)。
-- アプリは postgres ロールで接続しており RLS をバイパスするため、動作に影響はない。
ALTER TABLE "dx"."FreeeToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."FreeeReceipt" ENABLE ROW LEVEL SECURITY;

-- Supabase の匿名/認証ロールが存在する環境では、明示的に権限も剥奪しておく
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "dx"."FreeeToken"   FROM anon;
    REVOKE ALL ON "dx"."FreeeReceipt" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "dx"."FreeeToken"   FROM authenticated;
    REVOKE ALL ON "dx"."FreeeReceipt" FROM authenticated;
  END IF;
END $$;
