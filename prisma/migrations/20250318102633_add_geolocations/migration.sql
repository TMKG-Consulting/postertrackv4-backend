/*
  Warnings:

  - You are about to drop the column `captureTimestamp` on the `CompetitiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `CompetitiveReport` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `CompetitiveReport` table. All the data in the column will be lost.
  - Added the required column `capturedTimestamps` to the `CompetitiveReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `geolocations` to the `CompetitiveReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CompetitiveReport" DROP COLUMN "captureTimestamp",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
ADD COLUMN     "capturedTimestamps" JSONB NOT NULL,
ADD COLUMN     "geolocations" JSONB NOT NULL;
