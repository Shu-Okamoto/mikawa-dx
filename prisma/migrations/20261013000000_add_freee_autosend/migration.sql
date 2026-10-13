-- freee への自動送信設定

-- CreateTable
CREATE TABLE "dx"."FreeeAutoSend" (
    "id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendSales" BOOLEAN NOT NULL DEFAULT true,
    "sendReceipts" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeeAutoSend_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "dx"."FreeeAutoSend" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "dx"."FreeeAutoSend" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "dx"."FreeeAutoSend" FROM authenticated;
  END IF;
END $$;
