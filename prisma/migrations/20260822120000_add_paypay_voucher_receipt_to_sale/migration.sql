-- AlterTable
ALTER TABLE "dx"."Sale"
  ADD COLUMN "paypayAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "premiumVoucherAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "receiptImageUrl" TEXT;
