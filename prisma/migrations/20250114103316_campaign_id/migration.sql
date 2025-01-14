/*
  Warnings:

  - A unique constraint covering the columns `[campaignID]` on the table `Campaign` will be added. If there are existing duplicate values, this will fail.
  - The required column `campaignID` was added to the `Campaign` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "campaignID" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_campaignID_key" ON "Campaign"("campaignID");
