-- CreateTable
CREATE TABLE "AdvertiserCategory" (
    "advertiserId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "AdvertiserCategory_pkey" PRIMARY KEY ("advertiserId","categoryId")
);

-- AddForeignKey
ALTER TABLE "AdvertiserCategory" ADD CONSTRAINT "AdvertiserCategory_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserCategory" ADD CONSTRAINT "AdvertiserCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
