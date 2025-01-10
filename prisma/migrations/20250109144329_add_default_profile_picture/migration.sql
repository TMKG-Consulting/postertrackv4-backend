-- AlterTable
ALTER TABLE "User" ALTER COLUMN "profilePicture" SET DEFAULT 'https://storage.googleapis.com/postertrack-bucket-images/user.png',
ALTER COLUMN "updatedAt" DROP DEFAULT;
