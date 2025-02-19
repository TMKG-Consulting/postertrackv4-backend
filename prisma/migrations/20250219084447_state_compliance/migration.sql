/*
  Warnings:

  - Added the required column `state` to the `ComplianceReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ComplianceReport" ADD COLUMN     "state" TEXT NOT NULL;
