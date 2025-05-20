-- AlterEnum
ALTER TYPE "ImageStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "metaData" JSONB;
