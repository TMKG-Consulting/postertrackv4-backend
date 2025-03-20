/*
  Warnings:

  - Added the required column `uploadedBy` to the `CompetitiveReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CompetitiveReport" ADD COLUMN     "uploadedBy" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "CompetitiveReport" ADD CONSTRAINT "CompetitiveReport_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
