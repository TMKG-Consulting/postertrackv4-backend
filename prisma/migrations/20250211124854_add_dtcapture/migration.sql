/*
  Warnings:

  - Added the required column `capturedTimestamps` to the `ComplianceReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ComplianceReport" ADD COLUMN     "capturedTimestamps" JSONB NOT NULL;
