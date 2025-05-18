const { PrismaClient } = require("@prisma/client");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { s3Config, useLocalStorage } = require("../config/s3");
const { ApiError } = require("../utils/errorHandler");
const crypto = require("crypto");

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
 * Validates if the image meets the minimum size/resolution requirementss
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<{isValid: boolean, reason: string|null}>} - Validation result
 */
const validateImageSize = async (imageBuffer) => {
  try {
    const metadata = await sharp(imageBuffer).metadata();

    // Minimum requirements - can be adjusted based on requirements
    const MIN_WIDTH = 400;
    const MIN_HEIGHT = 400;
    const MIN_SIZE_IN_BYTES = 900 * 1024; // 900 KB

    if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
      return {
        isValid: false,
        reason: `Image resolution too low. Minimum required: ${MIN_WIDTH}x${MIN_HEIGHT}px, got: ${metadata.width}x${metadata.height}px`,
      };
    }

    if (imageBuffer.length < MIN_SIZE_IN_BYTES) {
      return {
        isValid: false,
        reason: `Image file size too small. Minimum required: ${
          MIN_SIZE_IN_BYTES / 1024
        }KB, got: ${imageBuffer.length / 1024}KB`,
      };
    }

    return { isValid: true, reason: null };
  } catch (error) {
    console.error("Error validating image size:", error);
    return {
      isValid: false,
      reason: `Failed to validate image: ${error.message}`,
    };
  }
};

/**
 * Generates a perceptual hash (pHash) for an image to detect similar images
 * @param {Buffer} imageBuffer - The image buffer
 * @returns {Promise<string>} - The image hash
 */
const generateImageHash = async (imageBuffer) => {
  try {
    // Resize to small size for comparison and convert to grayscale
    const resizedImage = await sharp(imageBuffer)
      .resize(32, 32, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();

    // Calculate the average color value
    let sum = 0;
    for (let i = 0; i < resizedImage.length; i++) {
      sum += resizedImage[i];
    }
    const avg = sum / resizedImage.length;

    // Create a binary hash based on whether each pixel is above or below average
    let binaryHash = "";
    for (let i = 0; i < resizedImage.length; i++) {
      binaryHash += resizedImage[i] >= avg ? "1" : "0";
    }

    // Convert to hexadecimal for storage efficiency
    const hashBuffer = Buffer.from(
      binaryHash
        .match(/.{1,8}/g)
        .map((byte) => parseInt(byte, 2).toString(16).padStart(2, "0"))
        .join(""),
      "hex"
    );

    return crypto.createHash("md5").update(hashBuffer).digest("hex");
  } catch (error) {
    console.error("Error generating image hash:", error);
    throw new Error(`Failed to generate image hash: ${error.message}`);
  }
};

/**
 * Checks if the image is too similar to existing ones
 * @param {string} hash - The perceptual hash of the image
 * @param {string} excludeId - ID of the image to exclude from comparison
 * @returns {Promise<{isDuplicate: boolean, similarImage: object|null}>} - Check result
 */
const checkDuplicateImage = async (hash, excludeId = null) => {
  try {
    // Find all processed images
    const processedImages = await prisma.image.findMany({
      where: {
        status: "PROCESSED",
        metaData: {
          path: ["pHash"],
          not: null,
        },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: {
        id: true,
        originalName: true,
        metaData: true,
      },
    });

    // Calculate Hamming distance for each existing image
    // For perceptual hashes, lower hamming distance = more similarity
    const SIMILARITY_THRESHOLD = 5; // Adjust based on sensitivity needed

    let isDuplicate = false;
    let similarImage = null;

    for (const image of processedImages) {
      if (image.metaData?.pHash) {
        const existingHash = image.metaData.pHash;

        // Simplified hamming distance comparison for hex strings
        let distance = 0;
        const hexToBinary = (hex) => {
          return hex
            .split("")
            .map((h) => parseInt(h, 16).toString(2).padStart(4, "0"))
            .join("");
        };

        const binary1 = hexToBinary(hash);
        const binary2 = hexToBinary(existingHash);

        for (let i = 0; i < Math.min(binary1.length, binary2.length); i++) {
          if (binary1[i] !== binary2[i]) distance++;
        }

        if (distance <= SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          similarImage = image;
          break;
        }
      }
    }

    return { isDuplicate, similarImage };
  } catch (error) {
    console.error("Error checking for duplicate images:", error);
    throw new Error(`Failed to check for duplicates: ${error.message}`);
  }
};

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
 * Process an image
 * @param {string} imageId - The image ID
 * @returns {Promise<object>} - The processed image
 */
const processImage = async (imageId) => {
  let image = await prisma.image.findUnique({
    where: { id: imageId },
  });

  if (!image) {
    throw new ApiError(404, "Image not found");
  }

  // Only process images with PENDING status
  if (image.status !== "PENDING") {
    console.log(`Skipping image ${imageId} with status ${image.status}`);
    return image;
  }

  try {
    // Update status to PROCESSING
    await prisma.image.update({
      where: { id: imageId },
      data: {
        status: "PROCESSING",
      },
    });

    let imageBuffer;
    if (useLocalStorage) {
      // Local file system
      const filePath = path.join(process.cwd(), image.originalPath);
      imageBuffer = fs.readFileSync(filePath);
    } else {
      // S3 bucket
      if (!bucketName) {
        throw new Error("S3 bucket name not configured");
      }

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: image.originalPath,
      });
      const response = await s3.send(command);
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      imageBuffer = Buffer.concat(chunks);
    }

    // Validate image size
    const sizeValidation = await validateImageSize(imageBuffer);
    if (!sizeValidation.isValid) {
      await prisma.image.update({
        where: { id: imageId },
        data: {
          status: "REJECTED",
          metaData: {
            rejectionReason: sizeValidation.reason,
          },
        },
      });
      return image;
    }

    // Generate hash and check for duplicates
    const imageHash = await generateImageHash(imageBuffer);
    const { isDuplicate, similarImage } = await checkDuplicateImage(
      imageHash,
      imageId
    );

    if (isDuplicate) {
      await prisma.image.update({
        where: { id: imageId },
        data: {
          status: "REJECTED",
          metaData: {
            rejectionReason: `Duplicate of image: ${similarImage.id} (${similarImage.originalName})`,
            pHash: imageHash,
            similarTo: similarImage.id,
          },
        },
      });
      return image;
    }

    // Process the image (example: resize, optimize, etc.)
    const processedImageBuffer = await sharp(imageBuffer)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Get metadata for the processed image
    const metadata = await sharp(processedImageBuffer).metadata();

    // Save processed image
    let processedPath;
    if (useLocalStorage) {
      // For local storage
      const dirPath = path.join(process.cwd(), "uploads/processed");
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const filename = `${
        path.parse(image.originalName).name
      }-processed${path.extname(image.originalName)}`;
      processedPath = `uploads/processed/${filename}`;
      fs.writeFileSync(
        path.join(process.cwd(), processedPath),
        processedImageBuffer
      );
    } else {
      // For S3 storage
      if (!bucketName) {
        throw new Error("S3 bucket name not configured");
      }

      const key = `processed/${
        path.parse(image.originalPath).name
      }-${Date.now()}${path.extname(image.originalPath)}`;
      processedPath = key;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: processedImageBuffer,
          ContentType: `image/${metadata.format}`,
        })
      );
    }

    // Update the image record with the processed information
    image = await prisma.image.update({
      where: { id: imageId },
      data: {
        processedPath,
        processedSize: processedImageBuffer.length,
        status: "PROCESSED",
        metaData: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          pHash: imageHash,
          processingTime: new Date().toISOString(),
        },
      },
    });

    return image;
  } catch (error) {
    console.error(`Error processing image ${imageId}:`, error);

    // Update the image status to ERROR
    await prisma.image.update({
      where: { id: imageId },
      data: {
        status: "ERROR",
        metaData: {
          error: error.message,
        },
      },
    });

    throw error;
  }
};

/**
 * Delete an image and its files
 * @param {string} imageId - The image ID
 * @returns {Promise<void>}
 */
const deleteImage = async (imageId) => {
  const image = await prisma.image.findUnique({
    where: { id: imageId },
  });

  if (!image) {
    throw new ApiError(404, "Image not found");
  }

  // Delete files
  if (useLocalStorage) {
    // Local file system
    if (image.originalPath) {
      const originalPath = path.join(process.cwd(), image.originalPath);
      if (fs.existsSync(originalPath)) {
        fs.unlinkSync(originalPath);
      }
    }

    if (image.processedPath) {
      const processedPath = path.join(process.cwd(), image.processedPath);
      if (fs.existsSync(processedPath)) {
        fs.unlinkSync(processedPath);
      }
    }
  } else {
    // S3 bucket
    if (!bucketName) {
      console.warn("S3 bucket name not configured, skipping S3 file deletion");
      // Continue to delete the database record even if S3 operations fail
    } else {
      if (image.originalPath) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: image.originalPath,
          })
        );
      }

      if (image.processedPath) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: image.processedPath,
          })
        );
      }
    }
  }

  // Delete database record
  await prisma.image.delete({
    where: { id: imageId },
  });
};

module.exports = {
  processImage,
  getImageUrl,
  deleteImage,
  validateImageSize,
  checkDuplicateImage,
  generateImageHash,
};
