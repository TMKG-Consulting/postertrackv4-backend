-- AlterTable
ALTER TABLE "User" ALTER COLUMN "profilePicture" SET DEFAULT 'https://storage.googleapis.com/highcrown-bucket-images/user.png',
ALTER COLUMN "updatedAt" DROP DEFAULT;
