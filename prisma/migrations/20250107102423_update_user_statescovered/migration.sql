/*
  Warnings:

  - You are about to drop the column `industry` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `statesCovered` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "industry",
DROP COLUMN "statesCovered",
ADD COLUMN     "industryId" INTEGER;

-- CreateTable
CREATE TABLE "_UserStates" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_UserStates_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_UserStates_B_index" ON "_UserStates"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserStates" ADD CONSTRAINT "_UserStates_A_fkey" FOREIGN KEY ("A") REFERENCES "State"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserStates" ADD CONSTRAINT "_UserStates_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
