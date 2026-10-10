-- freee 連携: 勘定科目マッピングと送信済み売上

-- CreateTable
CREATE TABLE "dx"."FreeeMapping" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "taxCode" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."FreeeJournal" (
    "id" SERIAL NOT NULL,
    "saleDate" DATE NOT NULL,
    "storeCode" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sentBy" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeeJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeeMapping_key_key" ON "dx"."FreeeMapping"("key");
CREATE UNIQUE INDEX "FreeeJournal_saleDate_storeCode_key" ON "dx"."FreeeJournal"("saleDate", "storeCode");

ALTER TABLE "dx"."FreeeMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dx"."FreeeJournal" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "dx"."FreeeMapping" FROM anon;
    REVOKE ALL ON "dx"."FreeeJournal" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "dx"."FreeeMapping" FROM authenticated;
    REVOKE ALL ON "dx"."FreeeJournal" FROM authenticated;
  END IF;
END $$;
