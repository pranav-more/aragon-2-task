-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "originalPath" TEXT NOT NULL,
    "processedName" TEXT,
    "processedSize" INTEGER,
    "processedPath" TEXT,
    "fileType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "ImageStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);
