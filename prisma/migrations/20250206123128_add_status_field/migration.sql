/*
  Warnings:

  - You are about to drop the `CampaignAllocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CampaignAllocation" DROP CONSTRAINT "CampaignAllocation_campaignId_fkey";

-- AlterTable
ALTER TABLE "ComplianceReport" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';

-- DropTable
DROP TABLE "CampaignAllocation";
