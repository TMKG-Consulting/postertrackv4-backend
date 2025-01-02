-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'CHIEF_ACCOUNT_MANAGER', 'ACCOUNT_MANAGER', 'FIELD_AUDITOR', 'CLIENT_AGENCY_USER');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "firstname" TEXT,
    "lastname" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissions" TEXT[],
    "statesCovered" TEXT[],
    "name" TEXT,
    "additionalEmail" TEXT,
    "industry" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
