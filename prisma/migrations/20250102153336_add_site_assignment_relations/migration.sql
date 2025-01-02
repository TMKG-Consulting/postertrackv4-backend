-- CreateTable
CREATE TABLE "SiteAssignment" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "siteCode" TEXT NOT NULL,
    "fieldAuditorId" INTEGER NOT NULL,

    CONSTRAINT "SiteAssignment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_fieldAuditorId_fkey" FOREIGN KEY ("fieldAuditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
