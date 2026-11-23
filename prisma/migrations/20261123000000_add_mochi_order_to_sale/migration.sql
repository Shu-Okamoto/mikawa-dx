-- AlterTable
ALTER TABLE "dx"."Sale"
  ADD COLUMN "mochiOrderAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
