/*
  Warnings:

  - Added the required column `siteAssignmentId` to the `ComplianceReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ComplianceReport" ADD COLUMN     "siteAssignmentId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "ComplianceReport" ADD CONSTRAINT "ComplianceReport_siteAssignmentId_fkey" FOREIGN KEY ("siteAssignmentId") REFERENCES "SiteAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
