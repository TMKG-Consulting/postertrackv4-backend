-- CreateTable
CREATE TABLE "CampaignAllocation" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "totalSites" INTEGER NOT NULL,
    "totalAuditors" INTEGER NOT NULL,
    "dateUploaded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAllocation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CampaignAllocation" ADD CONSTRAINT "CampaignAllocation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
