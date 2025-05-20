const path = require("path");
const fs = require("fs");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { PrismaClient } = require("@prisma/client");
const { s3Config, useLocalStorage } = require("../../config/s3");
const { ApiError } = require("../../utils/errorHandler");

const prisma = new PrismaClient();

// Get the bucket name from environment variable
const bucketName = process.env.S3_BUCKET_NAME;

// Create S3 client only if using S3 storage
const s3 = !useLocalStorage
  ? new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

/**
 * Gets a signed URL for an image
 * @param {string} imageId - The image ID
 * @param {string} type - The image type (original or processed)
 * @returns {Promise<string>} - The signed URL
 */
const getImageUrl = async (imageId, type = "original") => {
  try {
    const image = await prisma.image.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new ApiError(404, "Image not found");
    }

    const imagePath =
      type === "original" ? image.originalPath : image.processedPath;

    if (!imagePath) {
      throw new ApiError(404, `${type} image not found`);
    }

    // For local storage
    if (useLocalStorage) {
      return `${process.env.APP_URL || "http://localhost:3001"}/${imagePath}`;
    }

    // For S3 storage
    if (!bucketName) {
      console.warn("S3 bucket name not configured, falling back to local URL");
      return `${process.env.APP_URL || "http://localhost:3001"}/fallback-image`;
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: imagePath,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return url;
  } catch (error) {
    console.error(`Error getting ${type} image URL:`, error);
    throw error;
  }
};

/**
 * Delete image files from storage
 * @param {string} originalPath - Path to original image
 * @param {string} processedPath - Path to processed image
 * @returns {Promise<void>}
 */
const deleteImageFiles = async (originalPath, processedPath) => {
  if (useLocalStorage) {
    // Local file system
    if (originalPath) {
      const originalFilePath = path.join(process.cwd(), originalPath);
      if (fs.existsSync(originalFilePath)) {
        fs.unlinkSync(originalFilePath);
      }
    }

    if (processedPath) {
      const processedFilePath = path.join(process.cwd(), processedPath);
      if (fs.existsSync(processedFilePath)) {
        fs.unlinkSync(processedFilePath);
      }
    }
  } else {
    // S3 bucket
    if (!bucketName) {
      console.warn("S3 bucket name not configured, skipping S3 file deletion");
      return;
    }

    if (originalPath) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: originalPath,
        })
      );
    }

    if (processedPath) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: processedPath,
        })
      );
    }
  }
};

/**
 * Retrieve an image buffer from storage
 * @param {string} imagePath - Path to the image
 * @returns {Promise<Buffer>} - The image buffer
 */
const getImageBuffer = async (imagePath) => {
  if (useLocalStorage) {
    // Local file system
    const filePath = path.join(process.cwd(), imagePath);
    return fs.readFileSync(filePath);
  } else {
    // S3
    if (!bucketName) {
      throw new Error("S3 bucket name not configured");
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: imagePath,
    });
    const response = await s3.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
};

/**
 * Save an image to storage
 * @param {Buffer} imageBuffer - The image buffer to save
 * @param {string} filename - Desired filename
 * @param {string} directory - Directory to save in (e.g., "uploads/original" or "uploads/processed")
 * @returns {Promise<string>} - The saved image path
 */
const saveImageToStorage = async (imageBuffer, filename, directory) => {
  if (useLocalStorage) {
    // For local storage
    const dirPath = path.join(process.cwd(), directory);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const imagePath = `${directory}/${filename}`;
    fs.writeFileSync(path.join(process.cwd(), imagePath), imageBuffer);
    return imagePath;
  } else {
    // For S3 storage
    if (!bucketName) {
      throw new Error("S3 bucket name not configured");
    }

    const key = `${directory.replace(/^uploads\//, "")}/${filename}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: imageBuffer,
        ContentType: `image/${path.extname(filename).substring(1)}`,
      })
    );
    return key;
  }
};

module.exports = {
  getImageUrl,
  deleteImageFiles,
  getImageBuffer,
  saveImageToStorage,
};
