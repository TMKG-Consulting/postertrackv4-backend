-- CreateTable
CREATE TABLE "CompetitiveReport" (
    "id" SERIAL NOT NULL,
    "advertiserId" INTEGER NOT NULL,
    "brandId" INTEGER NOT NULL,
    "boardTypeId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "regionId" INTEGER NOT NULL,
    "stateId" INTEGER NOT NULL,
    "cityId" INTEGER NOT NULL,
    "images" TEXT[],
    "longitude" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "captureTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitiveReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "BoardType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardType_name_key" ON "BoardType"("name");

-- AddForeignKey
ALTER TABLE "CompetitiveReport" ADD CONSTRAINT "CompetitiveReport_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveReport" ADD CONSTRAINT "CompetitiveReport_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveReport" ADD CONSTRAINT "CompetitiveReport_boardTypeId_fkey" FOREIGN KEY ("boardTypeId") REFERENCES "BoardType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveReport" ADD CONSTRAINT "CompetitiveReport_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveReport" ADD CONSTRAINT "CompetitiveReport_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveReport" ADD CONSTRAINT "CompetitiveReport_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveReport" ADD CONSTRAINT "CompetitiveReport_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
