-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "dx";

-- CreateTable
CREATE TABLE "dx"."Store" (
    "id" SERIAL NOT NULL,
    "storeCode" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."Vendor" (
    "id" SERIAL NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "category" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."Product" (
    "id" SERIAL NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "weeklyAvg" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vendorId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."OrderProduct" (
    "id" SERIAL NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "availableDays" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "lateOrderOk" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."User" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "storeId" INTEGER,
    "category" TEXT,
    "lineUserId" TEXT,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."DailyOrder" (
    "id" SERIAL NOT NULL,
    "orderDate" DATE NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "status" TEXT,
    "requestQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "requestQtyText" TEXT,
    "inputUser" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."ConfirmedOrder" (
    "id" SERIAL NOT NULL,
    "confirmDate" DATE NOT NULL,
    "productId" INTEGER NOT NULL,
    "category" TEXT,
    "storeAQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "storeBQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "storeCQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adjustedQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vendorId" INTEGER,
    "isSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."InstoreOrder" (
    "id" SERIAL NOT NULL,
    "orderCode" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" INTEGER,
    "productName" TEXT NOT NULL,
    "category" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryTime" TEXT,
    "receipt" TEXT NOT NULL DEFAULT 'no',
    "receiptName" TEXT,
    "purpose" TEXT,
    "okazu" TEXT,
    "notes" TEXT,
    "inputUser" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstoreOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."OrderCategoryMemo" (
    "id" SERIAL NOT NULL,
    "orderDate" DATE NOT NULL,
    "storeId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "inputUser" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCategoryMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dx"."Sale" (
    "id" SERIAL NOT NULL,
    "saleDate" DATE NOT NULL,
    "storeId" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "souzaiAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "mochiAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hanaAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "staffMorning" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "staffAfternoon" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "weather" TEXT,
    "notes" TEXT,
    "inputUser" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_storeCode_key" ON "dx"."Store"("storeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_vendorCode_key" ON "dx"."Vendor"("vendorCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_productCode_key" ON "dx"."Product"("productCode");

-- CreateIndex
CREATE UNIQUE INDEX "OrderProduct_productCode_key" ON "dx"."OrderProduct"("productCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "dx"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_lineUserId_key" ON "dx"."User"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyOrder_orderDate_storeId_productId_key" ON "dx"."DailyOrder"("orderDate", "storeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InstoreOrder_orderCode_key" ON "dx"."InstoreOrder"("orderCode");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCategoryMemo_orderDate_storeId_category_key" ON "dx"."OrderCategoryMemo"("orderDate", "storeId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_saleDate_storeId_key" ON "dx"."Sale"("saleDate", "storeId");

-- AddForeignKey
ALTER TABLE "dx"."Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "dx"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."User" ADD CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "dx"."Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."DailyOrder" ADD CONSTRAINT "DailyOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "dx"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."DailyOrder" ADD CONSTRAINT "DailyOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "dx"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."ConfirmedOrder" ADD CONSTRAINT "ConfirmedOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "dx"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."ConfirmedOrder" ADD CONSTRAINT "ConfirmedOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "dx"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."InstoreOrder" ADD CONSTRAINT "InstoreOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "dx"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."InstoreOrder" ADD CONSTRAINT "InstoreOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "dx"."OrderProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."OrderCategoryMemo" ADD CONSTRAINT "OrderCategoryMemo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "dx"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dx"."Sale" ADD CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "dx"."Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
