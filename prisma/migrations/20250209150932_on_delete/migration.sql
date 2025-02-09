-- DropForeignKey
ALTER TABLE "ComplianceReport" DROP CONSTRAINT "ComplianceReport_siteAssignmentId_fkey";

-- AlterTable
ALTER TABLE "ComplianceReport" ALTER COLUMN "siteAssignmentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ComplianceReport" ADD CONSTRAINT "ComplianceReport_siteAssignmentId_fkey" FOREIGN KEY ("siteAssignmentId") REFERENCES "SiteAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
